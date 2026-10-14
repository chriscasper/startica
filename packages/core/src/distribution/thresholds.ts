import { and, desc, eq, gte, isNotNull, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { transaction, getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { conversations, opportunities, products } from "@startica/db/schema";

/** Archived conversations older than this aren't worth replying to (matches scoring's 7-day cutoff). */
const RECENT_DAYS = 7;
/** Most drafts one threshold change may queue, so a loose setting can't surprise anyone with a big bill. */
export const MAX_REDRAFTS = 25;

export const thresholdsInput = z.object({
  relevance: z.number().min(0).max(1),
  intent: z.number().min(0).max(1),
  draftPassing: z.boolean().default(false),
});

const recentArchived = (productId: string) => {
  const since = new Date(Date.now() - RECENT_DAYS * 86400_000);
  return and(
    eq(opportunities.productId, productId),
    eq(opportunities.status, "archived"),
    isNull(opportunities.duplicateOfId),
    isNotNull(opportunities.relevance),
    isNotNull(opportunities.intent),
    or(gte(conversations.postedAt, since), and(isNull(conversations.postedAt), gte(opportunities.createdAt, since))),
  );
};

/** Scores of the product's recent archived conversations, to preview a threshold change. */
export async function recentArchivedScores(productId: string): Promise<{ relevance: number; intent: number }[]> {
  const rows = await getDb()
    .select({ relevance: opportunities.relevance, intent: opportunities.intent })
    .from(opportunities)
    .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
    .where(recentArchived(productId));
  return rows.map((r) => ({ relevance: r.relevance!, intent: r.intent! }));
}

/**
 * Saves a product's scoring thresholds. With `draftPassing`, recent archived
 * conversations that pass the new thresholds go to drafting (best first, at most
 * MAX_REDRAFTS). Returns how many were queued.
 */
export async function setThresholds(workspaceId: string, productId: string, input: z.input<typeof thresholdsInput>): Promise<number> {
  const { relevance, intent, draftPassing } = thresholdsInput.parse(input);
  const queued = await transaction(async (db) => {
    await db
      .update(products)
      .set({ relevanceThreshold: relevance, intentThreshold: intent })
      .where(and(eq(products.id, productId), eq(products.workspaceId, workspaceId)));
    if (!draftPassing) return [];
    const passing = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
      .where(and(recentArchived(productId), gte(opportunities.relevance, relevance), gte(opportunities.intent, intent)))
      .orderBy(desc(opportunities.relevance), desc(opportunities.intent))
      .limit(MAX_REDRAFTS);
    for (const { id } of passing) {
      await db.update(opportunities).set({ status: "drafting", error: null }).where(eq(opportunities.id, id));
    }
    return passing.map((p) => p.id);
  });
  for (const opportunityId of queued) await enqueue(workspaceId, "draft_generate", { opportunityId });
  return queued.length;
}
