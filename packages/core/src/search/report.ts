import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { searchStats, type SearchKind, type SearchSource } from "@startica/db/schema";
import { daysAgo, isoDay } from "../metrics/types.ts";

/** Reading search data for the Search screen (ARCHITECTURE.md section 10.2). */

export type Totals = { clicks: number; impressions: number; ctr: number; position: number };
export type Period = { start: string; end: string };

/** The last `days` days with data, ending at the newest day stored, and the same length before it. */
export async function periods(
  productId: string,
  source: SearchSource,
  days: number,
): Promise<{ current: Period; previous: Period; newest: string | null; oldest: string | null; previousComplete: boolean }> {
  const [row] = await getDb()
    .select({ newest: sql<string | null>`max(${searchStats.day})`, oldest: sql<string | null>`min(${searchStats.day})` })
    .from(searchStats)
    .where(and(eq(searchStats.productId, productId), eq(searchStats.source, source), eq(searchStats.kind, "total")));
  const end = row?.newest ? new Date(`${row.newest}T00:00:00Z`) : new Date();
  const current = { start: isoDay(daysAgo(days - 1, end)), end: isoDay(end) };
  const previous = { start: isoDay(daysAgo(2 * days - 1, end)), end: isoDay(daysAgo(days, end)) };
  // Only compare against a period the data fully covers (Search Console keeps 16 months).
  const previousComplete = Boolean(row?.oldest && row.oldest <= previous.start);
  return { current, previous, newest: row?.newest ?? null, oldest: row?.oldest ?? null, previousComplete };
}

const sums = {
  clicks: sql<number>`coalesce(sum(${searchStats.clicks}), 0)`,
  impressions: sql<number>`coalesce(sum(${searchStats.impressions}), 0)`,
  // Average position weighted by impressions, as Search Console reports it over a range.
  // Rows with no position (0: Bing sometimes has none) are left out of the average.
  weighted: sql<number>`coalesce(sum(${searchStats.position} * ${searchStats.impressions}), 0)`,
  positioned: sql<number>`coalesce(sum(case when ${searchStats.position} > 0 then ${searchStats.impressions} else 0 end), 0)`,
};

function totals(r: { clicks: number; impressions: number; weighted: number; positioned: number }): Totals {
  const clicks = Number(r.clicks);
  const impressions = Number(r.impressions);
  const positioned = Number(r.positioned);
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: positioned ? Number(r.weighted) / positioned : 0 };
}

const inRange = (productId: string, source: SearchSource, kind: SearchKind, p: Period) =>
  and(eq(searchStats.productId, productId), eq(searchStats.source, source), eq(searchStats.kind, kind), gte(searchStats.day, p.start), lte(searchStats.day, p.end));

/** The site's totals for the period, or (with `kind`) the sum over every row of that kind. */
export async function siteTotals(productId: string, source: SearchSource, p: Period, kind: SearchKind = "total"): Promise<Totals> {
  const [row] = await getDb().select(sums).from(searchStats).where(inRange(productId, source, kind, p));
  return totals(row ?? { clicks: 0, impressions: 0, weighted: 0, positioned: 0 });
}

export async function dailyTotals(productId: string, source: SearchSource, p: Period): Promise<({ day: string } & Totals)[]> {
  const rows = await getDb()
    .select({ day: searchStats.day, ...sums })
    .from(searchStats)
    .where(inRange(productId, source, "total", p))
    .groupBy(searchStats.day)
    .orderBy(asc(searchStats.day));
  return rows.map((r) => ({ day: r.day, ...totals(r) }));
}

export type Flag = "striking" | "low_ctr";
export type KeyRow = { key: string; current: Totals; previousClicks: number; flags: Flag[]; brand?: boolean };

/**
 * Rough click-through rates by position for a plain result, used only to spot titles
 * and descriptions worth rewriting. Real rates vary a lot by query and result type.
 */
export function expectedCtr(position: number): number {
  if (position < 1.5) return 0.25;
  if (position < 2.5) return 0.14;
  if (position < 3.5) return 0.09;
  if (position < 5.5) return 0.06;
  if (position < 10.5) return 0.03;
  return 0.01;
}

/** "Striking distance": on page 1 or 2 but not near the top, with enough impressions to matter. */
export function flagsFor(t: Totals, minImpressions: number): Flag[] {
  const flags: Flag[] = [];
  if (t.position >= 4.5 && t.position <= 20 && t.impressions >= minImpressions) flags.push("striking");
  if (t.position > 0 && t.position <= 10 && t.impressions >= minImpressions * 2 && t.ctr < expectedCtr(t.position) / 2) flags.push("low_ctr");
  return flags;
}

/**
 * Brand queries mention the product's name or one of its brand terms as whole words,
 * written either way: "field note" and "fieldnote" both match the name "Fieldnote" or
 * "Field Note", but "field notes app" doesn't.
 */
export function brandMatcher(terms: string[]): (query: string) => boolean {
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const needles = terms.map((t) => words(t).join("")).filter((t) => t.length >= 3);
  return (query) => {
    const w = words(query);
    // Every run of consecutive words, joined: "field note app" → fieldnote, notapp, …
    for (let i = 0; i < w.length; i++) {
      let joined = "";
      for (let j = i; j < w.length && joined.length < 40; j++) {
        joined += w[j];
        if (needles.includes(joined)) return true;
      }
    }
    return false;
  };
}

/** The top queries, pages, countries or devices by clicks (then impressions) in the period. */
export async function topKeys(
  productId: string,
  source: SearchSource,
  kind: Exclude<SearchKind, "total">,
  current: Period,
  previous: Period,
  opts: { limit?: number; isBrand?: (key: string) => boolean } = {},
): Promise<KeyRow[]> {
  const db = getDb();
  const rows = await db
    .select({ key: searchStats.key, ...sums })
    .from(searchStats)
    .where(inRange(productId, source, kind, current))
    .groupBy(searchStats.key)
    .orderBy(sql`sum(${searchStats.clicks}) desc`, sql`sum(${searchStats.impressions}) desc`)
    .limit(opts.limit ?? 500);
  const before = rows.length
    ? await db
        .select({ key: searchStats.key, clicks: sums.clicks })
        .from(searchStats)
        .where(inRange(productId, source, kind, previous))
        .groupBy(searchStats.key)
    : [];
  const prev = new Map(before.map((r) => [r.key, Number(r.clicks)]));
  const days = Math.round((Date.parse(current.end) - Date.parse(current.start)) / 86400_000) + 1;
  // About 3 impressions a day: enough that a better position would bring visits.
  const minImpressions = Math.max(20, days * 3);
  return rows.map((r) => {
    const t = totals(r);
    return {
      key: r.key,
      current: t,
      previousClicks: prev.get(r.key) ?? 0,
      flags: kind === "query" || kind === "page" ? flagsFor(t, minImpressions) : [],
      ...(opts.isBrand ? { brand: opts.isBrand(r.key) } : {}),
    };
  });
}

export async function hasSearchData(productId: string, source: SearchSource = "google"): Promise<boolean> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(searchStats)
    .where(and(eq(searchStats.productId, productId), eq(searchStats.source, source)))
    .limit(1);
  return Number(row?.n ?? 0) > 0;
}
