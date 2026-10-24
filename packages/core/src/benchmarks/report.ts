import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { competitorAccounts, competitors, competitorSnapshots, type BenchmarkChannel } from "@startica/db/schema";
import { localDayBefore } from "../metrics/history.ts";
import { BENCHMARK_CHANNELS, BENCHMARK_LABEL } from "./sources.ts";

/**
 * The Benchmarks view (Intel → Benchmarks): the owner's own accounts next to competitors', per
 * channel, from `competitor_snapshots`. Observations are rules, not AI: a few plain sentences
 * where the gap is big enough to mean something.
 */

export const SERIES_DAYS = 90;
const GROWTH_DAYS = 28;

export type SnapshotPoint = { day: string; followers: number | null; postsLast7: number | null; avgEngagement: number | null; karma: number | null; totalPosts: number | null };
export type Growth = { from: number; to: number; days: number };
export type BenchmarkAccount = {
  id: string;
  competitorId: string | null;
  /** "You" for the owner's own accounts, else the competitor's name. */
  name: string;
  own: boolean;
  channel: BenchmarkChannel;
  handle: string;
  url: string | null;
  status: "untested" | "ok" | "error";
  lastError: string | null;
  lastCheckedAt: Date | null;
  latest: SnapshotPoint | null;
  followerGrowth: Growth | null;
  series: SnapshotPoint[];
};
export type Observation = { channel: BenchmarkChannel; tone: "ahead" | "behind" | "note"; text: string };

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Followers gained over about four weeks: the latest snapshot against the oldest within 28 days of it (at least 7 days apart). */
export function followerGrowth(series: SnapshotPoint[]): Growth | null {
  const withFollowers = series.filter((p) => p.followers != null);
  const last = withFollowers.at(-1);
  if (!last) return null;
  const first = withFollowers.find((p) => dayDiff(p.day, last.day) <= GROWTH_DAYS);
  if (!first || dayDiff(first.day, last.day) < 7) return null;
  return { from: first.followers!, to: last.followers!, days: dayDiff(first.day, last.day) };
}

const fmt = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 10) / 10).toLocaleString("en-US");
const times = (r: number) => (r >= 10 ? `${Math.round(r)}×` : `${Math.round(r * 10) / 10}×`.replace(".0×", "×"));
const pct = (g: Growth) => (g.from > 0 ? (g.to - g.from) / g.from : null);
const weeks = (days: number) => (days >= 25 ? "4 weeks" : `${days} days`);

type ObsInput = Pick<BenchmarkAccount, "name" | "own" | "channel" | "latest" | "followerGrowth">;

/**
 * Rules over the latest snapshots, per channel (the six strongest are kept): posting frequency (2× or more, at least 3 posts),
 * follower growth (2× the rate, at least 20 gained), average engagement (1.5× or more, at least 3).
 * Compared with the owner's own account on that channel; a channel without one gets a nudge to add it.
 */
export function observations(accounts: ObsInput[]): Observation[] {
  const out: (Observation & { weight: number })[] = [];
  for (const channel of BENCHMARK_CHANNELS) {
    const here = accounts.filter((a) => a.channel === channel && a.latest);
    const rivals = here.filter((a) => !a.own);
    if (rivals.length === 0) continue;
    const label = BENCHMARK_LABEL[channel];
    const own = here.filter((a) => a.own).sort((a, b) => (b.latest!.followers ?? 0) - (a.latest!.followers ?? 0))[0];
    if (!own) {
      out.push({ channel, tone: "note", weight: 0.1, text: `Add your own ${label} account to compare with ${rivals.map((r) => r.name).join(", ")}.` });
      continue;
    }
    const mine = own.latest!;
    for (const r of rivals) {
      const theirs = r.latest!;
      // Posting frequency.
      if (theirs.postsLast7 != null && mine.postsLast7 != null) {
        if (mine.postsLast7 === 0 && theirs.postsLast7 >= 3) {
          out.push({ channel, tone: "behind", weight: 3, text: `${r.name} posted ${theirs.postsLast7} times on ${label} in the last 7 days; you didn't post there.` });
        } else if (mine.postsLast7 > 0 && theirs.postsLast7 >= 3 && theirs.postsLast7 >= 2 * mine.postsLast7) {
          const ratio = theirs.postsLast7 / mine.postsLast7;
          out.push({ channel, tone: "behind", weight: ratio, text: `${r.name} posts ${times(ratio)} more often than you on ${label} (${theirs.postsLast7} vs ${mine.postsLast7} posts in the last 7 days).` });
        } else if (theirs.postsLast7 > 0 && mine.postsLast7 >= 3 && mine.postsLast7 >= 2 * theirs.postsLast7) {
          const ratio = mine.postsLast7 / theirs.postsLast7;
          out.push({ channel, tone: "ahead", weight: ratio * 0.6, text: `You post ${times(ratio)} more often than ${r.name} on ${label} (${mine.postsLast7} vs ${theirs.postsLast7} in the last 7 days).` });
        }
      }
      // Follower growth.
      const g = r.followerGrowth;
      const m = own.followerGrowth;
      if (g && m) {
        const gr = pct(g);
        const mr = pct(m);
        const gained = g.to - g.from;
        const mineGained = m.to - m.from;
        if (gr != null && mr != null && gained >= 20 && gr > 0 && gr >= 2 * Math.max(mr, 0)) {
          out.push({ channel, tone: "behind", weight: 2 + gr * 10, text: `${r.name} gained ${fmt(gained)} followers on ${label} in ${weeks(g.days)} (+${Math.round(gr * 100)}%); you ${mineGained > 0 ? `gained ${fmt(mineGained)} (+${Math.round(mr * 100)}%)` : mineGained < 0 ? `lost ${fmt(-mineGained)}` : "gained none"}.` });
        } else if (gr != null && mr != null && mineGained >= 20 && mr > 0 && mr >= 2 * Math.max(gr, 0)) {
          out.push({ channel, tone: "ahead", weight: 1 + mr * 10, text: `Your ${label} followers grew faster than ${r.name}'s: +${Math.round(mr * 100)}% against ${gr > 0 ? `+${Math.round(gr * 100)}%` : `${Math.round(gr * 100)}%`} in ${weeks(m.days)}.` });
        }
      }
      // Average engagement per post.
      if (theirs.avgEngagement != null && mine.avgEngagement != null) {
        const hi = Math.max(theirs.avgEngagement, mine.avgEngagement);
        const lo = Math.min(theirs.avgEngagement, mine.avgEngagement);
        if (hi >= 3 && hi >= 1.5 * Math.max(lo, 0.5)) {
          const ratio = lo > 0 ? hi / lo : null;
          const them = theirs.avgEngagement > mine.avgEngagement;
          const how = ratio ? `${times(ratio)} the engagement` : "more engagement";
          out.push({
            channel,
            tone: them ? "behind" : "ahead",
            weight: (ratio ?? 3) * (them ? 0.9 : 0.7),
            text: them
              ? `${r.name}'s ${label} posts get ${how} of yours (${fmt(theirs.avgEngagement)} vs ${fmt(mine.avgEngagement)} ${channel === "hackernews" ? "points and comments on stories" : "likes, reposts and replies"} on average).`
              : `Your ${label} posts get ${how} of ${r.name}'s (${fmt(mine.avgEngagement)} vs ${fmt(theirs.avgEngagement)} on average).`,
          });
        }
      }
    }
  }
  // The strongest comparisons first, then the nudges to add an own account.
  const strip = ({ weight: _, ...o }: Observation & { weight: number }) => o;
  const compared = out.filter((o) => o.tone !== "note").sort((a, b) => b.weight - a.weight).slice(0, 6);
  return [...compared, ...out.filter((o) => o.tone === "note")].map(strip);
}

/** Everything the Benchmarks view shows for a product. Plain loader: reads the clock. */
export async function loadBenchmarks(productId: string, now = new Date()) {
  const db = getDb();
  const [accounts, rivals] = await Promise.all([
    // Company and own accounts with numbers; people's accounts and feeds are the competitor watch's.
    db
      .select()
      .from(competitorAccounts)
      .where(and(eq(competitorAccounts.productId, productId), isNull(competitorAccounts.personId), inArray(competitorAccounts.channel, [...BENCHMARK_CHANNELS])))
      .orderBy(asc(competitorAccounts.createdAt)),
    db.select({ id: competitors.id, name: competitors.name }).from(competitors).where(eq(competitors.productId, productId)).orderBy(asc(competitors.createdAt)),
  ]);
  const from = localDayBefore(now, SERIES_DAYS - 1);
  const snaps = accounts.length
    ? await db
        .select()
        .from(competitorSnapshots)
        .where(and(inArray(competitorSnapshots.accountId, accounts.map((a) => a.id)), gte(competitorSnapshots.day, from)))
        .orderBy(asc(competitorSnapshots.day))
    : [];
  const nameOf = new Map(rivals.map((c) => [c.id, c.name]));
  // Own accounts first, then competitors in Intel's order: chart colors follow this, never rank.
  const order = (a: (typeof accounts)[number]) => (a.competitorId ? 1 + rivals.findIndex((c) => c.id === a.competitorId) : 0);
  const views: BenchmarkAccount[] = [...accounts]
    .sort((a, b) => order(a) - order(b))
    .map((a) => {
      const series = snaps
        .filter((s) => s.accountId === a.id)
        .map((s) => ({ day: s.day, followers: s.followers, postsLast7: s.postsLast7, avgEngagement: s.avgEngagement, karma: s.karma, totalPosts: s.totalPosts }));
      return {
        id: a.id,
        competitorId: a.competitorId,
        name: a.competitorId ? (nameOf.get(a.competitorId) ?? "Competitor") : "You",
        own: !a.competitorId,
        channel: a.channel,
        handle: a.handle,
        url: a.url,
        status: a.status,
        lastError: a.lastError,
        lastCheckedAt: a.lastCheckedAt,
        latest: series.at(-1) ?? null,
        followerGrowth: followerGrowth(series),
        series,
      };
    });
  return {
    accounts: views,
    competitors: rivals,
    channels: BENCHMARK_CHANNELS.filter((c) => views.some((v) => v.channel === c)),
    observations: observations(views),
  };
}

export type Benchmarks = Awaited<ReturnType<typeof loadBenchmarks>>;
