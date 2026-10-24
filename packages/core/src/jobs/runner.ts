import { Cron } from "croner";
import { eq } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { claim, complete, enqueue, fail, type Job } from "@startica/db/queue";
import { jobRuns } from "@startica/db/schema";
import { runningJobs } from "./cancel.ts";
import { jobs, queueNames, type QueueName } from "./registry.ts";

/**
 * Runs queued jobs inside the app process (replaces the separate worker and
 * pgmq/pg_cron). One loop per queue, so a 15-minute Reddit scan never holds up
 * drafting; jobs within a queue run one at a time.
 */

const IDLE_MS = 1500;

// Schedules in the computer's local time. Jobs only run while the app is open.
export const SCHEDULES: { name: string; cron: string; queue: QueueName; when: string }[] = [
  { name: "listen", cron: "7 * * * *", queue: "listen_scan", when: "every hour" }, // hourly
  { name: "engagement", cron: "17 */6 * * *", queue: "engagement_sync", when: "every 6 hours" }, // every 6 hours
  { name: "metrics", cron: "15 8 * * *", queue: "metrics_sync", when: "every day at 08:15" }, // daily, 08:15
  { name: "replan", cron: "0 7 * * 1", queue: "roadmap_plan", when: "every Monday at 07:00" }, // weekly, Monday 07:00
  // After Monday's metrics sync; only for products with numbers, and only with an AI key.
  { name: "analytics-summary", cron: "45 8 * * 1", queue: "analytics_summary", when: "every Monday at 08:45" }, // weekly, Monday 08:45
  // Exposure monitoring for every verified site (security S2).
  { name: "security-monitor", cron: "47 6 * * *", queue: "security_monitor", when: "every day at 06:47" }, // daily, 06:47
  // Full rescans of sites whose last scan is older than their interval (accessibility A2).
  { name: "site-scans", cron: "37 * * * *", queue: "site_scan_due", when: "every hour" }, // hourly
  // Only for products with "Run every week" on (AI visibility costs money).
  { name: "visibility", cron: "30 9 * * 1", queue: "ai_visibility_run", when: "every Monday at 09:30" }, // weekly, Monday 09:30
  // Content calendar reminders: due planned posts get one desktop notification and a Today move.
  { name: "calendar", cron: "*/15 * * * *", queue: "calendar_remind", when: "every 15 minutes" }, // every 15 minutes
  // Only for products with the weekly competitor digest on (Intel → Following), after the 05:23 read.
  { name: "competitor-digest", cron: "30 8 * * 1", queue: "competitor_digest", when: "every Monday at 08:30" }, // weekly, Monday 08:30
  // Public numbers and posts of followed accounts (Intel → Benchmarks and Following), at a quiet hour.
  { name: "competitors", cron: "23 5 * * *", queue: "competitor_sync", when: "every day at 05:23" }, // daily, 05:23
];

type Log = (...args: unknown[]) => void;

async function runOne(queue: QueueName, job: Job, log: Log) {
  const def = jobs[queue];
  const db = getDb();
  const [run] = await db
    .insert(jobRuns)
    .values({ workspaceId: job.workspaceId, jobId: job.id, queue, attempt: job.attempts, payload: job.payload })
    .returning({ id: jobRuns.id });

  // Stopping a job (cancel.ts) aborts this signal; the job and any AI call in flight end early.
  const controller = new AbortController();
  runningJobs().set(job.id, controller);
  try {
    const result = await def.execute({ workspaceId: job.workspaceId, jobRunId: run!.id, signal: controller.signal }, job.payload);
    controller.signal.throwIfAborted(); // stopped right at the end: still counts as stopped
    await db.update(jobRuns).set({ status: "succeeded", result: result ?? null, finishedAt: new Date() }).where(eq(jobRuns.id, run!.id));
    await complete(job.id);
    log(`${queue}: succeeded`);
  } catch (error) {
    if (controller.signal.aborted) {
      await db.update(jobRuns).set({ status: "cancelled", result: null, error: "Stopped by you", finishedAt: new Date() }).where(eq(jobRuns.id, run!.id));
      await complete(job.id); // never retried
      log(`${queue}: stopped`);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    await db.update(jobRuns).set({ status: "failed", result: null, error: message, finishedAt: new Date() }).where(eq(jobRuns.id, run!.id)); // drops any progress note
    const retry = job.attempts < def.maxAttempts;
    // Back off 1, 4, 9… minutes between attempts.
    await fail(job.id, retry ? 60 * job.attempts ** 2 : null);
    log(`${queue}: failed (attempt ${job.attempts}${retry ? ", will retry" : ", giving up"}): ${message}`);
  } finally {
    runningJobs().delete(job.id);
  }
}

export type Runner = { stop(): Promise<void> };

export function startRunner(opts: { workspaceId: string; log?: Log }): Runner {
  const log = opts.log ?? ((...args) => console.log(new Date().toISOString(), "[jobs]", ...args));
  let stopping = false;

  const loops = queueNames.map(async (queue) => {
    while (!stopping) {
      try {
        const job = await claim(queue, jobs[queue].visibilityTimeoutSeconds);
        if (job) await runOne(queue, job, log);
        else await new Promise((r) => setTimeout(r, IDLE_MS));
      } catch (error) {
        log(`${queue}: runner error:`, error instanceof Error ? error.message : error);
        await new Promise((r) => setTimeout(r, IDLE_MS * 5));
      }
    }
  });

  const crons = SCHEDULES.map(
    (s) =>
      new Cron(s.cron, { name: `startica-${s.name}`, protect: true }, () => {
        void enqueue(opts.workspaceId, s.queue, {}).catch((error) => log(`schedule ${s.name}:`, error));
      }),
  );

  log(`started; queues: ${queueNames.join(", ")}`);
  return {
    async stop() {
      stopping = true;
      for (const c of crons) c.stop();
      await Promise.all(loops);
    },
  };
}
