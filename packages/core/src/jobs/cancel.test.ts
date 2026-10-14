import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { jobRuns, jobs } from "@startica/db/schema";
import { activeJobs, runningJobs, stopJob } from "./cancel.ts";

let workspaceId = "";
beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-cancel-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
});
afterAll(() => closeDatabase());

describe("stopping jobs", () => {
  it("removes a waiting job and records it as stopped", async () => {
    const id = await enqueue(workspaceId, "intel_build", { productId: "p" });
    expect((await activeJobs(workspaceId)).map((j) => j.id)).toContain(id);
    expect(await stopJob(workspaceId, id)).toBe("removed");
    expect(await getDb().select().from(jobs).where(eq(jobs.id, id))).toEqual([]);
    const [run] = await getDb().select().from(jobRuns).where(eq(jobRuns.jobId, id));
    expect(run).toMatchObject({ status: "cancelled", queue: "intel_build" });
  });

  it("signals a running job instead of removing it", async () => {
    const id = await enqueue(workspaceId, "site_scan", { scanId: "s" });
    const controller = new AbortController();
    runningJobs().set(id, controller);
    expect(await stopJob(workspaceId, id)).toBe("stopping");
    expect(controller.signal.aborted).toBe(true);
    expect((await activeJobs(workspaceId)).find((j) => j.id === id)?.stopping).toBe(true);
    runningJobs().delete(id);
  });

  it("ignores jobs of another workspace or already gone", async () => {
    expect(await stopJob(workspaceId, "00000000-0000-4000-8000-000000000000")).toBe("not_found");
  });
});
