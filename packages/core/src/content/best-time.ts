import { and, desc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { communities, contentPieces, contentSnapshots, conversations, engagementSnapshots, opportunities, publications } from "@startica/db/schema";
import { channelLabel } from "../channels/labels.ts";
import { matchCommunity } from "../distribution/jobs.ts";

/**
 * Best time to post (ARCHITECTURE.md, Content Studio): rules, no AI. Per channel, from the
 * owner's own posts (Inbox replies and Content Studio pieces) — when they went out against
 * the engagement they got — and, per watched community, from when the conversations Startica
 * found there were posted. Hours and weekdays are the computer's local time. Below a minimum
 * sample there is no hint, only "not enough data yet".
 */

/** Own posts with a measured engagement needed before their timing says anything. */
export const MIN_POSTS = 8;
/** Conversations found in a community (or a channel's watched communities) needed for an activity hint. */
export const MIN_CONVERSATIONS = 30;
/** How far back each source is read. */
export const POSTS_WINDOW_DAYS = 180;
export const ACTIVITY_WINDOW_DAYS = 60;

export type TimeSample = { at: Date; /** Engagement for own posts, 1 for a conversation. */ weight: number };

export type BestTime =
  | { key: string; label: string; enough: true; source: "engagement" | "activity"; sample: number; hours: number[]; days: number[] }
  | { key: string; label: string; enough: false; source: "engagement" | "activity"; sample: number; need: number };

export type BestTimes = {
  /** By channel ("bluesky", "reddit", …). */
  channels: Record<string, BestTime>;
  /** By watched community, keyed `<channel>:<community name>` (lowercase). */
  communities: Record<string, BestTime>;
};

export const communityKey = (channel: string, name: string) => `${channel}:${name.trim().toLowerCase()}`;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Up to `max` peaks: the best bin, then the best not within `gap` of one already picked (circular). */
function peaks(scores: (number | null)[], max: number, gap: number): number[] {
  const n = scores.length;
  const order = scores
    .map((s, i) => ({ s, i }))
    .filter((x): x is { s: number; i: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const picked: number[] = [];
  for (const { i } of order) {
    if (picked.length >= max) break;
    if (picked.some((p) => Math.min(Math.abs(p - i), n - Math.abs(p - i)) <= gap)) continue;
    picked.push(i);
  }
  return picked;
}

/**
 * The good hours (0–23) and weekdays (0 = Sunday) in a set of samples, or null when they show
 * no pattern. Activity: where the most conversations happen (hour counts smoothed over the
 * neighboring hours). Engagement: hours and days whose posts did better than the average post,
 * counting only hours with at least two posts around them.
 */
export function bestWindows(samples: TimeSample[], kind: "engagement" | "activity"): { hours: number[]; days: number[] } | null {
  if (samples.length === 0) return null;
  const byHour = Array.from({ length: 24 }, () => [] as number[]);
  const byDay = Array.from({ length: 7 }, () => [] as number[]);
  for (const s of samples) {
    byHour[s.at.getHours()]!.push(s.weight);
    byDay[s.at.getDay()]!.push(s.weight);
  }
  const around = (h: number) => [...byHour[(h + 23) % 24]!, ...byHour[h]!, ...byHour[(h + 1) % 24]!];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  if (kind === "activity") {
    // Smoothed over the neighbors; the hour's own count breaks ties, so the peak is the busiest hour itself.
    const counts = byHour.map((_, h) => around(h).length + byHour[h]!.length * 0.001);
    const average = counts.reduce((a, b) => a + b, 0) / 24;
    // A flat day (no hour clearly busier than the rest) is no hint.
    const hours = peaks(counts.map((c) => (c > average * 1.15 ? c : null)), 3, 2);
    const dayAverage = samples.length / 7;
    const days = peaks(byDay.map((d) => (d.length >= dayAverage ? d.length : null)), 3, 0);
    return hours.length ? { hours: hours.sort((a, b) => a - b), days: days.sort((a, b) => a - b) } : null;
  }

  const overall = mean(samples.map((s) => s.weight));
  const hourScores = byHour.map((_, h) => {
    // Only hours the owner has actually posted at, judged with their neighbors (at least two posts).
    const xs = around(h);
    if (byHour[h]!.length === 0 || xs.length < 2) return null;
    const m = mean(xs);
    return m > overall ? m + (byHour[h]!.length ? mean(byHour[h]!) : 0) * 0.001 : null;
  });
  const hours = peaks(hourScores, 3, 2);
  const days = peaks(byDay.map((d) => (d.length >= 2 && mean(d) > overall ? mean(d) : null)), 3, 0);
  return hours.length ? { hours: hours.sort((a, b) => a - b), days: days.sort((a, b) => a - b) } : null;
}

/** A hint from samples, or "not enough data yet" below the minimum (or when they show no pattern). */
export function hintFrom(key: string, label: string, samples: TimeSample[], source: "engagement" | "activity"): BestTime {
  const need = source === "engagement" ? MIN_POSTS : MIN_CONVERSATIONS;
  if (samples.length < need) return { key, label, enough: false, source, sample: samples.length, need };
  const windows = bestWindows(samples, source);
  // Enough samples but no clear pattern yet: ask for more before guessing.
  if (!windows) return { key, label, enough: false, source, sample: samples.length, need: Math.max(need * 2, samples.length + 1) };
  return { key, label, enough: true, source, sample: samples.length, ...windows };
}

/** Engagement as one number: points (likes, upvotes) plus replies, which count double. */
export const engagementOf = (snap: { score: number | null; replies: number | null }) => (snap.score ?? 0) + 2 * (snap.replies ?? 0);

/** Combines own posts and community activity into hints per channel and per community. */
export function computeBestTimes(input: {
  posts: { channel: string; at: Date; engagement: number }[];
  activity: { channel: string; community: string; label: string; at: Date }[];
}): BestTimes {
  const channels: Record<string, BestTime> = {};
  const communitiesOut: Record<string, BestTime> = {};
  const channelNames = new Set([...input.posts.map((p) => p.channel), ...input.activity.map((a) => a.channel)]);
  for (const channel of channelNames) {
    const own = input.posts.filter((p) => p.channel === channel).map((p) => ({ at: p.at, weight: p.engagement }));
    const fromPosts = hintFrom(channel, channelLabel(channel), own, "engagement");
    if (fromPosts.enough) {
      channels[channel] = fromPosts;
      continue;
    }
    // Not enough of the owner's own posts yet: when the channel's watched communities are busiest.
    const busy = input.activity.filter((a) => a.channel === channel).map((a) => ({ at: a.at, weight: 1 }));
    const fromActivity = hintFrom(channel, channelLabel(channel), busy, "activity");
    channels[channel] = fromActivity.enough || own.length === 0 ? fromActivity : fromPosts;
  }
  const keys = new Map<string, { channel: string; label: string; at: Date[] }>();
  for (const a of input.activity) {
    const key = communityKey(a.channel, a.community);
    const entry = keys.get(key) ?? { channel: a.channel, label: a.label, at: [] };
    entry.at.push(a.at);
    keys.set(key, entry);
  }
  for (const [key, entry] of keys) {
    communitiesOut[key] = hintFrom(key, entry.label, entry.at.map((at) => ({ at, weight: 1 })), "activity");
  }
  return { channels, communities: communitiesOut };
}

/** The hint for a post: the community's own when it has enough data, else the channel's; null when nothing is known. */
export function hintFor(times: BestTimes, channel: string, community?: string | null): BestTime | null {
  const own = community ? times.communities[communityKey(channel, community)] : undefined;
  if (own?.enough) return own;
  const byChannel = times.channels[channel];
  if (byChannel?.enough) return byChannel;
  return own ?? byChannel ?? null;
}

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The hint in words, for the calendar, the planning control and the content plan prompt. */
export function describeHint(hint: BestTime | null): string {
  if (!hint) return "Not enough data yet: post a few times (with links, so Startica can track them) or watch communities on this channel.";
  if (!hint.enough) {
    return hint.source === "engagement"
      ? `Not enough data yet: ${hint.sample} of ${hint.need} measured posts on ${hint.label}.`
      : `Not enough data yet: ${hint.sample} of ${hint.need} conversations found in ${hint.label}.`;
  }
  const when = `around ${list(hint.hours.map(hourLabel))}${hint.days.length ? ` on ${list(hint.days.map((d) => DAY_NAMES[d]!))}` : ""}`;
  return hint.source === "engagement"
    ? `Your ${hint.label} posts did best ${when} (from ${hint.sample} posts).`
    : `${hint.label} is busiest ${when} (from ${hint.sample} conversations).`;
}

/**
 * The next good time at or after `from` (plus a little lead, so there's time to look the post
 * over): the start of a good hour on a good day, within two weeks. Null without a hint.
 */
export function nextGoodTime(hint: BestTime | null, from: Date, leadMinutes = 30): Date | null {
  if (!hint?.enough || hint.hours.length === 0) return null;
  const earliest = from.getTime() + leadMinutes * 60_000;
  const start = new Date(from);
  start.setMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 14; i++) {
    const t = new Date(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours() + i);
    if (t.getTime() < earliest) continue;
    if (!hint.hours.includes(t.getHours())) continue;
    if (hint.days.length && !hint.days.includes(t.getDay())) continue;
    return t;
  }
  // Good hours, but none on a good day in two weeks (can't happen with 7-day cycles; kept as a guard).
  return null;
}

// --- Loading from the database -----------------------------------------------------------

/** Every hint for a product, computed on the fly (a few small queries). */
export async function loadBestTimes(productId: string, now = new Date()): Promise<BestTimes> {
  const db = getDb();
  const postsSince = new Date(now.getTime() - POSTS_WINDOW_DAYS * 86400_000);
  const activitySince = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86400_000);
  const [pubs, pieces, convs, watched] = await Promise.all([
    db
      .select({ id: publications.id, channel: publications.channel, postedAt: publications.postedAt })
      .from(publications)
      .where(and(eq(publications.productId, productId), gte(publications.postedAt, postsSince))),
    db
      .select({ id: contentPieces.id, channel: contentPieces.channel, postedAt: contentPieces.postedAt })
      .from(contentPieces)
      .where(and(eq(contentPieces.productId, productId), eq(contentPieces.status, "posted"), isNotNull(contentPieces.postedAt), gte(contentPieces.postedAt, postsSince))),
    db
      .select({ channel: conversations.channel, community: conversations.community, url: conversations.url, postedAt: conversations.postedAt })
      .from(opportunities)
      .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
      .where(and(eq(opportunities.productId, productId), ne(conversations.origin, "reply"), gte(conversations.postedAt, activitySince))),
    db
      .select({ channel: communities.channel, name: communities.name, url: communities.url })
      .from(communities)
      .where(and(eq(communities.productId, productId), eq(communities.status, "watching"))),
  ]);
  const [pubSnaps, pieceSnaps] = await Promise.all([
    pubs.length
      ? db
          .select({ id: engagementSnapshots.publicationId, score: engagementSnapshots.score, replies: engagementSnapshots.replies, removed: engagementSnapshots.removed })
          .from(engagementSnapshots)
          .where(inArray(engagementSnapshots.publicationId, pubs.map((p) => p.id)))
          .orderBy(desc(engagementSnapshots.capturedAt))
      : [],
    pieces.length
      ? db
          .select({ id: contentSnapshots.pieceId, score: contentSnapshots.score, replies: contentSnapshots.replies, removed: contentSnapshots.removed })
          .from(contentSnapshots)
          .where(inArray(contentSnapshots.pieceId, pieces.map((p) => p.id)))
          .orderBy(desc(contentSnapshots.capturedAt))
      : [],
  ]);
  const latest = (snaps: { id: string; score: number | null; replies: number | null; removed: boolean }[]) => {
    const out = new Map<string, (typeof snaps)[number]>();
    for (const s of snaps) if (!out.has(s.id)) out.set(s.id, s);
    return out;
  };
  const pubLatest = latest(pubSnaps);
  const pieceLatest = latest(pieceSnaps);
  const posts: { channel: string; at: Date; engagement: number }[] = [];
  for (const p of pubs) {
    const snap = pubLatest.get(p.id);
    if (snap && !snap.removed) posts.push({ channel: p.channel, at: p.postedAt, engagement: engagementOf(snap) });
  }
  for (const p of pieces) {
    const snap = pieceLatest.get(p.id);
    if (snap && !snap.removed && p.postedAt) posts.push({ channel: p.channel, at: p.postedAt, engagement: engagementOf(snap) });
  }
  const activity: { channel: string; community: string; label: string; at: Date }[] = [];
  for (const c of convs) {
    if (!c.postedAt) continue;
    const match = matchCommunity(c.channel, { community: c.community, url: c.url }, watched.filter((w) => w.channel === c.channel));
    if (match) activity.push({ channel: c.channel, community: match.name, label: c.channel === "reddit" ? `r/${match.name}` : match.name, at: c.postedAt });
  }
  return computeBestTimes({ posts, activity });
}
