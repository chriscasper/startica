import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { aiBatches, aiRuns, jobs, opportunities, products } from "@startica/db/schema";
import { fileKeyCipher, putSecret, setCipher } from "@startica/db/secrets";
import type { RawConversation } from "../channels/types.ts";
import type { BatchItemResult } from "./errors.ts";

// The provider's batch API, faked: what was sent, whether it has ended, and its results.
const provider = vi.hoisted(() => ({
  submitted: [] as { customId: string; system: string }[][],
  ended: false,
  results: [] as BatchItemResult[],
  cancelled: [] as string[],
  submitError: null as Error | null,
  structured: 0,
}));
vi.mock("./anthropic.ts", () => ({
  anthropicBatchSubmit: vi.fn(async (_key: string, req: { requests: { customId: string; system: string }[] }) => {
    if (provider.submitError) throw provider.submitError;
    provider.submitted.push(req.requests);
    return "msgbatch_test";
  }),
  anthropicBatchState: vi.fn(async () => ({ ended: provider.ended })),
  anthropicBatchResults: vi.fn(async () => provider.results),
  anthropicBatchCancel: vi.fn(async (_key: string, id: string) => void provider.cancelled.push(id)),
  anthropicStructured: vi.fn(async () => {
    provider.structured++;
    return { value: { relevance: 0.1, intent: 0.1, reasoning: "Not about notes.", angle: "", sentiment: "neutral" }, model: "claude-haiku-5-5", usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 } };
  }),
}));

const { ANTHROPIC_KEY_SECRET } = await import("./client.ts");
const { runOpportunityScore, storeConversation, BATCH_SCORING_MIN } = await import("../distribution/jobs.ts");
const { runBatchPoll } = await import("../jobs/batches.ts");
const { stopJob } = await import("../jobs/cancel.ts");

let workspaceId = "";
let productId = "";

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-batch-"));
  openDatabase(join(dir, "test.db"));
  setCipher(fileKeyCipher(join(dir, "key")));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  await putSecret(ANTHROPIC_KEY_SECRET, "sk-ant-test");
  [{ id: productId }] = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning({ id: products.id })) as [{ id: string }];
});
beforeEach(async () => {
  Object.assign(provider, { submitted: [], ended: false, results: [], cancelled: [], submitError: null, structured: 0 });
  await getDb().delete(jobs);
});
afterAll(() => closeDatabase());

let n = 0;
const conversation = (): RawConversation => ({
  channel: "reddit",
  externalId: `t3_${++n}`,
  url: `https://www.reddit.com/r/fieldwork/comments/${n}/x/`,
  kind: "post",
  community: "fieldwork",
  author: "someone",
  title: `Question ${n}`,
  threadTitle: null,
  // Different texts, so none is archived as a near-duplicate.
  body: `Question number ${n}: ${"alpha beta gamma delta epsilon zeta eta theta iota kappa".split(" ").map((w, i) => `${w}${(n * 7 + i) % 97}`).join(" ")} what do you use for notes in the field?`,
  postedAt: new Date(),
  score: null,
  numComments: null,
});
const newOpportunities = async (count: number) => {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push((await storeConversation({ workspaceId, productId, conversation: conversation(), origin: "listening", matchedOn: "reddit" })).opportunityId);
  return ids;
};
const pollJobs = async () => (await getDb().select().from(jobs).where(eq(jobs.queue, "ai_batch_poll"))).map((j) => j.payload as { batchId: string });
const ok = (customId: string, relevance: number): BatchItemResult => ({
  customId,
  ok: true,
  value: { relevance, intent: relevance, reasoning: "Asks for a notes tool.", angle: "Share how you organize notes.", sentiment: "neutral" },
  model: "claude-haiku-5-5",
  usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
});

describe("batch scoring", () => {
  it("sends a scan's backlog as one batch, waits, then stores each score at half the price", async () => {
    const ids = await newOpportunities(BATCH_SCORING_MIN);
    const tally = await runOpportunityScore({ workspaceId }, { workspaceId, opportunityIds: ids, force: false, batch: true });
    expect(tally).toMatchObject({ batched: ids.length });
    expect(provider.submitted[0]!.map((r) => r.customId).sort()).toEqual([...ids].sort());
    expect(provider.submitted[0]![0]!.system).toContain("Fieldnote");
    const [batch] = await getDb().select().from(aiBatches);
    expect(batch).toMatchObject({ status: "submitted", provider: "anthropic", externalId: "msgbatch_test", purpose: "opportunity_score", task: "score" });
    expect(await pollJobs()).toEqual([{ batchId: batch!.id, workspaceId }]);
    expect((await getDb().select().from(aiRuns)).length).toBe(0);

    // Not ended yet: it checks again later.
    await getDb().delete(jobs);
    expect(await runBatchPoll({ workspaceId }, { workspaceId, batchId: batch!.id })).toEqual({ waiting: ids.length });
    const [later] = await getDb().select().from(jobs).where(eq(jobs.queue, "ai_batch_poll"));
    expect(later!.runAfter.getTime()).toBeGreaterThan(Date.now() + 50_000);

    // Ended: two qualify, one failed request is scored again now, one never ran.
    await getDb().delete(jobs);
    provider.ended = true;
    provider.results = [
      ok(ids[0]!, 0.9),
      ok(ids[1]!, 0.95),
      ...ids.slice(2, -2).map((id) => ok(id, 0.1)),
      { customId: ids.at(-2)!, ok: false, error: "overloaded_error: busy", kind: "api" },
    ];
    const stored = await runBatchPoll({ workspaceId }, { workspaceId, batchId: batch!.id });
    expect(stored).toMatchObject({ drafting: 2, archived: ids.length - 4, retried: 2 });

    const rows = await getDb().select().from(opportunities);
    expect(rows.find((r) => r.id === ids[0])).toMatchObject({ status: "drafting", relevance: 0.9 });
    expect(rows.find((r) => r.id === ids[2])).toMatchObject({ status: "archived" });
    expect(rows.find((r) => r.id === ids.at(-1))).toMatchObject({ status: "new" });

    const queued = await getDb().select().from(jobs);
    expect(queued.filter((j) => j.queue === "draft_generate")).toHaveLength(2);
    expect(queued.filter((j) => j.queue === "opportunity_score").flatMap((j) => (j.payload as { opportunityIds: string[] }).opportunityIds).sort()).toEqual(ids.slice(-2).sort());

    // One ai_runs row per request that ran (not the one that never did), at half price.
    const runs = await getDb().select().from(aiRuns);
    expect(runs).toHaveLength(ids.length - 1);
    expect(runs.every((r) => r.batchId === batch!.id)).toBe(true);
    const okRun = runs.find((r) => r.status === "ok")!;
    expect(okRun.costUsd).toBeCloseTo(0.05, 5); // Haiku input is $0.10 per million; half in a batch
    expect(runs.filter((r) => r.status === "error")).toHaveLength(1);
    expect(await getDb().select().from(aiBatches)).toMatchObject([{ status: "ended", succeeded: ids.length - 2, errored: 2 }]);
  });

  it("scores right away when the batch can't be sent", async () => {
    provider.submitError = new Error("Batches are unavailable");
    const ids = await newOpportunities(3);
    const tally = await runOpportunityScore({ workspaceId }, { workspaceId, opportunityIds: ids, force: false, batch: true });
    expect(tally).toMatchObject({ archived: 3 });
    expect(provider.structured).toBe(3);
  });

  it("cancels the batch at the provider when the owner stops the wait", async () => {
    const ids = await newOpportunities(2);
    await runOpportunityScore({ workspaceId }, { workspaceId, opportunityIds: ids, force: false, batch: true });
    const [job] = await getDb().select().from(jobs).where(eq(jobs.queue, "ai_batch_poll"));
    expect(await stopJob(workspaceId, job!.id)).toBe("removed");
    expect(provider.cancelled).toEqual(["msgbatch_test"]);
    const batchId = (job!.payload as { batchId: string }).batchId;
    expect((await getDb().select().from(aiBatches).where(eq(aiBatches.id, batchId)))[0]).toMatchObject({ status: "cancelled", error: "Stopped by you" });
    expect(await runBatchPoll({ workspaceId }, { workspaceId, batchId })).toEqual({ skipped: "cancelled" });
  });
});

describe("a batch that never finishes", () => {
  it("is cancelled after about a day and a half of polls, and its requests are scored right away", async () => {
    const ids = await newOpportunities(2);
    await runOpportunityScore({ workspaceId }, { workspaceId, opportunityIds: ids, force: false, batch: true });
    const [job] = await getDb().select().from(jobs).where(eq(jobs.queue, "ai_batch_poll"));
    const batchId = (job!.payload as { batchId: string }).batchId;
    await getDb().update(aiBatches).set({ polls: 220 }).where(eq(aiBatches.id, batchId));
    await getDb().delete(jobs);
    expect(await runBatchPoll({ workspaceId }, { workspaceId, batchId })).toMatchObject({ retried: 2 });
    expect(provider.cancelled).toEqual(["msgbatch_test"]);
    expect((await getDb().select().from(aiBatches).where(eq(aiBatches.id, batchId)))[0]).toMatchObject({ status: "failed" });
    expect((await getDb().select().from(jobs)).map((j) => j.queue)).toEqual(["opportunity_score"]);
  });
});
