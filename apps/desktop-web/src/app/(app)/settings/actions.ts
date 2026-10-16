"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { aiApiKey, BUDGET_SETTING, setActiveProvider } from "@startica/core/ai/client";
import { isProvider as isAiProvider, keyLooksValid, MODELS, modelsFor, PROVIDERS, providerOf, type AiProvider } from "@startica/core/ai/models";
import { generateSetupSql, METRICS_VIEW, randomPassword, readerUrlFrom, savedReaderPassword, setupSpec } from "@startica/core/integrations/product-db-setup";
import { checkReaderConnection } from "@startica/core/metrics/product-db";
import { checkUmami, normalizeUmamiUrl, type UmamiConfig } from "@startica/core/metrics/umami";
import { X_SETTINGS, X_TOKEN_SECRET } from "@startica/core/channels/x";
import { checkBingSite } from "@startica/core/search/bing";
import { parseServiceAccount } from "@startica/core/search/google";
import { checkProperty, normalizeProperty } from "@startica/core/search/search-console";
import { setSetting } from "@startica/db/bootstrap";
import { enqueue } from "@startica/db/queue";
import { aiModels, connections, issueTrackers, products, secrets } from "@startica/db/schema";
import { saveTracker, trackerFor, trackerInput } from "@startica/core/trackers/trackers";
import { deleteSecret, putSecret, readSecret, updateSecret } from "@startica/db/secrets";
import type { ActionResult } from "@/components/app/form-dialog";
import { fail, formFields, id, mutate, productScope } from "@/lib/actions";
import { db, getWorkspace, PRODUCT_COOKIE } from "@/lib/dal";
import { POSTING_SETTINGS, type PostingSettings } from "@/lib/posting";
import { desktopApp, sendToDesktop } from "@/lib/desktop";
import { spawn } from "node:child_process";
import { dataDir } from "@startica/db/paths";

// --- Products ------------------------------------------------------------------

const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  url: z.url("Enter a full URL, e.g. https://example.com"),
  one_liner: z
    .string()
    .trim()
    .transform((v) => v || null),
  stage: z.enum(["idea", "pre_launch", "launched", "growing"]),
});

export async function saveProduct(productId: string | null, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const p = productSchema.parse(formFields(formData));
    const values = { name: p.name, url: p.url, oneLiner: p.one_liner, stage: p.stage };
    if (productId) {
      const scope = await productScope(productId);
      await (await db()).update(products).set(values).where(eq(products.id, scope.productId));
      return;
    }
    const workspace = await getWorkspace();
    const [created] = await (await db()).insert(products).values({ ...values, workspaceId: workspace.id }).returning({ id: products.id });
    // Switch to the new product so Intel opens on it.
    (await cookies()).set(PRODUCT_COOKIE, created!.id, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  });
}

// --- AI ---------------------------------------------------------------------------

const modelSchema = z.object({
  model: z.enum(MODELS.map((m) => m.id) as [string, ...string[]]),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  max_tokens: z.coerce.number().int().min(256).max(64000),
});

export async function saveAiModel(modelId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const workspace = await getWorkspace();
    const m = modelSchema.parse(formFields(formData));
    const [row] = await (await db()).select({ task: aiModels.task }).from(aiModels).where(and(eq(aiModels.id, id.parse(modelId)), eq(aiModels.workspaceId, workspace.id)));
    if (row && !modelsFor(row.task).some((x) => x.id === m.model)) throw new Error(row.task === "image" ? "Pick an image model for this task" : "Image models only draw pictures: pick a text model");
    const provider = providerOf(m.model)!;
    if (!(await aiApiKey(provider))) throw new Error(`Add an ${PROVIDERS[provider].keyLabel} first (Change keys or budget)`);
    await (await db())
      .update(aiModels)
      .set({ model: m.model, effort: m.effort, maxTokens: m.max_tokens })
      .where(and(eq(aiModels.id, id.parse(modelId)), eq(aiModels.workspaceId, workspace.id)));
  });
}

const keyField = (provider: AiProvider) =>
  z
    .string()
    .trim()
    .default("")
    .refine((k) => k === "" || keyLooksValid(provider, k), `That doesn't look like an ${PROVIDERS[provider].keyLabel} (they start with ${PROVIDERS[provider].keyPrefix})`);

/**
 * Settings → General → AI and the wizard's first step: which provider to use, its key (and
 * optionally the other one), and the monthly budget. A blank key keeps the saved one.
 */
export async function saveAiSettings(formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const input = z
      .object({
        provider: z.enum(["anthropic", "openai"]),
        anthropic_key: keyField("anthropic"),
        openai_key: keyField("openai"),
        budget: z.coerce.number().min(1, "Set a budget of at least $1").max(10_000),
      })
      .parse(formFields(formData));
    const keys = { anthropic: input.anthropic_key, openai: input.openai_key };
    if (!keys[input.provider] && !(await aiApiKey(input.provider))) throw new Error(`Paste your ${PROVIDERS[input.provider].keyLabel}`);
    for (const provider of ["anthropic", "openai"] as const) if (keys[provider]) await putSecret(PROVIDERS[provider].secret, keys[provider]);
    await setSetting(BUDGET_SETTING, input.budget);
    await setActiveProvider((await getWorkspace()).id, input.provider);
  });
}

/** Forgets a provider's key. Tasks routed to its models stop until a key is added again. */
export async function removeAiKey(provider: string): Promise<ActionResult> {
  return mutate(async () => {
    if (!isAiProvider(provider)) throw new Error("Unknown provider");
    const [row] = await (await db()).select({ id: secrets.id }).from(secrets).where(eq(secrets.name, PROVIDERS[provider].secret));
    if (row) await deleteSecret(row.id);
  });
}

// --- X API (optional, paid) ----------------------------------------------------------

export async function saveXSettings(formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const input = z
      .object({
        token: z.string().trim(),
        daily_reads: z.coerce.number().int().min(10, "At least 10 (X returns at least 10 per search)").max(10_000),
        scan_hours: z.coerce.number().int().min(1).max(168),
      })
      .parse(formFields(formData));
    if (input.token) await putSecret(X_TOKEN_SECRET, input.token);
    await setSetting(X_SETTINGS, { dailyReads: input.daily_reads, scanHours: input.scan_hours });
  });
}

export async function removeXToken(): Promise<ActionResult> {
  return mutate(async () => {
    const [row] = await (await db()).select({ id: secrets.id }).from(secrets).where(eq(secrets.name, X_TOKEN_SECRET));
    if (row) await deleteSecret(row.id);
  });
}

// --- Posting ---------------------------------------------------------------------------

export async function savePostingSettings(formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const input = z
      .object({
        mastodon_server: z
          .string()
          .trim()
          .transform((v) => v.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^@?[^@]*@/, "").toLowerCase())
          .refine((v) => v === "" || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v), "Enter your server's address, e.g. mastodon.social"),
      })
      .parse(formFields(formData));
    await setSetting(POSTING_SETTINGS, { mastodonServer: input.mastodon_server || null } satisfies PostingSettings);
  });
}

// --- Product connections ----------------------------------------------------------

const connectionInput = {
  ga4: z.object({
    propertyId: z.string().trim().regex(/^\d+$/, "The GA4 property ID is a number (Admin → Property details)"),
    secret: z
      .string()
      .trim()
      .refine((v) => v === "" || isServiceAccountKey(v), "Paste the whole service account key: the contents of the .json file, starting with {"),
  }),
  stripe: z.object({ secret: z.string().trim() }),
  umami: z.object({
    baseUrl: z.string().trim().default("").transform((v, ctx) => {
      try {
        return normalizeUmamiUrl(v);
      } catch {
        ctx.addIssue({ code: "custom", message: "Enter Umami Cloud, or your Umami's address (e.g. https://umami.example.com)" });
        return v;
      }
    }),
    websiteId: z.string().trim().regex(/^[0-9a-f-]{36}$/i, "Paste the Website ID from Umami (Settings → Websites → Edit); it looks like 4fb7a6c2-…"),
    keyEvents: z
      .string()
      .default("")
      .transform((v) => v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)),
    secret: z.string().trim(),
  }),
  search_console: z
    .object({
      siteUrl: z.string().trim().min(1, "Enter the Search Console property, e.g. example.com or https://example.com/").transform(normalizeProperty),
      useGa4Key: z.string().optional().transform((v) => v === "on"),
      secret: z
        .string()
        .trim()
        .default("")
        .refine((v) => v === "" || isServiceAccountKey(v), "Paste the whole service account key: the contents of the .json file, starting with {"),
    })
    .transform((v) => (v.useGa4Key ? { ...v, secret: "" } : v)),
  bing_webmaster: z.object({
    siteUrl: z
      .string()
      .trim()
      .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
      .pipe(z.url("Enter the site as Bing Webmaster Tools lists it, e.g. https://example.com/"))
      .transform((v) => (v.endsWith("/") ? v : `${v}/`)),
    secret: z.string().trim(),
  }),
  product_db: z.object({
    view: z
      .string()
      .trim()
      .regex(/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/, "Use schema.view, e.g. startica.daily_metrics"),
    secret: z.string().trim(),
  }),
} as const;

export type ConnectionKind = keyof typeof connectionInput;

function isServiceAccountKey(text: string): boolean {
  try {
    const key = JSON.parse(text) as { type?: string; client_email?: string; private_key?: string };
    return key.type === "service_account" && Boolean(key.client_email && key.private_key);
  } catch {
    return false;
  }
}

/** The saved key of another of the product's connections (Search Console can reuse GA4's). */
async function productSecret(productId: string, kind: ConnectionKind): Promise<string | null> {
  const [row] = await (await db())
    .select({ secretId: connections.secretId })
    .from(connections)
    .where(and(eq(connections.productId, productId), eq(connections.kind, kind)));
  return row?.secretId ? readSecret(row.secretId) : null;
}

/** Upserts a product's connection; returns its id. */
async function upsertConnection(
  scope: { workspaceId: string; productId: string },
  kind: ConnectionKind,
  values: Partial<typeof connections.$inferInsert>,
) {
  const [row] = await (await db())
    .insert(connections)
    .values({ ...scope, kind, ...values })
    .onConflictDoUpdate({
      target: [connections.productId, connections.kind],
      set: { ...values, status: "untested", lastError: null },
    })
    .returning({ id: connections.id, secretId: connections.secretId });
  return row!;
}

/** Saves a pasted credential (encrypted). A blank secret keeps the saved one. */
export async function saveConnection(productId: string, kind: ConnectionKind, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const { secret, ...config } = connectionInput[kind].parse(formFields(formData));
    const [existing] = await (await db())
      .select({ id: connections.id, secretId: connections.secretId })
      .from(connections)
      .where(and(eq(connections.productId, scope.productId), eq(connections.kind, kind)));
    const usesGa4Key = kind === "search_console" && (config as { useGa4Key?: boolean }).useGa4Key;
    if (!existing?.secretId && !secret && !usesGa4Key) throw new Error("Paste the credentials to connect");
    // Umami: check the key can read the website now.
    if (kind === "umami" && !desktopApp().demo) {
      const key = secret || (existing?.secretId ? await readSecret(existing.secretId) : null);
      if (key) await checkUmami(config as UmamiConfig, key);
    }
    // Search Console and Bing: check access now, so a wrong property or key says so before saving.
    if ((kind === "search_console" || kind === "bing_webmaster") && !desktopApp().demo) {
      const siteUrl = (config as { siteUrl: string }).siteUrl;
      const key = secret || (usesGa4Key ? await productSecret(scope.productId, "ga4") : existing?.secretId ? await readSecret(existing.secretId) : null);
      if (!key) throw new Error(usesGa4Key ? "GA4 has no saved key for this product: connect GA4 first, or paste a key here." : "Paste the credentials to connect");
      if (kind === "search_console") {
        // Save the property it can actually read (a URL prefix becomes the site's Domain property when that's the one shared).
        (config as { siteUrl: string }).siteUrl = await checkProperty(parseServiceAccount(key, secret || !usesGa4Key ? "Search Console" : "GA4"), siteUrl);
      }
      else await checkBingSite(key, siteUrl);
    }

    // Product database by URL: the login must be read-only and able to read the view.
    if (kind === "product_db" && !desktopApp().demo) {
      const url = secret || (existing?.secretId ? await readSecret(existing.secretId) : null);
      if (url) await checkReaderConnection(url, (config as { view: string }).view);
    }
    const conn = await upsertConnection(scope, kind, { config });
    if (secret) {
      if (conn.secretId) await updateSecret(conn.secretId, secret);
      else {
        const secretId = await putSecret(`connection-${conn.id}`, secret);
        await (await db()).update(connections).set({ secretId }).where(eq(connections.id, conn.id));
      }
    }
    // Switching to the GA4 key: forget the key this connection had of its own.
    if (usesGa4Key && conn.secretId) {
      await (await db()).update(connections).set({ secretId: null }).where(eq(connections.id, conn.id));
      await deleteSecret(conn.secretId);
    }
    // Test it right away; the result shows up as the connection's status.
    await enqueue(scope.workspaceId, "metrics_sync", { connectionId: conn.id });
  });
}

export async function syncConnections(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await enqueue(scope.workspaceId, "metrics_sync", { productId: scope.productId });
  });
}

export async function deleteConnection(connectionId: string): Promise<ActionResult> {
  return mutate(async () => {
    const workspace = await getWorkspace();
    const [row] = await (await db())
      .delete(connections)
      .where(and(eq(connections.id, id.parse(connectionId)), eq(connections.workspaceId, workspace.id)))
      .returning({ secretId: connections.secretId });
    if (row?.secretId) await deleteSecret(row.secretId);
  });
}

// --- Product database: SQL the owner runs, then a read-only login -----------------------

const productDbInput = setupSpec.extend({
  password: z.string().regex(/^[A-Za-z0-9]{24,64}$/),
  // Empty when changing an existing setup: keep the saved host.
  connectionString: z.string().trim().default(""),
});

/** The product's saved database connection URL, if any. */
async function savedProductDbUrl(productId: string): Promise<string | null> {
  // A secret saved on another computer can't be decrypted here: treat it as not saved.
  return productSecret(productId, "product_db").catch(() => null);
}

/**
 * Writes the setup SQL for the owner to run. The password is new, or the one the saved
 * read-only login already has (so running it again doesn't break syncing).
 */
export async function productDbSetupSql(productId: string, spec: unknown): Promise<{ sql: string | null; password: string | null; error: string | null }> {
  try {
    const scope = await productScope(productId);
    const parsed = setupSpec.parse(spec);
    const password = savedReaderPassword(await savedProductDbUrl(scope.productId)) ?? randomPassword();
    return { sql: generateSetupSql(parsed, password), password, error: null };
  } catch (error) {
    return { sql: null, password: null, ...fail(error) };
  }
}

/** Tests the read-only login against the pasted connection string's database, then saves it. */
export async function connectProductDb(productId: string, input: unknown): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const parsed = productDbInput.parse(input);
    const pasted = parsed.connectionString || (await savedProductDbUrl(scope.productId));
    if (!pasted) throw new Error("Paste your database's connection string");
    const target = readerUrlFrom(pasted, parsed.password);
    if (!desktopApp().demo) await checkReaderConnection(target.url, METRICS_VIEW);
    const conn = await upsertConnection(scope, "product_db", {
      config: { view: METRICS_VIEW, metrics: parsed.metrics, host: target.host, ...(target.projectRef ? { projectRef: target.projectRef } : {}) },
    });
    if (conn.secretId) await updateSecret(conn.secretId, target.url);
    else {
      const secretId = await putSecret(`connection-${conn.id}`, target.url);
      await (await db()).update(connections).set({ secretId }).where(eq(connections.id, conn.id));
    }
    await enqueue(scope.workspaceId, "metrics_sync", { connectionId: conn.id });
  });
}

// --- App (desktop) ---------------------------------------------------------------------

export async function setLaunchAtLoginAction(enabled: boolean): Promise<ActionResult> {
  return mutate(async () => {
    if (!desktopApp().packaged) throw new Error("Launch at login works in the installed app");
    sendToDesktop({ type: "launch-at-login", enabled });
    await new Promise((r) => setTimeout(r, 300)); // let the OS setting land before the page reloads it
  });
}

/**
 * Shows the data folder in Finder / Explorer / the file manager. The desktop app opens
 * it from the Electron process; in browser dev mode the server (on the same computer)
 * runs the system's own opener. The path is Startica's own, never user input.
 */
export async function openDataFolder(): Promise<ActionResult> {
  try {
    if (desktopApp().electron) {
      sendToDesktop({ type: "open-data-folder" });
      return { error: null };
    }
    const folder = dataDir();
    const [command, args] = process.platform === "darwin" ? ["open", [folder]] : process.platform === "win32" ? ["explorer", [folder]] : ["xdg-open", [folder]];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(/*turbopackIgnore: true*/ command, args, { stdio: "ignore", detached: true });
      child.once("error", () => reject(new Error(`Couldn't open the folder. It's at ${folder}`)));
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

// --- Issue tracker (GitHub / GitLab) ------------------------------------------------------

export async function saveIssueTracker(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await saveTracker(scope.workspaceId, scope.productId, trackerInput.parse(formFields(formData)));
  });
}

export async function removeIssueTracker(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const tracker = await trackerFor(scope.productId);
    if (!tracker) return;
    await (await db()).delete(issueTrackers).where(eq(issueTrackers.id, tracker.id));
    if (tracker.secretId) await deleteSecret(tracker.secretId);
  });
}
