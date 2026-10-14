import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { jobRuns, jobs, siteScans, sitePages, sites } from "@startica/db/schema";

/**
 * What listening is doing right now, for the UI's scan indicators. Read from the
 * job queue (the source of truth): a `job_runs` row alone can stay "running"
 * forever if the app quit mid-job.
 */
export type ScanActivity = {
  /** A scan covering this product is queued or running. */
  scan: null | {
    /** The listen_scan job, for Stop. */
    jobId: string;
    running: boolean;
    /** When the running attempt started (ms). */
    startedAt: number | null;
    /** The channel being read right now, as reported by the scan. */
    channel: string | null;
  };
  /** Conversations waiting to be scored (whole workspace: score jobs don't carry a product). */
  scoring: number;
  /** Replies waiting to be drafted (whole workspace). */
  drafting: number;
  /** An accessibility scan or page check of one of the product's sites, queued or running. */
  siteScan: null | { scanId: string; siteId: string; siteName: string; scope: "full" | "page" | "group"; running: boolean; pagesDone: number; pagesTotal: number };
};

export const IDLE_ACTIVITY: ScanActivity = { scan: null, scoring: 0, drafting: 0, siteScan: null };

const ACTIVE = ["queued", "running"] as const;

export async function scanActivity(workspaceId: string, productId: string | null): Promise<ScanActivity> {
  const db = getDb();
  const productPayload = sql`json_extract(${jobs.payload}, '$.productId')`;
  const [scans, [scoring], [drafting]] = await Promise.all([
    db
      .select({ id: jobs.id, status: jobs.status })
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspaceId),
          eq(jobs.queue, "listen_scan"),
          inArray(jobs.status, [...ACTIVE]),
          // Scheduled scans cover every product (no productId in the payload).
          productId ? or(isNull(productPayload), eq(productPayload, productId)) : undefined,
        ),
      ),
    db
      .select({ n: sql<number>`coalesce(sum(json_array_length(${jobs.payload}, '$.opportunityIds')), 0)` })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.queue, "opportunity_score"), inArray(jobs.status, [...ACTIVE]))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.queue, "draft_generate"), inArray(jobs.status, [...ACTIVE]))),
  ]);

  let scan: ScanActivity["scan"] = null;
  if (scans.length > 0) {
    const running = scans.find((j) => j.status === "running");
    scan = { jobId: (running ?? scans[0]!).id, running: Boolean(running), startedAt: null, channel: null };
    if (running) {
      const [run] = await db
        .select({ startedAt: jobRuns.startedAt, result: jobRuns.result })
        .from(jobRuns)
        .where(and(eq(jobRuns.jobId, running.id), eq(jobRuns.status, "running")))
        .orderBy(desc(jobRuns.startedAt))
        .limit(1);
      if (run) {
        scan.startedAt = run.startedAt.getTime();
        scan.channel = (run.result as { progress?: { channel?: string } } | null)?.progress?.channel ?? null;
      }
    }
  }
  return { scan, scoring: Number(scoring?.n ?? 0), drafting: Number(drafting?.n ?? 0), siteScan: productId ? await siteScanActivity(productId) : null };
}

async function siteScanActivity(productId: string): Promise<ScanActivity["siteScan"]> {
  const db = getDb();
  const [active] = await db
    .select({ id: siteScans.id, siteId: sites.id, siteName: sites.name, scope: siteScans.scope, status: siteScans.status })
    .from(siteScans)
    .innerJoin(sites, eq(sites.id, siteScans.siteId))
    .where(and(eq(sites.productId, productId), inArray(siteScans.status, ["queued", "running"])))
    .orderBy(desc(siteScans.status)) // running before queued
    .limit(1);
  if (!active) return null;
  const [pages] = await db
    .select({ total: sql<number>`count(*)`, done: sql<number>`coalesce(sum(${sitePages.state} != 'queued'), 0)` })
    .from(sitePages)
    .where(eq(sitePages.scanId, active.id));
  return {
    scanId: active.id,
    siteId: active.siteId,
    siteName: active.siteName,
    scope: active.scope,
    running: active.status === "running",
    pagesDone: Number(pages?.done ?? 0),
    pagesTotal: Number(pages?.total ?? 0),
  };
}

/**
 * Lets a running job say what it's on (shown in the UI). Stored in its run's
 * `result`, which the runner replaces when the job finishes.
 */
export async function reportProgress(jobRunId: string | undefined, progress: Record<string, unknown>): Promise<void> {
  if (!jobRunId) return;
  await getDb().update(jobRuns).set({ result: { progress } }).where(eq(jobRuns.id, jobRunId));
}
