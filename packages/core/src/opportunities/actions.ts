import { and, desc, eq, max } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { contentPieces, dailyMoves, roadmapItems, seoOpportunities, voiceProfiles } from "@startica/db/schema";
import { localDay } from "../growth/moves.ts";
import { jobByPayload } from "../jobs/cancel.ts";
import { collectOpportunities, type Opportunity } from "./collect.ts";

/** What the owner can do with an opportunity (ARCHITECTURE.md section 10.2). Server actions call these. */

type Scope = { workspaceId: string; productId: string };

/** The opportunity as it is now, or an error if the data changed since the page loaded. */
async function current(productId: string, key: string): Promise<Opportunity> {
  const opp = (await collectOpportunities(productId)).find((o) => o.key === key);
  if (!opp) throw new Error("This opportunity is gone: the data changed since the page loaded. Reload to see the latest.");
  return opp;
}

/** The state row for an opportunity, created on first use. */
async function stateRow(scope: Scope, key: string) {
  const db = getDb();
  await db.insert(seoOpportunities).values({ ...scope, key }).onConflictDoNothing();
  const [row] = await db.select().from(seoOpportunities).where(and(eq(seoOpportunities.productId, scope.productId), eq(seoOpportunities.key, key)));
  return row!;
}

export async function setOpportunityStatus(scope: Scope, key: string, status: "open" | "done" | "dismissed"): Promise<void> {
  const row = await stateRow(scope, key);
  await getDb().update(seoOpportunities).set({ status }).where(eq(seoOpportunities.id, row.id));
}

export async function requestDraft(scope: Scope, key: string): Promise<void> {
  const opp = await current(scope.productId, key);
  if (!opp.draft) throw new Error("There's nothing to draft for this one");
  if (await jobByPayload(scope.workspaceId, ["opportunity_draft"], "key", key)) throw new Error("Already drafting this one");
  const row = await stateRow(scope, key);
  await getDb().update(seoOpportunities).set({ draftStatus: "drafting", draftError: null }).where(eq(seoOpportunities.id, row.id));
  await enqueue(scope.workspaceId, "opportunity_draft", { productId: scope.productId, key });
}

/** A roadmap item the owner owns, so re-plans keep it (playbook "seo-geo"). */
export async function addToRoadmap(scope: Scope, key: string): Promise<void> {
  const opp = await current(scope.productId, key);
  const row = await stateRow(scope, key);
  if (row.roadmapItemId) throw new Error("Already on the Roadmap");
  const [item] = await getDb()
    .insert(roadmapItems)
    .values({
      ...scope,
      stage: "acquisition",
      title: opp.title,
      why: opp.why,
      playbook: "seo-geo",
      successMetric: opp.area === "ai" ? "Mentioned in the next AI visibility runs" : opp.area === "search" ? "More clicks from Google in Search" : "Gone from Site health after the next scan",
      nextStep: opp.action,
      priority: opp.score >= 60 ? 1 : opp.score >= 40 ? 2 : 3,
      source: "owner",
    })
    .returning({ id: roadmapItems.id });
  await getDb().update(seoOpportunities).set({ roadmapItemId: item!.id }).where(eq(seoOpportunities.id, row.id));
}

/** A move on today's list, linking back to the opportunity. */
export async function addToToday(scope: Scope, key: string): Promise<void> {
  const opp = await current(scope.productId, key);
  const db = getDb();
  const day = localDay();
  const [existing] = await db
    .select({ id: dailyMoves.id })
    .from(dailyMoves)
    .where(and(eq(dailyMoves.productId, scope.productId), eq(dailyMoves.day, day), eq(dailyMoves.refId, key)));
  if (existing) throw new Error("Already on Today");
  const [last] = await db
    .select({ rank: max(dailyMoves.rank) })
    .from(dailyMoves)
    .where(and(eq(dailyMoves.productId, scope.productId), eq(dailyMoves.day, day)));
  await db.insert(dailyMoves).values({
    ...scope,
    day,
    rank: (last?.rank ?? 0) + 1,
    kind: "custom",
    title: opp.title,
    why: opp.why,
    href: `/seo/opportunities#${encodeURIComponent(key)}`,
    refId: key,
    source: "owner",
  });
}

/** A blog article in Content Studio from the opportunity's brief, in the product's newest ready voice (else the default voice). */
export async function sendBrief(scope: Scope, key: string): Promise<string> {
  const opp = await current(scope.productId, key);
  if (!opp.brief) throw new Error("There's no content brief for this one");
  const row = await stateRow(scope, key);
  if (row.contentPieceId) throw new Error("Already in Content Studio");
  // The product's newest ready voice, so the article sounds like the rest of its writing.
  const [voice] = await getDb()
    .select({ id: voiceProfiles.id })
    .from(voiceProfiles)
    .where(and(eq(voiceProfiles.productId, scope.productId), eq(voiceProfiles.status, "ready")))
    .orderBy(desc(voiceProfiles.updatedAt))
    .limit(1);
  const [piece] = await getDb()
    .insert(contentPieces)
    .values({ ...scope, channel: "blog", format: "article", topic: opp.brief.topic, rationale: opp.why, status: "drafting", voiceProfileId: voice?.id ?? null })
    .returning({ id: contentPieces.id });
  await getDb().update(seoOpportunities).set({ contentPieceId: piece!.id }).where(eq(seoOpportunities.id, row.id));
  await enqueue(scope.workspaceId, "content_generate", { pieceId: piece!.id, guidance: opp.brief.guidance.slice(0, 1000) });
  return piece!.id;
}
