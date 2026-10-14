"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { enqueue } from "@startica/db/queue";
import { communityProblem } from "@startica/core/channels/formats";
import { channels, communities, competitors, keywords, personas, products } from "@startica/db/schema";
import type { ActionResult } from "@/components/app/form-dialog";
import { fail, formFields, id, lines, mutate, optionalUrl, productScope } from "@/lib/actions";
import { db, getWorkspace } from "@/lib/dal";

// Everything the owner writes is marked source = 'owner' so rebuilds keep it.

const text = z.string().trim();

/** Scopes a child row (persona, competitor, …) to this workspace before changing it. */
async function inWorkspace<T extends typeof personas | typeof competitors | typeof keywords | typeof communities>(
  table: T,
  rowId: string,
) {
  const workspace = await getWorkspace();
  return and(eq(table.id, id.parse(rowId)), eq(table.workspaceId, workspace.id));
}

// --- Build -----------------------------------------------------------------

export async function requestIntelBuild(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await enqueue(scope.workspaceId, "intel_build", { productId: scope.productId });
    await (await db()).update(products).set({ intelStatus: "queued", intelError: null }).where(eq(products.id, scope.productId));
  });
}

// --- Product notes and brief ----------------------------------------------

export async function saveOwnerNotes(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const notes = text.parse(formData.get("owner_notes") ?? "");
    await (await db()).update(products).set({ ownerNotes: notes || null }).where(eq(products.id, scope.productId));
  });
}

const briefSchema = z.object({
  summary: text,
  category: text,
  audience: text,
  problem: text,
  value_props: lines,
  differentiators: lines,
  positioning: text,
  pricing_notes: text,
  open_questions: lines,
});

export async function saveBrief(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const brief = briefSchema.parse(formFields(formData));
    await (await db())
      .update(products)
      .set({ brief, briefSource: "owner", briefUpdatedAt: new Date() })
      .where(eq(products.id, scope.productId));
  });
}

/** Lets the next rebuild overwrite an owner-edited brief. */
export async function releaseBrief(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await (await db()).update(products).set({ briefSource: "ai" }).where(eq(products.id, scope.productId));
  });
}

// --- Personas --------------------------------------------------------------

const personaSchema = z.object({
  name: text.min(1, "Name is required"),
  summary: text,
  pains: lines,
  goals: lines,
  hangouts: lines,
});

export async function savePersona(productId: string, personaId: string | null, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const values = { ...personaSchema.parse(formFields(formData)), source: "owner" as const };
    if (personaId) await (await db()).update(personas).set(values).where(await inWorkspace(personas, personaId));
    else await (await db()).insert(personas).values({ ...values, ...scope });
  });
}

export async function deletePersona(personaId: string): Promise<ActionResult> {
  return mutate(async () => (await db()).delete(personas).where(await inWorkspace(personas, personaId)));
}

// --- Competitors -----------------------------------------------------------

const competitorSchema = z.object({
  name: text.min(1, "Name is required"),
  url: optionalUrl,
  positioning: text,
  strengths: lines,
  weaknesses: lines,
});

export async function saveCompetitor(productId: string, competitorId: string | null, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const values = { ...competitorSchema.parse(formFields(formData)), source: "owner" as const };
    if (competitorId) await (await db()).update(competitors).set(values).where(await inWorkspace(competitors, competitorId));
    else await (await db()).insert(competitors).values({ ...values, ...scope });
  });
}

export async function deleteCompetitor(competitorId: string): Promise<ActionResult> {
  return mutate(async () => (await db()).delete(competitors).where(await inWorkspace(competitors, competitorId)));
}

// --- Keywords --------------------------------------------------------------

const keywordSchema = z.object({
  keyword: text.min(1, "Keyword is required").transform((k) => k.toLowerCase()),
  intent: z.enum(["problem", "solution", "competitor", "brand"]),
  use_for: z.enum(["listening", "seo", "both"]),
});

export async function addKeyword(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const k = keywordSchema.parse(formFields(formData));
    const values = { keyword: k.keyword, intent: k.intent, useFor: k.use_for, source: "owner" as const };
    await (await db())
      .insert(keywords)
      .values({ ...values, ...scope })
      .onConflictDoUpdate({ target: [keywords.productId, keywords.keyword], set: values });
  });
}

export async function deleteKeyword(keywordId: string): Promise<ActionResult> {
  return mutate(async () => (await db()).delete(keywords).where(await inWorkspace(keywords, keywordId)));
}

// --- Communities -----------------------------------------------------------

const communitySchema = z.object({
  channel: z.enum(channels),
  name: text.min(1, "Name is required").transform((n) => n.replace(/^\/?r\//i, "")),
  url: optionalUrl,
  why: text,
  promo_rules: text,
});

export async function saveCommunity(productId: string, communityId: string | null, formData: FormData): Promise<ActionResult> {
  try {
    const scope = await productScope(productId);
    const c = communitySchema.parse(formFields(formData));
    // A forum is found by its address; Mastodon needs a hashtag.
    const problem = communityProblem(c.channel, c.name, c.url);
    if (problem) throw new Error(problem);
    const values = { channel: c.channel, name: c.name, url: c.url, why: c.why, promoRules: c.promo_rules, source: "owner" as const };
    return mutate(async () => {
      if (communityId) await (await db()).update(communities).set(values).where(await inWorkspace(communities, communityId));
      else await (await db()).insert(communities).values({ ...values, ...scope, status: "watching" });
    });
  } catch (error) {
    return fail(error);
  }
}

export async function setCommunityStatus(communityId: string, status: "suggested" | "watching" | "ignored"): Promise<ActionResult> {
  return mutate(async () => {
    const parsed = z.enum(["suggested", "watching", "ignored"]).parse(status);
    await (await db()).update(communities).set({ status: parsed }).where(await inWorkspace(communities, communityId));
  });
}

export async function deleteCommunity(communityId: string): Promise<ActionResult> {
  return mutate(async () => (await db()).delete(communities).where(await inWorkspace(communities, communityId)));
}
