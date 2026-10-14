import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { jobRuns, jobs, products, siteScans, sites } from "@startica/db/schema";
import { backgroundTasks, QUEUE_LABELS } from "./background.ts";
import { runningJobs } from "./cancel.ts";
import { queueNames } from "./registry.ts";

let workspaceId = "";
let productId = "";
let siteId = "";
let scanId = "";
beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-background-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning())[0]!.id;
  siteId = (await getDb().insert(sites).values({ workspaceId, productId, name: "fieldnote.example", startUrl: "https://fieldnote.example/", ownershipConfirmedAt: new Date() }).returning())[0]!.id;
  scanId = (await getDb().insert(siteScans).values({ workspaceId, siteId, scope: "full", status: "running" }).returning())[0]!.id;
});
afterAll(() => closeDatabase());

/** Marks a job running, with a run that started `minutesAgo` and reported `progress`. */
async function startJob(jobId: string, minutesAgo: number, progress?: Record<string, unknown>) {
  const [job] = await getDb().update(jobs).set({ status: "running" }).where(eq(jobs.id, jobId)).returning();
  await getDb()
    .insert(jobRuns)
    .values({ workspaceId, jobId, queue: job!.queue, payload: job!.payload, status: "running", result: progress ? { progress } : null, startedAt: new Date(Date.now() - minutesAgo * 60_000) });
}

describe("background tasks", () => {
  it("is empty when nothing is queued", async () => {
    expect(await backgroundTasks(workspaceId)).toEqual([]);
  });

  it("says what each job is, why it runs, how far along it is and how to stop it", async () => {
    const scheduled = await enqueue(workspaceId, "listen_scan", {});
    await startJob(scheduled, 5, { channel: "reddit" });
    const intel = await enqueue(workspaceId, "intel_build", { productId });
    const scan = await enqueue(workspaceId, "site_scan", { scanId });
    await startJob(scan, 1, { pagesDone: 3, pagesTotal: 40 });
    const scoring = [
      await enqueue(workspaceId, "opportunity_score", { opportunityIds: ["a", "b"] }),
      await enqueue(workspaceId, "opportunity_score", { opportunityIds: ["c"] }),
    ];

    const tasks = await backgroundTasks(workspaceId);
    // Running first (oldest first), then waiting.
    expect(tasks.map((t) => t.queue)).toEqual(["listen_scan", "site_scan", "intel_build", "opportunity_score"]);
    const [listen, site, build, score] = tasks;

    expect(listen).toMatchObject({ label: "Finding conversations", status: "running", why: "Scheduled: runs every hour while Startica is open.", progress: { channel: "reddit" }, href: "/inbox", stop: { jobIds: [scheduled] } });
    expect(Date.now() - listen!.since).toBeGreaterThanOrEqual(5 * 60_000 - 1000);

    expect(site).toMatchObject({ subject: "fieldnote.example", progress: { pagesDone: 3, pagesTotal: 40 }, href: `/accessibility?site=${siteId}`, stop: { siteScan: scanId } });
    expect(build).toMatchObject({ subject: "Fieldnote", status: "waiting", why: expect.stringMatching(/^You asked for intel/), href: "/intel", stop: { jobIds: [intel] } });
    // Batches of the same queue are one line that stops them all.
    expect(score).toMatchObject({ count: 2, items: 3, stop: { jobIds: expect.arrayContaining(scoring) } });
  });

  it("shows a job being stopped as stopping", async () => {
    const [listen] = await backgroundTasks(workspaceId);
    const controller = new AbortController();
    runningJobs().set(listen!.id, controller);
    controller.abort();
    expect((await backgroundTasks(workspaceId)).find((t) => t.id === listen!.id)?.status).toBe("stopping");
    runningJobs().delete(listen!.id);
  });

  it("has a name in words for every queue", () => {
    expect(queueNames.filter((q) => !QUEUE_LABELS[q])).toEqual([]);
  });
});
