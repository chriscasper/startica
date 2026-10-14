import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { getDb, transaction } from "./client.ts";
import { jobs } from "./schema.ts";

/**
 * Job queue in SQLite (replaces pgmq). A job is claimed by flipping it to
 * `running` with a lease (`locked_until`); if the process dies mid-job the lease
 * expires and the job becomes claimable again.
 */
export type Job = typeof jobs.$inferSelect;

export async function enqueue(
  workspaceId: string,
  queue: string,
  payload: Record<string, unknown>,
  opts: { runAfter?: Date } = {},
): Promise<string> {
  const [row] = await getDb()
    .insert(jobs)
    .values({ workspaceId, queue, payload: { ...payload, workspaceId }, runAfter: opts.runAfter ?? new Date() })
    .returning({ id: jobs.id });
  return row!.id;
}

/** Atomically claims the next ready job on `queue`, or returns null. */
export async function claim(queue: string, leaseSeconds: number): Promise<Job | null> {
  return transaction(async (db) => {
    const now = new Date();
    const [next] = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.queue, queue),
          or(
            and(eq(jobs.status, "queued"), lte(jobs.runAfter, now)),
            and(eq(jobs.status, "running"), lte(jobs.lockedUntil, now)), // lease expired
          ),
        ),
      )
      .orderBy(asc(jobs.runAfter))
      .limit(1);
    if (!next) return null;
    const [claimed] = await db
      .update(jobs)
      .set({ status: "running", attempts: sql`${jobs.attempts} + 1`, lockedUntil: new Date(now.getTime() + leaseSeconds * 1000) })
      .where(eq(jobs.id, next.id))
      .returning();
    return claimed ?? null;
  });
}

export async function complete(id: string): Promise<void> {
  await getDb().delete(jobs).where(eq(jobs.id, id));
}

/** Retries after `retryInSeconds`, or marks the job failed for good when null. */
export async function fail(id: string, retryInSeconds: number | null): Promise<void> {
  await getDb()
    .update(jobs)
    .set(
      retryInSeconds === null
        ? { status: "failed", lockedUntil: null }
        : { status: "queued", lockedUntil: null, runAfter: new Date(Date.now() + retryInSeconds * 1000) },
    )
    .where(eq(jobs.id, id));
}
