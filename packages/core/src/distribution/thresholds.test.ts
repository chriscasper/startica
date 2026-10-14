import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { conversations, jobs, opportunities, products } from "@startica/db/schema";
import { recentArchivedScores, setThresholds } from "./thresholds.ts";

let workspaceId = "";
let productId = "";
const day = 86400_000;

beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-thresholds-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  const [p] = await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning();
  productId = p!.id;
});
afterAll(() => closeDatabase());

async function opportunity(externalId: string, opts: { relevance: number | null; intent: number | null; status?: "archived" | "dismissed"; ageDays?: number; duplicate?: boolean }) {
  const [c] = await getDb()
    .insert(conversations)
    .values({
      workspaceId,
      channel: "reddit",
      externalId,
      url: `https://reddit.example/${externalId}`,
      kind: "post",
      title: externalId,
      body: "",
      postedAt: new Date(Date.now() - (opts.ageDays ?? 1) * day),
      origin: "listening",
    })
    .returning();
  const [o] = await getDb()
    .insert(opportunities)
    .values({ workspaceId, productId, conversationId: c!.id, relevance: opts.relevance, intent: opts.intent, status: opts.status ?? "archived" })
    .returning();
  if (opts.duplicate) await getDb().update(opportunities).set({ duplicateOfId: o!.id }).where(eq(opportunities.id, o!.id));
  return o!.id;
}

describe("scoring thresholds", () => {
  it("previews and drafts only recent, scored, non-duplicate archived conversations that pass", async () => {
    const close = await opportunity("close", { relevance: 0.6, intent: 0.9 });
    const edge = await opportunity("edge", { relevance: 0.55, intent: 0.5 });
    await opportunity("noise", { relevance: 0.1, intent: 0.8 });
    await opportunity("old", { relevance: 0.9, intent: 0.9, ageDays: 10 });
    await opportunity("dup", { relevance: 0.9, intent: 0.9, duplicate: true });
    await opportunity("unscored", { relevance: null, intent: null });
    await opportunity("dismissed", { relevance: 0.9, intent: 0.9, status: "dismissed" });

    expect((await recentArchivedScores(productId)).length).toBe(3);

    const queued = await setThresholds(workspaceId, productId, { relevance: 0.55, intent: 0.5, draftPassing: true });
    expect(queued).toBe(2);
    const [p] = await getDb().select().from(products).where(eq(products.id, productId));
    expect([p!.relevanceThreshold, p!.intentThreshold]).toEqual([0.55, 0.5]);
    const drafting = await getDb().select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.status, "drafting"));
    expect(drafting.map((d) => d.id).sort()).toEqual([close, edge].sort());
    const queuedJobs = await getDb().select().from(jobs).where(eq(jobs.queue, "draft_generate"));
    expect(queuedJobs.map((j) => (j.payload as { opportunityId: string }).opportunityId).sort()).toEqual([close, edge].sort());
  });

  it("only saves the thresholds without draftPassing", async () => {
    await opportunity("another", { relevance: 0.9, intent: 0.9 });
    expect(await setThresholds(workspaceId, productId, { relevance: 0.3, intent: 0.3 })).toBe(0);
    const [p] = await getDb().select().from(products).where(eq(products.id, productId));
    expect([p!.relevanceThreshold, p!.intentThreshold]).toEqual([0.3, 0.3]);
  });
});
