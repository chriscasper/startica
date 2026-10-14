"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { scanActivity } from "@startica/core/jobs/activity";
import { setSetupFlags, watchCommunities } from "@startica/core/setup/status";
import { enqueue } from "@startica/db/queue";
import { products } from "@startica/db/schema";
import type { ActionResult } from "@/components/app/form-dialog";
import { fail, formFields, mutate, productScope } from "@/lib/actions";
import { db, getWorkspace, PRODUCT_COOKIE } from "@/lib/dal";
import { sendToDesktop } from "@/lib/desktop";
import { savePostingSettings } from "@/app/(app)/settings/actions";
import { hasAiKey } from "@startica/core/ai/client";

/**
 * First-run setup (welcome wizard and the Getting started checklist on Today).
 * Key and Mastodon server reuse the Settings actions.
 */

const productInput = z.object({
  name: z.string().trim().min(1, "What's it called?"),
  url: z
    .string()
    .trim()
    .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
    .pipe(z.url("Enter its website, e.g. https://example.com")),
  build_intel: z.string().optional(),
});

/** Adds the first product, makes it active and (unless unticked, or there's no key yet) starts intel. */
export async function addFirstProduct(formData: FormData): Promise<ActionResult & { intel?: boolean }> {
  try {
    const input = productInput.parse(formFields(formData));
    const workspace = await getWorkspace();
    const d = await db();
    // The wizard only ever adds the first product; more are added in Settings.
    const [existing] = await d.select({ id: products.id }).from(products).where(eq(products.workspaceId, workspace.id)).limit(1);
    if (existing) throw new Error("You already have a product; add more in Settings → Products");
    const [created] = await d.insert(products).values({ workspaceId: workspace.id, name: input.name, url: input.url }).returning({ id: products.id });
    (await cookies()).set(PRODUCT_COOKIE, created!.id, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
    const intel = input.build_intel === "on" && (await hasAiKey());
    if (intel) {
      await enqueue(workspace.id, "intel_build", { productId: created!.id });
      await d.update(products).set({ intelStatus: "queued", intelError: null }).where(eq(products.id, created!.id));
    }
    return { error: null, intel };
  } catch (error) {
    return fail(error);
  }
}

/** Step 3: extras while intel runs. */
export async function saveSetupExtras(formData: FormData): Promise<ActionResult> {
  const saved = await savePostingSettings(formData);
  if (saved.error) return saved;
  // The checkbox only exists in the installed app; unticked sends nothing, so the marker says it was shown.
  if (formData.has("launch_at_login_shown")) {
    try {
      sendToDesktop({ type: "launch-at-login", enabled: formData.get("launch_at_login") === "on" });
    } catch {
      // Not the installed desktop app: nothing to set.
    }
  }
  return { error: null };
}

/** Finishing or skipping the wizard: it won't open again (Settings → Run setup again). */
export async function finishWelcome(): Promise<ActionResult> {
  return mutate(() => setSetupFlags({ welcomeDone: true }));
}

export async function dismissChecklist(): Promise<ActionResult> {
  return mutate(() => setSetupFlags({ checklistDismissed: true }));
}

export async function runSetupAgain(): Promise<ActionResult> {
  return mutate(() => setSetupFlags({ welcomeDone: false, checklistDismissed: false }));
}

/** Checklist: watch the communities the user kept ticked. */
export async function watchSuggested(productId: string, ids: string[]): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const n = await watchCommunities(scope.productId, z.array(z.guid()).parse(ids));
    if (n === 0) throw new Error("Tick at least one community");
    // Start listening right away rather than at the next hourly scan. A scan still
    // waiting in the queue reads the communities when it starts, so one is enough.
    const { scan } = await scanActivity(scope.workspaceId, scope.productId);
    if (!scan || scan.running) await enqueue(scope.workspaceId, "listen_scan", { productId: scope.productId });
  });
}

/** Demo mode: restarts the app into the sample product's own data folder, or back. */
export async function enterDemo(): Promise<ActionResult> {
  try {
    sendToDesktop({ type: "switch-mode", demo: true });
    return { error: null };
  } catch {
    return { error: "The demo needs the desktop app. In a browser run, use `yarn seed:demo` with its own STARTICA_DATA_DIR." };
  }
}

export async function leaveDemo(): Promise<ActionResult> {
  try {
    sendToDesktop({ type: "switch-mode", demo: false });
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}
