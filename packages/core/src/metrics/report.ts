import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import {
  adCampaigns,
  adGroups,
  ads,
  adSpend,
  connections,
  contentPieces,
  contentSnapshots,
  engagementSnapshots,
  metricsSnapshots,
  publications,
} from "@startica/db/schema";
import { spendInWindow } from "../ads/results.ts";
import { channelFromUrl, redditCommunity } from "../channels/index.ts";
import { channelLabel } from "../channels/labels.ts";
import { utmContentOf } from "../distribution/utm.ts";
import { aiAssistantOf, parseSourceDimension } from "../search/ai-referrals.ts";
import { CHANNEL_GROUPS, channelGroup, type ChannelGroup } from "./channels.ts";
import { historyDays, localDayBefore } from "./history.ts";
import { WEB_LABEL, webSource, type WebSource } from "./web.ts";

/**
 * The Analytics screen's numbers for one period, next to the period before it (ARCHITECTURE.md
 * section 8.2). Everything is read from `metrics_snapshots` and Startica's own records; no
 * network and no AI. Highlights are rules over these numbers, written as plain sentences.
 */

export const RANGE_CHOICES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "12 months" },
  { days: 486, label: "16 months" },
] as const;
export const DEFAULT_RANGE = 30;

export type Period = { start: string; end: string; days: number };
export type Pair = { now: number; before: number | null };
export type Point = { day: string; value: number; before?: number | null };

export function periodsFor(days: number, now = new Date()): { current: Period; previous: Period } {
  return {
    current: { start: localDayBefore(now, days - 1), end: localDayBefore(now, 0), days },
    previous: { start: localDayBefore(now, 2 * days - 1), end: localDayBefore(now, days), days },
  };
}

/** The local days of a period, oldest first. */
export function daysOf(p: Period): string[] {
  const [y, m, d] = p.end.split("-").map(Number) as [number, number, number];
  return Array.from({ length: p.days }, (_, i) => localDayBefore(new Date(y, m - 1, d), p.days - 1 - i));
}

/** The ranges worth offering: the ones the kept history covers. */
export function rangesFor(history: number) {
  return RANGE_CHOICES.filter((r) => r.days <= history);
}

export type Breakdown = { key: string; label: string; sessions: number; before: number | null; keyEvents?: number; engaged?: number };
export type ChannelRow = { group: ChannelGroup; sessions: number; before: number | null; keyEvents: number; engaged: number; sources: Breakdown[] };
export type PostRow = {
  id: string;
  kind: "reply" | "content";
  postedAt: Date;
  channel: string;
  community: string | null;
  where: string;
  url: string | null;
  text: string;
  mentionsProduct: boolean;
  replies: number | null;
  removed: boolean;
  visits: number;
  keyEvents: number;
};
export type PlaceRow = { where: string; channel: string; posts: number; linked: number; replies: number; visits: number; keyEvents: number; removed: number };
export type Highlight = { tone: "up" | "down" | "note"; text: string; href?: string };

const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const country = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (code: string) => {
  try {
    return country.of(code) ?? code;
  } catch {
    return code;
  }
};
const DEVICE_LABEL: Record<string, string> = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet", "smart tv": "Smart TV" };

export async function loadAnalyticsReport(productId: string, days = DEFAULT_RANGE, now = new Date()) {
  const db = getDb();
  const history = await historyDays(productId);
  const { current, previous } = periodsFor(days, now);
  const web: WebSource | null = await webSource(productId);
  const conns = await db
    .select({ kind: connections.kind, status: connections.status, config: connections.config })
    .from(connections)
    .where(eq(connections.productId, productId));
  const connected = new Set<string>(conns.filter((c) => c.status === "ok").map((c) => c.kind));
  if (web && connected.has(web)) connected.add("web");
  const webSrc = web ?? "ga4";

  // Every row in both periods, summed per metric and split in SQL; daily rows only for totals.
  const inPeriods = and(eq(metricsSnapshots.productId, productId), gte(metricsSnapshots.day, previous.start), lte(metricsSnapshots.day, current.end));
  const [grouped, daily, coverage] = await Promise.all([
    db
      .select({
        source: metricsSnapshots.source,
        metric: metricsSnapshots.metric,
        dimension: metricsSnapshots.dimension,
        now: sql<number>`coalesce(sum(case when ${metricsSnapshots.day} >= ${current.start} then ${metricsSnapshots.value} end), 0)`,
        before: sql<number>`coalesce(sum(case when ${metricsSnapshots.day} < ${current.start} then ${metricsSnapshots.value} end), 0)`,
      })
      .from(metricsSnapshots)
      .where(and(inPeriods, sql`${metricsSnapshots.dimension} <> ''`))
      .groupBy(metricsSnapshots.source, metricsSnapshots.metric, metricsSnapshots.dimension),
    db
      .select({ source: metricsSnapshots.source, metric: metricsSnapshots.metric, day: metricsSnapshots.day, value: metricsSnapshots.value })
      .from(metricsSnapshots)
      .where(and(inPeriods, eq(metricsSnapshots.dimension, "")))
      .orderBy(metricsSnapshots.day),
    db
      .select({ source: metricsSnapshots.source, oldest: sql<string>`min(${metricsSnapshots.day})` })
      .from(metricsSnapshots)
      .where(and(eq(metricsSnapshots.productId, productId), eq(metricsSnapshots.dimension, "")))
      .groupBy(metricsSnapshots.source),
  ]);
  // Compare only against a period the stored data covers, per source.
  const covers = (source: string) => Boolean(coverage.find((c) => c.source === source && c.oldest <= previous.start));
  const previousComplete = covers(webSrc);
  const cmp = (n: number, source: string = webSrc) => (covers(source) ? n : null);

  const currentDays = daysOf(current);
  const previousDays = daysOf(previous);
  const dailyOf = (source: string, metric: string) => {
    const byDay = new Map<string, number>();
    for (const r of daily) if (r.source === source && r.metric === metric) byDay.set(r.day, (byDay.get(r.day) ?? 0) + Number(r.value));
    return byDay;
  };
  const has = (source: string, metric: string) => daily.some((r) => r.source === source && r.metric === metric && r.day >= current.start);
  const total = (source: string, metric: string): Pair => {
    const byDay = dailyOf(source, metric);
    return { now: sumOf(currentDays.map((d) => byDay.get(d) ?? 0)), before: cmp(sumOf(previousDays.map((d) => byDay.get(d) ?? 0)), source) };
  };
  /** The last value in each period (subscriptions, MRR, active users: levels, not counts). */
  const level = (source: string, metric: string): Pair & { has: boolean } => {
    const byDay = dailyOf(source, metric);
    const last = (list: string[]) => [...list].reverse().find((d) => byDay.has(d));
    const n = last(currentDays);
    const b = last(previousDays);
    return { now: n ? byDay.get(n)! : 0, before: b ? byDay.get(b)! : null, has: Boolean(n) };
  };
  /** Daily points for a chart, with the same day of the period before for comparison. */
  const series = (source: string, metric: string, mode: "sum" | "level" = "sum"): Point[] | null => {
    if (!has(source, metric)) return null;
    const byDay = dailyOf(source, metric);
    let last = 0;
    return currentDays.map((day, i) => {
      const v = byDay.get(day);
      if (mode === "level" && v != null) last = v;
      const before = byDay.get(previousDays[i]!);
      return { day, value: mode === "level" ? (v ?? last) : (v ?? 0), before: covers(source) ? (before ?? (mode === "sum" ? 0 : null)) : null };
    });
  };

  // --- Traffic -------------------------------------------------------------------------
  const webRows = grouped.filter((r) => r.source === webSrc);
  const split = (metric: string, prefix: string) => webRows.filter((r) => r.metric === metric && r.dimension.startsWith(prefix));
  const byKey = (metric: string, prefix: string) => new Map(split(metric, prefix).map((r) => [r.dimension, r]));
  const breakdown = (prefix: string, label: (key: string) => string, limit: number, extra = false): Breakdown[] => {
    const keyEvents = byKey("key_events", prefix);
    const engaged = byKey("engaged_sessions", prefix);
    return split("sessions", prefix)
      .filter((r) => r.now > 0)
      .sort((a, b) => b.now - a.now)
      .slice(0, limit)
      .map((r) => {
        const key = r.dimension.slice(prefix.length);
        return {
          key,
          label: label(key),
          sessions: Number(r.now),
          before: cmp(Number(r.before)),
          ...(extra ? { keyEvents: Number(keyEvents.get(r.dimension)?.now ?? 0), engaged: Number(engaged.get(r.dimension)?.now ?? 0) } : {}),
        };
      });
  };

  const sessions = total(webSrc, "sessions");
  const keyEvents = total(webSrc, "key_events");
  const pageviews = total(webSrc, "pageviews");
  const engagedSessions = total(webSrc, "engaged_sessions");
  const engagementSeconds = total(webSrc, "engagement_seconds");
  const newUsers = total(webSrc, "new_users");
  const users = total(webSrc, "users");
  const rate = (a: number, b: number) => (b > 0 ? a / b : null);
  const ratePair = (a: Pair, b: Pair) => ({ now: rate(a.now, b.now), before: a.before != null && b.before != null ? rate(a.before, b.before) : null });

  const sources = breakdown("source:", (k) => k, 500, true);
  const channels = new Map<ChannelGroup, ChannelRow>();
  const beforeByGroup = new Map<ChannelGroup, number>();
  for (const r of split("sessions", "source:")) {
    const { source, medium } = parseSourceDimension(r.dimension);
    const group = channelGroup(source, medium);
    beforeByGroup.set(group, (beforeByGroup.get(group) ?? 0) + Number(r.before));
  }
  for (const s of sources) {
    const { source, medium } = parseSourceDimension(`source:${s.key}`);
    const group = channelGroup(source, medium);
    const row = channels.get(group) ?? { group, sessions: 0, before: cmp(beforeByGroup.get(group) ?? 0), keyEvents: 0, engaged: 0, sources: [] };
    row.sessions += s.sessions;
    row.keyEvents += s.keyEvents ?? 0;
    row.engaged += s.engaged ?? 0;
    row.sources.push(s);
    channels.set(group, row);
  }
  // A group that had visits only before still shows, at zero.
  for (const [group, before] of beforeByGroup) {
    if (!channels.has(group) && before > 0) channels.set(group, { group, sessions: 0, before: cmp(before), keyEvents: 0, engaged: 0, sources: [] });
  }
  const channelRows = [...channels.values()].sort((a, b) => b.sessions - a.sessions || CHANNEL_GROUPS.indexOf(a.group) - CHANNEL_GROUPS.indexOf(b.group));
  const aiAssistants = new Map<string, number>();
  for (const s of sources) {
    const { source, medium } = parseSourceDimension(`source:${s.key}`);
    const name = aiAssistantOf(source) ?? (medium === "ai-assistant" ? source : null);
    if (name) aiAssistants.set(name, (aiAssistants.get(name) ?? 0) + s.sessions);
  }

  const events = split("key_events", "event:")
    .filter((r) => r.now > 0 || r.before > 0)
    .sort((a, b) => b.now - a.now)
    .map((r) => ({ key: r.dimension.slice("event:".length), count: Number(r.now), before: cmp(Number(r.before)) }));

  // --- Revenue and product ----------------------------------------------------------------
  const mrr = level("stripe", "mrr");
  const activeSubs = level("stripe", "active_subscriptions");
  const trials = level("stripe", "trials");
  const newSubs = total("stripe", "new_subscriptions");
  const cancellations = total("stripe", "cancellations");
  const mrrNew = total("stripe", "mrr_new");
  const mrrChurned = total("stripe", "mrr_churned");
  const revenue = total("stripe", "revenue");
  const payingNow = activeSubs.now - trials.now;
  const subsAtStart = (() => {
    const byDay = dailyOf("stripe", "active_subscriptions");
    const d = [...previousDays].reverse().find((x) => byDay.has(x));
    return d ? byDay.get(d)! : null;
  })();
  const signups = total("product_db", "signups");
  // "active_posters" is the metric's earlier name; still read so older views keep working.
  const activeUsersMetric = has("product_db", "active_users") ? "active_users" : "active_posters";
  const activeUsers = level("product_db", activeUsersMetric);
  const otherDbMetrics = [...new Set(daily.filter((r) => r.source === "product_db" && !["signups", "active_users", "active_posters"].includes(r.metric)).map((r) => r.metric))]
    .sort()
    .map((metric) => ({ metric, ...total("product_db", metric) }));

  // --- What Startica did --------------------------------------------------------------------
  const startDate = new Date(`${current.start}T00:00:00`);
  const [pubs, pieces] = await Promise.all([
    db
      .select()
      .from(publications)
      .where(and(eq(publications.productId, productId), gte(publications.postedAt, startDate)))
      .orderBy(desc(publications.postedAt))
      .limit(300),
    db
      .select()
      .from(contentPieces)
      .where(and(eq(contentPieces.productId, productId), eq(contentPieces.status, "posted"), isNotNull(contentPieces.postedAt), gte(contentPieces.postedAt, startDate)))
      .orderBy(desc(contentPieces.postedAt))
      .limit(300),
  ]);
  const [replySnaps, pieceSnaps, attributed] = await Promise.all([
    pubs.length
      ? db.select().from(engagementSnapshots).where(inArray(engagementSnapshots.publicationId, pubs.map((p) => p.id))).orderBy(desc(engagementSnapshots.capturedAt))
      : [],
    pieces.length
      ? db.select().from(contentSnapshots).where(inArray(contentSnapshots.pieceId, pieces.map((p) => p.id))).orderBy(desc(contentSnapshots.capturedAt))
      : [],
    // Visits through a post's link count from the day it was posted, whatever the period.
    db
      .select({ metric: metricsSnapshots.metric, dimension: metricsSnapshots.dimension, value: sql<number>`sum(${metricsSnapshots.value})` })
      .from(metricsSnapshots)
      .where(and(eq(metricsSnapshots.productId, productId), eq(metricsSnapshots.source, webSrc), gte(metricsSnapshots.day, current.start), sql`${metricsSnapshots.dimension} like 'utm_content:%'`))
      .groupBy(metricsSnapshots.metric, metricsSnapshots.dimension),
  ]);
  const utm = (content: string | null, metric: string) =>
    content ? Number(attributed.find((r) => r.metric === metric && r.dimension === `utm_content:${content}`)?.value ?? 0) : 0;
  const where = (channel: string, community: string | null) => (channel === "reddit" && community ? `r/${community}` : (community ?? channelLabel(channel)));
  const posts: PostRow[] = [
    ...pubs.map((p) => {
      const snap = replySnaps.find((s) => s.publicationId === p.id);
      return {
        id: p.id,
        kind: "reply" as const,
        postedAt: p.postedAt,
        channel: p.channel,
        community: p.community,
        where: where(p.channel, p.community),
        url: p.url,
        text: p.body,
        mentionsProduct: p.mentionsProduct,
        replies: snap?.replies ?? null,
        removed: snap?.removed ?? false,
        visits: utm(p.draftId, "sessions"),
        keyEvents: utm(p.draftId, "key_events"),
      };
    }),
    ...pieces.map((p) => {
      const snap = pieceSnaps.find((s) => s.pieceId === p.id);
      const content = utmContentOf(p.utmUrl);
      const linkChannel = p.postedUrl ? channelFromUrl(p.postedUrl) : "other";
      const channel = linkChannel === "other" ? p.channel : linkChannel;
      const community = p.postedUrl ? redditCommunity(p.postedUrl) : null;
      return {
        id: p.id,
        kind: "content" as const,
        postedAt: p.postedAt!,
        channel,
        community,
        where: where(channel, community),
        url: p.postedUrl,
        text: p.title ? `${p.title}: ${p.body}` : p.body,
        mentionsProduct: content !== null,
        replies: snap?.replies ?? null,
        removed: snap?.removed ?? false,
        visits: utm(content, "sessions"),
        keyEvents: utm(content, "key_events"),
      };
    }),
  ].sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
  const places = new Map<string, PlaceRow>();
  for (const p of posts) {
    const row = places.get(p.where) ?? { where: p.where, channel: p.channel, posts: 0, linked: 0, replies: 0, visits: 0, keyEvents: 0, removed: 0 };
    row.posts += 1;
    row.linked += p.mentionsProduct ? 1 : 0;
    row.replies += p.replies ?? 0;
    row.visits += p.visits;
    row.keyEvents += p.keyEvents;
    row.removed += p.removed ? 1 : 0;
    places.set(p.where, row);
  }
  const placeRows = [...places.values()].sort((a, b) => b.visits - a.visits || b.keyEvents - a.keyEvents || b.posts - a.posts);
  const fromPosts = { visits: sumOf(posts.map((p) => p.visits)), keyEvents: sumOf(posts.map((p) => p.keyEvents)) };

  // Ads: spend entered for the period, and visits and key events through the ads' links.
  const campaigns = await db.select({ id: adCampaigns.id, name: adCampaigns.name, platform: adCampaigns.platform }).from(adCampaigns).where(eq(adCampaigns.productId, productId));
  const window = { from: current.start, to: current.end };
  const adsSummary = await (async () => {
    if (campaigns.length === 0) return null;
    const ids = campaigns.map((c) => c.id);
    const [spend, adRows] = await Promise.all([
      db.select().from(adSpend).where(inArray(adSpend.campaignId, ids)),
      db.select({ id: ads.id, campaignId: adGroups.campaignId }).from(ads).innerJoin(adGroups, eq(adGroups.id, ads.groupId)).where(inArray(adGroups.campaignId, ids)),
    ]);
    return campaigns
      .map((c) => {
        const spent = sumOf(spend.filter((s) => s.campaignId === c.id).map((s) => spendInWindow(s, window)?.amount ?? 0));
        const adIds = adRows.filter((a) => a.campaignId === c.id).map((a) => a.id);
        const visits = sumOf(adIds.map((id) => utm(id, "sessions")));
        const results = sumOf(adIds.map((id) => utm(id, "key_events")));
        return { id: c.id, name: c.name, platform: c.platform, spend: spent, visits, results };
      })
      .filter((c) => c.spend > 0 || c.visits > 0);
  })();

  const report = {
    productId,
    web,
    webLabel: web ? WEB_LABEL[web] : "GA4 or Umami",
    connected,
    definedDbMetrics: (() => {
      const m = conns.find((c) => c.kind === "product_db")?.config.metrics;
      return Array.isArray(m) ? (m as { name: string }[]).map((x) => x.name) : null;
    })(),
    history,
    oldest: coverage.find((c) => c.source === webSrc)?.oldest ?? null,
    current,
    previous,
    previousComplete,
    traffic: {
      has: has(webSrc, "sessions"),
      sessions,
      users,
      avgDailyUsers: { now: users.now / days, before: users.before == null ? null : users.before / days },
      newUsers: has(webSrc, "new_users") ? newUsers : null,
      pageviews: has(webSrc, "pageviews") ? pageviews : null,
      engagedRate: has(webSrc, "engaged_sessions") ? ratePair(engagedSessions, sessions) : null,
      secondsPerSession: has(webSrc, "engagement_seconds") ? ratePair(engagementSeconds, sessions) : null,
      pagesPerSession: has(webSrc, "pageviews") ? ratePair(pageviews, sessions) : null,
      sessionsSeries: series(webSrc, "sessions"),
      usersSeries: series(webSrc, "users"),
      pageviewsSeries: series(webSrc, "pageviews"),
      channels: channelRows,
      aiAssistants: [...aiAssistants].sort((a, b) => b[1] - a[1]).map(([name, sessions]) => ({ name, sessions })),
      pages: breakdown("page:", (k) => k, 25),
      landing: breakdown("landing:", (k) => k, 25, true),
      countries: breakdown("country:", countryName, 15),
      devices: breakdown("device:", (k) => DEVICE_LABEL[k] ?? k, 6),
      browsers: breakdown("browser:", (k) => k, 8),
    },
    conversions: {
      keyEvents,
      rate: ratePair(keyEvents, sessions),
      series: series(webSrc, "key_events"),
      events,
      signups: has("product_db", "signups") ? signups : null,
      signupsSeries: series("product_db", "signups"),
      signupRate: has("product_db", "signups") ? ratePair(signups, sessions) : null,
    },
    revenue: {
      has: has("stripe", "active_subscriptions") || has("stripe", "mrr"),
      mrr,
      activeSubs,
      trials: has("stripe", "trials") ? trials : null,
      paying: { now: payingNow, before: activeSubs.before == null ? null : activeSubs.before - (trials.before ?? 0) },
      newSubs,
      cancellations,
      mrrNew: has("stripe", "mrr_new") ? mrrNew : null,
      mrrChurned: has("stripe", "mrr_churned") ? mrrChurned : null,
      revenue: has("stripe", "revenue") ? revenue : null,
      churnRate: subsAtStart ? cancellations.now / subsAtStart : null,
      arpa: payingNow > 0 ? mrr.now / payingNow : null,
      mrrSeries: series("stripe", "mrr", "level"),
      subsSeries: series("stripe", "active_subscriptions", "level"),
      newSubsSeries: series("stripe", "new_subscriptions"),
      cancellationsSeries: series("stripe", "cancellations"),
    },
    product: { activeUsers, activeUsersSeries: series("product_db", activeUsersMetric, "level"), other: otherDbMetrics },
    startica: { posts, places: placeRows, fromPosts, ads: adsSummary },
    funnel: [] as { label: string; value: number; source: string }[],
    highlights: [] as Highlight[],
  };
  report.funnel = funnelSteps(report);
  report.highlights = highlights(report);
  return report;
}

export type AnalyticsReport = Awaited<ReturnType<typeof loadAnalyticsReport>>;

/** Visits → key events → signups → new subscriptions, for the steps that have a source. */
export function funnelSteps(r: Pick<AnalyticsReport, "traffic" | "conversions" | "revenue" | "webLabel">) {
  const steps: { label: string; value: number; source: string }[] = [];
  if (r.traffic.has) steps.push({ label: "Visits", value: r.traffic.sessions.now, source: r.webLabel });
  if (r.traffic.has && r.conversions.keyEvents.now > 0) steps.push({ label: "Key events", value: r.conversions.keyEvents.now, source: r.webLabel });
  if (r.conversions.signups) steps.push({ label: "Signups", value: r.conversions.signups.now, source: "Product database" });
  if (r.revenue.has) steps.push({ label: "New subscriptions", value: r.revenue.newSubs.now, source: "Stripe" });
  return steps.length > 1 ? steps : [];
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const change = (p: Pair) => (p.before ? (p.now - p.before) / p.before : null);
const pctText = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;

/**
 * What changed, as a few sentences: rules over the report, strongest first. Only changes big
 * enough to mean something (at least 15% and a real count), so a quiet week says little.
 */
export function highlights(r: Omit<AnalyticsReport, "highlights" | "funnel">): Highlight[] {
  const out: (Highlight & { weight: number })[] = [];
  const t = r.traffic;
  const period = r.current.days === 7 ? "this week" : `these ${r.current.days} days`;
  const s = change(t.sessions);
  if (t.has && s != null && Math.abs(s) >= 0.15 && Math.abs(t.sessions.now - t.sessions.before!) >= 20) {
    const mover = [...t.channels]
      .filter((c) => c.before != null)
      .map((c) => ({ c, diff: c.sessions - c.before! }))
      .sort((a, b) => (s > 0 ? b.diff - a.diff : a.diff - b.diff))[0];
    const why = mover && Math.sign(mover.diff) === Math.sign(s) && Math.abs(mover.diff) >= 10 ? `, most of it ${s > 0 ? "from" : "in"} ${mover.c.group} (${mover.diff > 0 ? "+" : ""}${fmt(mover.diff)})` : "";
    out.push({ tone: s > 0 ? "up" : "down", weight: Math.abs(s) * 3, text: `Visits ${s > 0 ? "up" : "down"} ${pctText(s).replace(/^[+-]/, "")} on the period before (${fmt(t.sessions.now)} vs ${fmt(t.sessions.before!)})${why}.`, href: "?tab=traffic" });
  }
  const conv = r.conversions.rate;
  if (conv.now != null && conv.before != null && conv.before > 0 && r.conversions.keyEvents.now >= 5) {
    const c = (conv.now - conv.before) / conv.before;
    if (Math.abs(c) >= 0.2) out.push({ tone: c > 0 ? "up" : "down", weight: Math.abs(c) * 2, text: `Key events per visit ${c > 0 ? "rose" : "fell"} from ${(conv.before * 100).toFixed(1)}% to ${(conv.now * 100).toFixed(1)}%.`, href: "?tab=conversions" });
  }
  // A source that's new this period.
  if (r.previousComplete) {
    const fresh = t.channels.flatMap((c) => c.sources).filter((x) => x.before === 0 && x.sessions >= 10 && !x.key.startsWith("(direct)")).sort((a, b) => b.sessions - a.sessions)[0];
    if (fresh) out.push({ tone: "up", weight: 1.2, text: `New source: ${fmt(fresh.sessions)} visits from ${fresh.label.split(" / ")[0]}, which sent none the period before.`, href: "?tab=traffic" });
  }
  const ai = t.channels.find((c) => c.group === "AI assistants");
  if (ai && ai.before != null && ai.sessions >= 10 && ai.sessions >= ai.before * 1.5) {
    out.push({ tone: "up", weight: 1, text: `AI assistants sent ${fmt(ai.sessions)} visits (${ai.before ? `${fmt(ai.before)} the period before` : "none the period before"})${t.aiAssistants[0] ? `, most from ${t.aiAssistants[0].name}` : ""}.`, href: "?tab=traffic" });
  }
  // Landing pages that get visits but lose most of them.
  const leaky = t.landing.filter((l) => l.sessions >= 50 && l.engaged != null && t.engagedRate?.now != null && l.engaged / l.sessions < Math.min(0.35, t.engagedRate.now * 0.7)).sort((a, b) => b.sessions - a.sessions)[0];
  if (leaky) out.push({ tone: "note", weight: 0.9, text: `${leaky.key}: ${fmt(leaky.sessions)} visits landed there, but only ${Math.round((leaky.engaged! / leaky.sessions) * 100)}% stayed engaged.`, href: "?tab=traffic" });
  // Startica's own posts.
  const best = [...r.startica.posts].sort((a, b) => b.keyEvents - a.keyEvents || b.visits - a.visits)[0];
  if (best && best.visits >= 5) {
    out.push({ tone: "up", weight: 1.1, text: `Your ${best.kind === "reply" ? "reply" : "post"} in ${best.where} brought ${fmt(best.visits)} visits${best.keyEvents ? ` and ${fmt(best.keyEvents)} key events` : ""} ${period}.`, href: "?tab=startica" });
  }
  const removed = r.startica.posts.filter((p) => p.removed).length;
  if (removed >= 2) out.push({ tone: "down", weight: 1, text: `${removed} of your posts ${period} were removed by moderators or deleted: check those communities' rules.`, href: "?tab=startica" });
  // Revenue.
  const m = r.revenue.mrr;
  if (r.revenue.has && m.before != null && m.before > 0) {
    const c = (m.now - m.before) / m.before;
    if (Math.abs(c) >= 0.05) out.push({ tone: c > 0 ? "up" : "down", weight: Math.abs(c) * 4, text: `MRR ${c > 0 ? "grew" : "dropped"} to ${money(m.now)} (${c > 0 ? "+" : "−"}${money(Math.abs(m.now - m.before))}, ${pctText(c)}).`, href: "?tab=revenue" });
  }
  const cx = r.revenue.cancellations;
  if (cx.before != null && cx.now >= 3 && cx.now >= cx.before * 2) out.push({ tone: "down", weight: 1.3, text: `${fmt(cx.now)} cancellations, up from ${fmt(cx.before)} the period before.`, href: "?tab=revenue" });
  const su = r.conversions.signups;
  if (su && su.before != null && su.before >= 5) {
    const c = (su.now - su.before) / su.before;
    if (Math.abs(c) >= 0.2) out.push({ tone: c > 0 ? "up" : "down", weight: Math.abs(c) * 2.5, text: `Signups ${c > 0 ? "up" : "down"} ${pctText(c).replace(/^[+-]/, "")} (${fmt(su.now)} vs ${fmt(su.before)}).`, href: "?tab=conversions" });
  }
  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map(({ weight: _, ...h }) => h);
}
