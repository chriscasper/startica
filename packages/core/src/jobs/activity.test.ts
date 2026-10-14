import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { claim, enqueue } from "@startica/db/queue";
import { jobRuns, jobs } from "@startica/db/schema";
import { reportProgress, scanActivity } from "./activity.ts";

let workspaceId = "";
const productA = "00000000-0000-4000-8000-00000000000a";
const productB = "00000000-0000-4000-8000-00000000000b";

beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-activity-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
});
beforeEach(async () => {
  await getDb().delete(jobRuns);
  await getDb().delete(jobs);
});
afterAll(() => closeDatabase());

describe("scanActivity", () => {
  it("is idle with an empty queue", async () => {
    expect(await scanActivity(workspaceId, productA)).toEqual({ scan: null, scoring: 0, drafting: 0, siteScan: null });
  });

  it("counts a scheduled scan (no product) for every product, and a product's own scan only for it", async () => {
    await enqueue(workspaceId, "listen_scan", { productId: productB });
    expect((await scanActivity(workspaceId, productA)).scan).toBeNull();
    expect((await scanActivity(workspaceId, productB)).scan).toMatchObject({ running: false, startedAt: null, channel: null });

    await enqueue(workspaceId, "listen_scan", {});
    expect((await scanActivity(workspaceId, productA)).scan).toMatchObject({ running: false, startedAt: null, channel: null });
  });

  it("reports a running scan's start and the channel it's reading", async () => {
    await enqueue(workspaceId, "listen_scan", { productId: productA });
    const job = (await claim("listen_scan", 60))!;
    const [run] = await getDb().insert(jobRuns).values({ workspaceId, jobId: job.id, queue: "listen_scan", payload: job.payload }).returning();
    await reportProgress(run!.id, { channel: "reddit" });

    const { scan } = await scanActivity(workspaceId, productA);
    expect(scan).toEqual({ jobId: job.id, running: true, startedAt: run!.startedAt.getTime(), channel: "reddit" });
  });

  it("ignores failed jobs and run rows left 'running' without a job", async () => {
    await enqueue(workspaceId, "listen_scan", { productId: productA });
    await getDb().update(jobs).set({ status: "failed" });
    await getDb().insert(jobRuns).values({ workspaceId, jobId: "gone", queue: "listen_scan", payload: {} });
    expect((await scanActivity(workspaceId, productA)).scan).toBeNull();
  });

  it("counts conversations waiting to be scored and replies waiting to be drafted", async () => {
    await enqueue(workspaceId, "opportunity_score", { opportunityIds: ["a", "b", "c"] });
    await enqueue(workspaceId, "opportunity_score", { opportunityIds: ["d"] });
    await enqueue(workspaceId, "draft_generate", { opportunityId: "a" });
    expect(await scanActivity(workspaceId, productA)).toEqual({ scan: null, scoring: 4, drafting: 1, siteScan: null });
  });
});
