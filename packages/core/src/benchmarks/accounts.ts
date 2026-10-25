import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { competitorAccounts, competitorPeople, competitorPosts, competitors, competitorSnapshots, products } from "@startica/db/schema";
import type { AiContext } from "../ai/client.ts";
import { pageChange, readPage } from "../competitors/pages.ts";
import { checkDue, lastChecked, loadWatchSettings, markChecked } from "../competitors/settings.ts";
import { jobByPayload } from "../jobs/cancel.ts";
import { localDayBefore } from "../metrics/history.ts";
import { fetchAccount, FOLLOW_CHANNELS, normalizeHandle, WATCH_CHANNELS, type AccountPost, type AccountRead } from "./sources.ts";

/**
 * Followed accounts (ARCHITECTURE.md section 3, "Competitor benchmarks" and "Competitor watch"):
 * public handles per competitor and channel, the owner's own (competitor null), and the accounts
 * of people at a competitor (person set). Read by `competitor_sync` as often as the product's
 * watch settings say (daily by default): numbers for the benchmark charts, recent posts and page
 * changes for the competitor's activity; then the briefs are brought up to date (competitor_digest).
 */

export const accountInput = z.object({
  competitorId: z.string().trim().transform((v) => (v && v !== "own" ? v : null)),
  personId: z.string().trim().optional().transform((v) => v || null),
  channel: z.enum(WATCH_CHANNELS),
  handle: z.string().trim().min(1, "Enter a handle").max(500),
});

/** Newest posts kept per account. */
export const POSTS_PER_ACCOUNT = 100;

/** Adds an account and reads it right away (in the background). */
export async function addBenchmarkAccount(workspaceId: string, productId: string, input: z.input<typeof accountInput>): Promise<string> {
  const db = getDb();
  const v = accountInput.parse(input);
  const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.workspaceId, workspaceId)));
  if (!product) throw new Error("Product not found");
  if (v.competitorId) {
    const [c] = await db.select({ id: competitors.id }).from(competitors).where(and(eq(competitors.id, v.competitorId), eq(competitors.productId, productId)));
    if (!c) throw new Error("Competitor not found");
  }
  if (v.personId) {
    const [p] = await db.select({ competitorId: competitorPeople.competitorId }).from(competitorPeople).where(and(eq(competitorPeople.id, v.personId), eq(competitorPeople.productId, productId)));
    if (!p || p.competitorId !== v.competitorId) throw new Error("Person not found");
  }
  const { handle, url } = normalizeHandle(v.channel, v.handle);
  const [row] = await db
    .insert(competitorAccounts)
    .values({ workspaceId, productId, competitorId: v.competitorId, personId: v.personId, channel: v.channel, handle, url })
    .onConflictDoNothing()
    .returning({ id: competitorAccounts.id });
  if (!row) throw new Error("That account is already tracked");
  if (process.env.STARTICA_DEMO !== "1") await enqueue(workspaceId, "competitor_sync", { productId, accountId: row.id });
  return row.id;
}

export async function removeBenchmarkAccount(workspaceId: string, accountId: string): Promise<void> {
  await getDb().delete(competitorAccounts).where(and(eq(competitorAccounts.id, accountId), eq(competitorAccounts.workspaceId, workspaceId)));
}

/** Check now: reads every account of the product. */
export async function syncBenchmarksNow(workspaceId: string, productId: string): Promise<void> {
  if (process.env.STARTICA_DEMO === "1") throw new Error("The demo doesn't read other sites");
  await enqueue(workspaceId, "competitor_sync", { productId });
}

// --- The daily job -------------------------------------------------------------------------------

export const competitorSyncPayload = z.object({
  workspaceId: z.guid(),
  productId: z.guid().optional(),
  accountId: z.guid().optional(),
});

/** Pause between accounts on the open APIs (Reddit has its own ~1 request/minute limiter). */
const GAP_MS = 1_500;
const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/** The briefs job for a product, once at a time. */
async function queueBriefs(workspaceId: string, productId: string): Promise<void> {
  if (await jobByPayload(workspaceId, ["competitor_digest"], "productId", productId)) return;
  await enqueue(workspaceId, "competitor_digest", { productId });
}

/** A page's change since its last read, as posts (none on the first read or when nothing much changed). */
async function readWatchedPage(account: typeof competitorAccounts.$inferSelect, now: Date, signal?: AbortSignal): Promise<AccountRead> {
  return { numbers: null, posts: await pageChange(account, await readPage(account.handle, signal), now) };
}

/**
 * A blog address without a feed becomes a watched page: Startica tells what changed on it instead.
 * Returns the account as it is now.
 */
async function feedOrPage(account: typeof competitorAccounts.$inferSelect, now: Date, signal?: AbortSignal): Promise<{ account: typeof competitorAccounts.$inferSelect; read: AccountRead }> {
  try {
    return { account, read: await fetchAccount("rss", account.handle, { now, signal }) };
  } catch (error) {
    if (!(error instanceof Error && /^No RSS or Atom feed found/.test(error.message))) throw error;
    const [page] = await getDb().update(competitorAccounts).set({ channel: "page" }).where(eq(competitorAccounts.id, account.id)).returning();
    if (!page) throw error;
    return { account: page, read: await readWatchedPage(page, now, signal) };
  }
}

/**
 * Reads each account once and writes today's snapshot (one row per account and day; a second run
 * the same day replaces it). Each account has its own try/catch: an error is kept on the account
 * and shown next to it, and the rest still run. The hourly schedule (no product or account) reads
 * only products whose watch settings say a read is due; every product read gets its briefs updated.
 */
export async function runCompetitorSync(ctx: AiContext, payload: z.infer<typeof competitorSyncPayload>, opts: { gapMs?: number; now?: () => Date } = {}) {
  if (process.env.STARTICA_DEMO === "1") return { skipped: "demo" };
  const db = getDb();
  const clock = opts.now ?? (() => new Date());
  const scheduled = !payload.productId && !payload.accountId;
  let productIds: string[] | undefined;
  if (scheduled) {
    const all = await db.select({ id: products.id }).from(products).where(eq(products.workspaceId, payload.workspaceId));
    productIds = [];
    for (const p of all) if (checkDue((await loadWatchSettings(p.id)).checkEvery, await lastChecked(p.id), clock())) productIds.push(p.id);
    if (!productIds.length) return { skipped: "nothing due" };
  }
  const accounts = await db
    .select()
    .from(competitorAccounts)
    .where(
      and(
        eq(competitorAccounts.workspaceId, payload.workspaceId),
        payload.productId ? eq(competitorAccounts.productId, payload.productId) : undefined,
        payload.accountId ? eq(competitorAccounts.id, payload.accountId) : undefined,
        productIds ? inArray(competitorAccounts.productId, productIds) : undefined,
        inArray(competitorAccounts.channel, [...FOLLOW_CHANNELS]),
      ),
    )
    .orderBy(asc(competitorAccounts.channel), asc(competitorAccounts.createdAt));

  const results = { ok: 0, failed: 0 };
  let first = true;
  for (const listed of accounts) {
    ctx.signal?.throwIfAborted();
    let account = listed;
    if (!first && account.channel !== "reddit") await pause(opts.gapMs ?? GAP_MS, ctx.signal);
    first = false;
    const now = clock();
    try {
      let read: AccountRead;
      if (account.channel === "page") read = await readWatchedPage(account, now, ctx.signal);
      else if (account.channel === "rss") ({ account, read } = await feedOrPage(account, now, ctx.signal));
      else read = await fetchAccount(account.channel, account.handle, { now, signal: ctx.signal });
      const { numbers: n, posts } = read;
      if (n) {
        const values = { followers: n.followers, totalPosts: n.totalPosts, karma: n.karma, postsLast7: n.postsLast7, avgEngagement: n.avgEngagement, capturedAt: now };
        await db
          .insert(competitorSnapshots)
          .values({ workspaceId: account.workspaceId, accountId: account.id, day: localDayBefore(now, 0), ...values })
          .onConflictDoUpdate({ target: [competitorSnapshots.accountId, competitorSnapshots.day], set: { ...values, updatedAt: now } });
      }
      // The first read of an account is what it had already posted: seen, so the feed shows only what's new from here.
      await storePosts(account, posts, now, account.lastCheckedAt === null);
      await db
        .update(competitorAccounts)
        .set({ status: "ok", lastError: null, lastCheckedAt: now, url: n?.url ?? account.url })
        .where(eq(competitorAccounts.id, account.id));
      results.ok += 1;
    } catch (error) {
      if (ctx.signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await db.update(competitorAccounts).set({ status: "error", lastError: message.slice(0, 500), lastCheckedAt: now }).where(eq(competitorAccounts.id, account.id));
      results.failed += 1;
    }
  }

  // Bring the briefs up to date: every product read (or, for one account, its product).
  let touched = productIds ?? [...new Set(accounts.map((a) => a.productId))];
  if (payload.accountId && !accounts.length) {
    // A web-search link isn't read here, but it still needs its brief.
    touched = (await db.select({ productId: competitorAccounts.productId }).from(competitorAccounts).where(eq(competitorAccounts.id, payload.accountId))).map((a) => a.productId);
  }
  if (!payload.accountId && payload.productId) touched = [payload.productId];
  for (const productId of touched) {
    if (!payload.accountId) await markChecked(productId, clock());
    await queueBriefs(payload.workspaceId, productId);
  }
  return results;
}

/**
 * Keeps an account's recent posts: new ones inserted (seen already when `seen`), known ones get
 * their engagement updated, and only the newest POSTS_PER_ACCOUNT stay.
 */
export async function storePosts(account: typeof competitorAccounts.$inferSelect, posts: AccountPost[], now: Date, seen: boolean): Promise<number> {
  const db = getDb();
  const unique = [...new Map(posts.map((p) => [p.externalId, p])).values()];
  const known = new Set(
    unique.length
      ? (
          await db
            .select({ externalId: competitorPosts.externalId })
            .from(competitorPosts)
            .where(and(eq(competitorPosts.accountId, account.id), inArray(competitorPosts.externalId, unique.map((p) => p.externalId))))
        ).map((r) => r.externalId)
      : [],
  );
  let added = 0;
  for (const p of unique) {
    if (known.has(p.externalId)) {
      await db
        .update(competitorPosts)
        .set({ engagement: p.engagement, updatedAt: now })
        .where(and(eq(competitorPosts.accountId, account.id), eq(competitorPosts.externalId, p.externalId)));
      continue;
    }
    await db.insert(competitorPosts).values({
      workspaceId: account.workspaceId,
      productId: account.productId,
      accountId: account.id,
      externalId: p.externalId,
      url: p.url,
      title: p.title,
      text: p.text,
      kind: p.kind,
      postedAt: p.postedAt,
      engagement: p.engagement,
      seenAt: seen ? now : null,
    });
    added += 1;
  }
  const keep = await db
    .select({ id: competitorPosts.id })
    .from(competitorPosts)
    .where(eq(competitorPosts.accountId, account.id))
    .orderBy(desc(sql`coalesce(${competitorPosts.postedAt}, ${competitorPosts.createdAt})`))
    .limit(POSTS_PER_ACCOUNT);
  if (keep.length === POSTS_PER_ACCOUNT) {
    await db.delete(competitorPosts).where(and(eq(competitorPosts.accountId, account.id), notInArray(competitorPosts.id, keep.map((k) => k.id))));
  }
  return added;
}
