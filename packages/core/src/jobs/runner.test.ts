import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { conversations, jobRuns, jobs as jobsTable, opportunities, products } from "@startica/db/schema";
import { storeConversation } from "../distribution/jobs.ts";
import { startRunner } from "./runner.ts";

let workspaceId = "";

beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-core-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
});
afterAll(() => closeDatabase());

describe("job runner", () => {
  it("runs a queued job and records the run", async () => {
    // A product without a brief makes listen_scan a no-op: no network, no AI.
    await getDb().insert(products).values({ workspaceId, name: "No brief yet" });
    await enqueue(workspaceId, "listen_scan", {});

    const runner = startRunner({ workspaceId, log: () => {} });
    for (let i = 0; i < 40; i++) {
      const runs = await getDb().select().from(jobRuns).where(eq(jobRuns.queue, "listen_scan"));
      if (runs.length && runs[0]!.status !== "running") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await runner.stop();

    const [run] = await getDb().select().from(jobRuns).where(eq(jobRuns.queue, "listen_scan"));
    expect(run?.status).toBe("succeeded");
    expect(run?.result).toEqual({});
    expect(await getDb().select().from(jobsTable)).toHaveLength(0);
  });

  it("rejects payloads that fail the job's schema and doesn't retry them forever", async () => {
    await enqueue(workspaceId, "draft_generate", { opportunityId: "not-a-uuid" });
    const runner = startRunner({ workspaceId, log: () => {} });
    for (let i = 0; i < 40; i++) {
      const [job] = await getDb().select().from(jobsTable).where(eq(jobsTable.queue, "draft_generate"));
      if (job?.status === "failed") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await runner.stop();
    const [job] = await getDb().select().from(jobsTable).where(eq(jobsTable.queue, "draft_generate"));
    expect(job?.status).toBe("failed"); // draft_generate allows one attempt
  });
});

describe("storeConversation", () => {
  it("dedupes conversations and opportunities", async () => {
    const [product] = await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning();
    const conversation = {
      channel: "hackernews" as const,
      externalId: "123",
      url: "https://news.ycombinator.com/item?id=123",
      kind: "post" as const,
      community: "Hacker News",
      author: "pg",
      title: "Ask HN: what do field researchers use for notes?",
      threadTitle: null,
      body: "Paper notebooks keep getting wet.",
      postedAt: new Date(),
      score: 10,
      numComments: 3,
    };
    const first = await storeConversation({ workspaceId, productId: product!.id, conversation, origin: "listening", matchedOn: "hackernews" });
    const second = await storeConversation({
      workspaceId,
      productId: product!.id,
      conversation: { ...conversation, score: 42 },
      origin: "listening",
      matchedOn: "hackernews",
    });
    expect(first.isNew).toBe(true);
    expect(second).toEqual({ opportunityId: first.opportunityId, isNew: false });
    const [conv] = await getDb().select().from(conversations).where(eq(conversations.externalId, "123"));
    expect(conv?.score).toBe(42);
    expect(await getDb().select().from(opportunities).where(eq(opportunities.productId, product!.id))).toHaveLength(1);
  });
});
