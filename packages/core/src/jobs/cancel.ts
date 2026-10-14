import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { jobRuns, jobs } from "@startica/db/schema";

/**
 * Stopping jobs (scans, AI work) the user doesn't want to wait for. A waiting job is
 * removed from the queue; a running one gets its AbortSignal aborted: AI calls in
 * flight are cut off, scans stop at their next step, and the runner records the run as
 * "cancelled" without retrying. Whatever was finished before stays (pages checked,
 * conversations found).
 */

const KEY = Symbol.for("startica.runningJobs");
const g = globalThis as unknown as { [KEY]?: Map<string, AbortController> };

/** Jobs running in this process, by job id (shared through globalThis: Next bundles modules more than once). */
export function runningJobs(): Map<string, AbortController> {
  g[KEY] ??= new Map();
  return g[KEY]!;
}

export type StopResult = "stopping" | "removed" | "not_found";

export async function stopJob(workspaceId: string, jobId: string): Promise<StopResult> {
  const controller = runningJobs().get(jobId);
  if (controller) {
    controller.abort(new Error("Stopped by you"));
    return "stopping";
  }
  // Waiting, or left "running" by an app that quit: nothing is working on it, so remove it.
  const [job] = await getDb().select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, workspaceId)));
  if (!job || (job.status !== "queued" && job.status !== "running")) return "not_found";
  await getDb().delete(jobs).where(eq(jobs.id, jobId));
  await getDb()
    .insert(jobRuns)
    .values({ workspaceId, jobId, queue: job.queue, attempt: job.attempts, payload: job.payload, status: "cancelled", error: "Stopped by you before it ran", finishedAt: new Date() });
  return "removed";
}

/** Jobs waiting or running, newest first, with when the running ones started (System page). */
export async function activeJobs(workspaceId: string) {
  const rows = await getDb()
    .select()
    .from(jobs)
    .where(and(eq(jobs.workspaceId, workspaceId), inArray(jobs.status, ["queued", "running"])))
    .orderBy(desc(jobs.createdAt))
    .limit(50);
  const runs = rows.length
    ? await getDb()
        .select({ jobId: jobRuns.jobId, startedAt: sql<number>`max(${jobRuns.startedAt})` })
        .from(jobRuns)
        .where(and(inArray(jobRuns.jobId, rows.map((r) => r.id)), eq(jobRuns.status, "running")))
        .groupBy(jobRuns.jobId)
    : [];
  return rows.map((r) => ({ ...r, startedAt: runs.find((x) => x.jobId === r.id)?.startedAt ?? null, stopping: runningJobs().get(r.id)?.signal.aborted ?? false }));
}

/** The queued or running job whose payload has `key` = `value` (e.g. a site scan's scanId). */
export async function jobByPayload(workspaceId: string, queues: string[], key: string, value: string) {
  const [job] = await getDb()
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, workspaceId),
        inArray(jobs.queue, queues),
        inArray(jobs.status, ["queued", "running"]),
        sql`json_extract(${jobs.payload}, ${`$.${key}`}) = ${value}`,
      ),
    )
    .limit(1);
  return job?.id ?? null;
}
