import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { aiBatches } from "@startica/db/schema";
import { BATCH_POLL_QUEUE, batchPollDelaySeconds, cancelBatch, collectBatch, type AiContext, type BatchItemResult } from "../ai/client.ts";
import { storeBatchScores } from "../distribution/jobs.ts";
import { scoreOutput } from "../distribution/prompts.ts";

/**
 * Batches (ARCHITECTURE.md 5.2): the ai_batch_poll job checks a submitted batch, waits longer
 * each time it isn't done (a minute, then up to ten), and hands the results to the batch's
 * purpose, which stores them like the immediate path would.
 */

type Purpose = {
  /** The schema each request was sent with. */
  schema: z.ZodType;
  store(ctx: AiContext, results: (BatchItemResult & { ref: Record<string, string> })[]): Promise<Record<string, number>>;
};

export const BATCH_PURPOSES: Record<(typeof aiBatches.$inferSelect)["purpose"], Purpose> = {
  opportunity_score: { schema: scoreOutput, store: storeBatchScores },
};

/** About 36 hours of polls at the longest wait (10 minutes). */
const MAX_POLLS = 220;

export const batchPollPayload = z.object({ workspaceId: z.guid(), batchId: z.guid() });

export async function runBatchPoll(ctx: AiContext, payload: z.infer<typeof batchPollPayload>) {
  const [batch] = await getDb()
    .select()
    .from(aiBatches)
    .where(and(eq(aiBatches.id, payload.batchId), eq(aiBatches.workspaceId, payload.workspaceId)));
  if (!batch || batch.status !== "submitted") return { skipped: batch ? batch.status : "batch removed" };
  const purpose = BATCH_PURPOSES[batch.purpose];
  // Both providers finish a batch within 24 hours; polls stop after about a day and a half of
  // waiting (the app open), cancel it, and the purpose retries its requests another way.
  if (batch.polls >= MAX_POLLS) {
    await cancelBatch(payload.workspaceId, batch.id);
    await getDb().update(aiBatches).set({ status: "failed", error: "No results after the provider's 24-hour window" }).where(eq(aiBatches.id, batch.id));
    return purpose.store(ctx, batch.items.map((item) => ({ customId: item.customId, ok: false, error: "The batch never finished", kind: "expired" as const, ref: item.ref })));
  }
  try {
    const out = await collectBatch(ctx, batch, purpose.schema);
    if (!out.ended) {
      await enqueue(payload.workspaceId, BATCH_POLL_QUEUE, { batchId: batch.id }, { runAfter: new Date(Date.now() + batchPollDelaySeconds(batch.polls + 1) * 1000) });
      return { waiting: batch.items.length };
    }
    return { ...(await purpose.store(ctx, out.results)), ...(out.failed ? { failed: 1 } : {}) };
  } catch (error) {
    if (ctx.signal?.aborted) {
      await cancelBatch(payload.workspaceId, batch.id);
      throw error;
    }
    // A network blip while checking: try again later rather than lose the batch.
    await enqueue(payload.workspaceId, BATCH_POLL_QUEUE, { batchId: batch.id }, { runAfter: new Date(Date.now() + batchPollDelaySeconds(batch.polls + 1) * 1000) });
    throw error;
  }
}
