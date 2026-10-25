import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { competitorAccounts, competitorPeople, competitorPosts, competitors } from "@startica/db/schema";

/**
 * What competitors and the people at them did (ARCHITECTURE.md section 3, "Competitor watch"):
 * the activity feed from `competitor_posts` (posts and page changes) and its read state. The
 * briefs written from it are in `briefs.ts`.
 */

export type ActivityItem = {
  id: string;
  competitorId: string | null;
  competitor: string | null;
  person: string | null;
  role: string | null;
  channel: string;
  handle: string;
  url: string;
  title: string | null;
  text: string;
  kind: string;
  postedAt: Date | null;
  engagement: number | null;
  seen: boolean;
  relevance: "high" | "medium" | "low" | null;
  relevanceWhy: string | null;
};

type ActivityFilter = {
  competitorId?: string;
  accountId?: string;
  personId?: string;
  /** Posted (else found) in [since, until). */
  since?: Date;
  until?: Date;
  limit?: number;
  unseenOnly?: boolean;
  /** Leave out what was scored low. */
  relevantOnly?: boolean;
};

const when = sql`coalesce(${competitorPosts.postedAt}, ${competitorPosts.createdAt})`;

/** Newest first: a competitor's posts and its people's, or the whole product's (own accounts left out). */
export async function loadActivity(productId: string, opts: ActivityFilter = {}): Promise<ActivityItem[]> {
  const rows = await getDb()
    .select({ post: competitorPosts, account: competitorAccounts, competitor: competitors.name, person: competitorPeople.name, role: competitorPeople.role })
    .from(competitorPosts)
    .innerJoin(competitorAccounts, eq(competitorAccounts.id, competitorPosts.accountId))
    .innerJoin(competitors, eq(competitors.id, competitorAccounts.competitorId))
    .leftJoin(competitorPeople, eq(competitorPeople.id, competitorAccounts.personId))
    .where(
      and(
        eq(competitorPosts.productId, productId),
        opts.competitorId ? eq(competitorAccounts.competitorId, opts.competitorId) : undefined,
        opts.accountId ? eq(competitorPosts.accountId, opts.accountId) : undefined,
        opts.personId ? eq(competitorAccounts.personId, opts.personId) : undefined,
        opts.since ? gte(when, opts.since.getTime()) : undefined,
        opts.until ? lt(when, opts.until.getTime()) : undefined,
        opts.unseenOnly ? isNull(competitorPosts.seenAt) : undefined,
        opts.relevantOnly ? sql`coalesce(${competitorPosts.relevance}, '') <> 'low'` : undefined,
      ),
    )
    .orderBy(desc(when))
    .limit(opts.limit ?? 100);
  return rows.map(({ post, account, competitor, person, role }) => ({
    id: post.id,
    competitorId: account.competitorId,
    competitor,
    person,
    role: role || null,
    channel: account.channel,
    handle: account.handle,
    url: post.url,
    title: post.title,
    text: post.text,
    kind: post.kind,
    postedAt: post.postedAt,
    engagement: post.engagement,
    seen: post.seenAt !== null,
    relevance: post.relevance,
    relevanceWhy: post.relevanceWhy,
  }));
}

/** Unseen posts by competitor, for badges. */
export async function unseenCounts(productId: string): Promise<Record<string, number>> {
  const rows = await getDb()
    .select({ competitorId: competitorAccounts.competitorId, n: sql<number>`count(*)` })
    .from(competitorPosts)
    .innerJoin(competitorAccounts, eq(competitorAccounts.id, competitorPosts.accountId))
    .where(and(eq(competitorPosts.productId, productId), isNull(competitorPosts.seenAt)))
    .groupBy(competitorAccounts.competitorId);
  return Object.fromEntries(rows.flatMap((r) => (r.competitorId ? [[r.competitorId, Number(r.n)]] : [])));
}

/** Marks posts seen: a competitor's, or all of the product's. */
export async function markActivitySeen(workspaceId: string, productId: string, competitorId?: string): Promise<void> {
  const db = getDb();
  const accounts = await db
    .select({ id: competitorAccounts.id })
    .from(competitorAccounts)
    .where(and(eq(competitorAccounts.workspaceId, workspaceId), eq(competitorAccounts.productId, productId), competitorId ? eq(competitorAccounts.competitorId, competitorId) : undefined));
  if (!accounts.length) return;
  await db
    .update(competitorPosts)
    .set({ seenAt: new Date() })
    .where(and(inArray(competitorPosts.accountId, accounts.map((a) => a.id)), isNull(competitorPosts.seenAt)));
}
