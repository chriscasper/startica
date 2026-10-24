import { eq } from "drizzle-orm";
import type { Db } from "@startica/db/client";
import * as s from "@startica/db/schema";
import { localDayBefore } from "../metrics/history.ts";

/**
 * The demo's competitor benchmarks (Intel → Benchmarks): Fieldnote's own accounts and two
 * competitors' on made-up handles (`.example` domains, fictional usernames), with five weeks of
 * daily snapshots written as `competitor_sync` would (the demo makes no requests). One account
 * shows an error, as a handle that no longer exists would.
 */

type DemoAccount = {
  competitor: string | null; // competitor name, or null for Fieldnote's own
  channel: "bluesky" | "mastodon" | "reddit" | "hackernews";
  handle: string;
  url: string;
  /** Followers (or HN karma) 34 days ago and today; null where the channel doesn't say. */
  followers?: [number, number];
  karma?: [number, number];
  totalPosts?: [number, number];
  postsLast7: number;
  avgEngagement: number | null;
  error?: string;
};

const ACCOUNTS: DemoAccount[] = [
  { competitor: null, channel: "bluesky", handle: "fieldnote.example", url: "https://bsky.app/profile/fieldnote.example", followers: [395, 468], totalPosts: [212, 236], postsLast7: 4, avgEngagement: 9.5 },
  { competitor: null, channel: "mastodon", handle: "fieldnote@social.example", url: "https://social.example/@fieldnote", followers: [176, 205], totalPosts: [140, 158], postsLast7: 3, avgEngagement: 4.2 },
  { competitor: null, channel: "hackernews", handle: "fieldnote_demo", url: "https://news.ycombinator.com/user?id=fieldnote_demo", karma: [318, 352], totalPosts: [88, 97], postsLast7: 2, avgEngagement: 14 },
  { competitor: "TerraJot", channel: "bluesky", handle: "terrajot.example", url: "https://bsky.app/profile/terrajot.example", followers: [2910, 3060], totalPosts: [1630, 1690], postsLast7: 12, avgEngagement: 6.1 },
  { competitor: "TerraJot", channel: "mastodon", handle: "terrajot@social.example", url: "https://social.example/@terrajot", followers: [636, 655], totalPosts: [802, 806], postsLast7: 1, avgEngagement: 2 },
  { competitor: "Quadrat", channel: "bluesky", handle: "quadrat.example", url: "https://bsky.app/profile/quadrat.example", followers: [1050, 1500], totalPosts: [540, 566], postsLast7: 5, avgEngagement: 21 },
  { competitor: "Quadrat", channel: "reddit", handle: "quadrat_example_team", url: "https://www.reddit.com/user/quadrat_example_team", postsLast7: 9, avgEngagement: null },
  { competitor: "Quadrat", channel: "mastodon", handle: "quadrat@social.example", url: "https://social.example/@quadrat", postsLast7: 0, avgEngagement: null, error: "HTTP 404 for https://social.example/api/v1/accounts/lookup?acct=quadrat" },
];

const SPAN = 34;

export async function seedDemoBenchmarks(db: Db, workspaceId: string, productId: string, ago: (days: number, hours?: number) => Date): Promise<number> {
  const rivals = await db.select({ id: s.competitors.id, name: s.competitors.name }).from(s.competitors).where(eq(s.competitors.productId, productId));
  const idOf = new Map(rivals.map((c) => [c.name, c.id]));
  let n = 0;
  for (const [i, a] of ACCOUNTS.entries()) {
    const competitorId = a.competitor ? (idOf.get(a.competitor) ?? null) : null;
    if (a.competitor && !competitorId) continue;
    const [account] = await db
      .insert(s.competitorAccounts)
      .values({
        workspaceId,
        productId,
        competitorId,
        channel: a.channel,
        handle: a.handle,
        url: a.url,
        status: a.error ? "error" : "ok",
        lastError: a.error ?? null,
        lastCheckedAt: ago(0, 4),
        createdAt: ago(SPAN + 1, -i),
      })
      .returning({ id: s.competitorAccounts.id });
    if (a.error) continue;
    const between = (pair: [number, number] | undefined, t: number) => (pair ? Math.round(pair[0] + (pair[1] - pair[0]) * t) : null);
    const rows = Array.from({ length: SPAN + 1 }, (_, k) => {
      const daysAgo = SPAN - k;
      const t = k / SPAN;
      const wobble = ((k * 7 + i * 3) % 5) - 2; // -2…2, deterministic
      const today = daysAgo === 0;
      return {
        workspaceId,
        accountId: account!.id,
        day: localDayBefore(ago(0), daysAgo),
        followers: between(a.followers, t),
        karma: between(a.karma, t),
        totalPosts: between(a.totalPosts, t),
        postsLast7: today ? a.postsLast7 : Math.max(0, a.postsLast7 + Math.round(wobble / 2)),
        avgEngagement: a.avgEngagement == null ? null : today ? a.avgEngagement : Math.max(0, Math.round((a.avgEngagement + wobble * 0.6) * 10) / 10),
        capturedAt: ago(daysAgo, 4),
      };
    });
    await db.insert(s.competitorSnapshots).values(rows);
    n += 1;
  }
  return n;
}
