import { and, asc, eq, gte, isNull, ne } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { competitors, conversations, opportunities, products, sentiments, type OpportunityMentions, type Sentiment } from "@startica/db/schema";
import { channelLabel } from "../channels/labels.ts";
import { refreshListeningMatches } from "./matching.ts";

/**
 * Listening trends (ARCHITECTURE.md 8.1), computed on the fly by rules, no AI: how many
 * conversations the search found per day, per listening keyword and per community; spikes
 * against each one's own recent baseline; the sentiment mix from scoring; share of voice
 * (conversations naming the product against each competitor). Counts every conversation
 * the search found for the product (archived ones too: they still matched a keyword),
 * except near-duplicates and answers to replies on the owner's own posts (origin `reply`).
 * A conversation's day is its local posting day, or the day it was found.
 */

/** YYYY-MM-DD in local time (as growth/moves.ts localDay; not imported, moves.ts imports this file). */
const localDay = (date: Date) => date.toLocaleDateString("en-CA");

export const TREND_RANGES = [30, 90] as const;
export type TrendRange = (typeof TREND_RANGES)[number];

/**
 * Spike thresholds (chosen 2026-10-21). A day spikes when it has at least 5 conversations
 * and at least 3× the average of the 14 days before it (the average counts as at least 1,
 * so a quiet keyword needs 5 in a day, not 1). Today and yesterday are checked: today is
 * still filling up. A week spikes when the last 7 days have at least 10 and at least 2× the
 * weekly average of the 3 weeks before. A series needs 14 days of history for a day spike
 * and 28 for a week spike, so a new product doesn't spike on everything.
 */
export const SPIKE_RULES = {
  dayMin: 5,
  dayRatio: 3,
  dayBaselineDays: 14,
  weekMin: 10,
  weekRatio: 2,
  weekBaselineWeeks: 3,
} as const;

export type SpikeHit = { window: "day" | "week"; offset: number; count: number; baseline: number; ratio: number };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Checks one daily series (oldest first, the last entry is today) for a spike. `historyDays`
 * is how many days of data exist for it. Returns the strongest hit, or null. `offset` is how
 * many days before today the spiking day is (0 for a week spike).
 */
export function detectSpike(counts: number[], historyDays = counts.length, rules = SPIKE_RULES): SpikeHit | null {
  const hits: SpikeHit[] = [];
  const n = counts.length;
  if (historyDays >= rules.dayBaselineDays + 1) {
    for (const offset of [0, 1]) {
      const i = n - 1 - offset;
      if (i - rules.dayBaselineDays < 0) continue;
      const count = counts[i]!;
      const baseline = sum(counts.slice(i - rules.dayBaselineDays, i)) / rules.dayBaselineDays;
      if (count >= rules.dayMin && count >= rules.dayRatio * Math.max(baseline, 1)) hits.push({ window: "day", offset, count, baseline: round1(baseline), ratio: round1(count / Math.max(baseline, 1)) });
    }
  }
  const baseDays = rules.weekBaselineWeeks * 7;
  if (historyDays >= 7 + baseDays && n >= 7 + baseDays) {
    const count = sum(counts.slice(n - 7));
    const baseline = sum(counts.slice(n - 7 - baseDays, n - 7)) / rules.weekBaselineWeeks;
    if (count >= rules.weekMin && count >= rules.weekRatio * Math.max(baseline, 1)) hits.push({ window: "week", offset: 0, count, baseline: round1(baseline), ratio: round1(count / Math.max(baseline, 1)) });
  }
  return hits.sort((a, b) => b.ratio - a.ratio)[0] ?? null;
}

export type TrendRow = {
  day: string;
  channel: string;
  community: string | null;
  matchedKeywords: string[] | null;
  mentions: OpportunityMentions | null;
  sentiment: Sentiment | null;
};

export type TrendSeries = { key: string; label: string; total: number; counts: number[] };
export type Spike = SpikeHit & { kind: "keyword" | "community"; key: string; label: string; day: string };
export type ShareOfVoice = { id: string | null; name: string; mentions: number; share: number };

export type ListeningTrends = {
  range: number;
  days: string[];
  total: TrendSeries;
  keywords: TrendSeries[];
  communities: TrendSeries[];
  spikes: Spike[];
  sentiment: { counts: Record<Sentiment, number>; scored: number; unscored: number };
  shareOfVoice: ShareOfVoice[];
  /** Days since the product's first found conversation (spikes need 14). */
  historyDays: number;
};

/** The local days from `range - 1` days before `today` up to it. */
export function dayList(today: string, range: number): string[] {
  const end = new Date(`${today}T12:00:00`);
  return Array.from({ length: range }, (_, i) => localDay(new Date(end.getTime() - (range - 1 - i) * 86400_000)));
}

export const communityKey = (channel: string, community: string | null) => `${channel}:${community ?? ""}`;
export function communityLabel(channel: string, community: string | null): string {
  if (!community) return channelLabel(channel);
  if (channel === "reddit") return `r/${community.replace(/^r\//i, "")}`;
  if (channel === "hackernews") return "Hacker News";
  return `${community} (${channelLabel(channel)})`;
}

const MAX_SERIES = 8;
/** Days loaded for spike baselines, whatever the range shown. */
const BASELINE_DAYS = 7 + SPIKE_RULES.weekBaselineWeeks * 7;

/** Pure: trends from rows already bucketed by local day. `days` covers at least the range (more for baselines). */
export function buildTrends(
  rows: TrendRow[],
  opts: { today: string; range: number; historyDays: number; productName: string; competitors: { id: string; name: string }[] },
): ListeningTrends {
  const span = Math.max(opts.range, BASELINE_DAYS);
  const all = dayList(opts.today, span);
  const index = new Map(all.map((d, i) => [d, i]));
  const shown = all.slice(span - opts.range);
  const inRange = new Set(shown);

  const series = new Map<string, { label: string; counts: number[] }>();
  const bump = (key: string, label: string, i: number) => {
    let s = series.get(key);
    if (!s) series.set(key, (s = { label, counts: new Array<number>(span).fill(0) }));
    s.counts[i]!++;
  };
  const sentiment = Object.fromEntries(sentiments.map((s) => [s, 0])) as Record<Sentiment, number>;
  let unscored = 0;
  const voice = new Map<string | null, number>([[null, 0], ...opts.competitors.map((c) => [c.id, 0] as const)]);

  for (const r of rows) {
    const i = index.get(r.day);
    if (i === undefined) continue;
    bump("total", "All conversations", i);
    for (const k of r.matchedKeywords ?? []) bump(`kw:${k.toLowerCase()}`, k, i);
    bump(`community:${communityKey(r.channel, r.community)}`, communityLabel(r.channel, r.community), i);
    if (!inRange.has(r.day)) continue;
    if (r.sentiment) sentiment[r.sentiment]++;
    else unscored++;
    if (r.mentions?.product) voice.set(null, voice.get(null)! + 1);
    for (const id of r.mentions?.competitorIds ?? []) if (voice.has(id)) voice.set(id, voice.get(id)! + 1);
  }

  const visible = (key: string): TrendSeries => {
    const s = series.get(key);
    const counts = s ? s.counts.slice(span - opts.range) : new Array<number>(opts.range).fill(0);
    return { key, label: s?.label ?? "All conversations", total: sum(counts), counts };
  };
  const ranked = (prefix: string) =>
    [...series.keys()]
      .filter((k) => k.startsWith(prefix))
      .map(visible)
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  const spikes: Spike[] = [];
  for (const [key, s] of series) {
    if (key === "total") continue;
    const hit = detectSpike(s.counts, opts.historyDays);
    if (!hit) continue;
    const kind = key.startsWith("kw:") ? "keyword" : "community";
    spikes.push({ ...hit, kind, key, label: s.label, day: all[span - 1 - hit.offset]! });
  }
  spikes.sort((a, b) => b.ratio - a.ratio || b.count - a.count);

  const voiceTotal = sum([...voice.values()]);
  const names = new Map(opts.competitors.map((c) => [c.id, c.name]));
  const shareOfVoice: ShareOfVoice[] = [...voice]
    .map(([id, mentions]) => ({ id, name: id === null ? opts.productName : names.get(id)!, mentions, share: voiceTotal ? mentions / voiceTotal : 0 }))
    .sort((a, b) => (a.id === null ? -1 : b.id === null ? 1 : b.mentions - a.mentions));

  return {
    range: opts.range,
    days: shown,
    total: visible("total"),
    keywords: ranked("kw:").slice(0, MAX_SERIES),
    communities: ranked("community:").slice(0, MAX_SERIES),
    spikes,
    sentiment: { counts: sentiment, scored: sum(Object.values(sentiment)), unscored },
    shareOfVoice,
    historyDays: opts.historyDays,
  };
}

/** Loads and computes a product's listening trends for the last 30 or 90 days. Refreshes stale keyword matches first. */
export async function listeningTrends(productId: string, range: number = 30, now = new Date()): Promise<ListeningTrends> {
  await refreshListeningMatches(productId);
  const db = getDb();
  const span = Math.max(range, BASELINE_DAYS);
  const since = new Date(now.getTime() - (span + 1) * 86400_000);
  const [[product], rivals, rows, [first]] = await Promise.all([
    db.select({ name: products.name }).from(products).where(eq(products.id, productId)),
    db.select({ id: competitors.id, name: competitors.name }).from(competitors).where(eq(competitors.productId, productId)).orderBy(asc(competitors.createdAt)),
    db
      .select({
        postedAt: conversations.postedAt,
        createdAt: opportunities.createdAt,
        channel: conversations.channel,
        community: conversations.community,
        matchedKeywords: opportunities.matchedKeywords,
        mentions: opportunities.mentions,
        sentiment: opportunities.sentiment,
      })
      .from(opportunities)
      .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
      .where(and(eq(opportunities.productId, productId), ne(conversations.origin, "reply"), isNull(opportunities.duplicateOfId), gte(opportunities.createdAt, since))),
    db
      .select({ createdAt: opportunities.createdAt })
      .from(opportunities)
      .where(eq(opportunities.productId, productId))
      .orderBy(asc(opportunities.createdAt))
      .limit(1),
  ]);
  const historyDays = first ? Math.floor((now.getTime() - first.createdAt.getTime()) / 86400_000) + 1 : 0;
  return buildTrends(
    rows.map((r) => ({ ...r, day: localDay(r.postedAt ?? r.createdAt) })),
    { today: localDay(now), range, historyDays, productName: product?.name ?? "", competitors: rivals },
  );
}

/** The listening spikes worth a Today move: the strongest first. */
export async function listeningSpikes(productId: string, now = new Date()): Promise<Spike[]> {
  return (await listeningTrends(productId, 30, now)).spikes;
}
