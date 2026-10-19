import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { z } from "zod";
import { SYNC_DAYS, TOP_PER_DAY, type MetricRow } from "./types.ts";

export const ga4Config = z.object({ propertyId: z.string().regex(/^\d+$/, "GA4 property IDs are numbers") });

const serviceAccount = z.object({ client_email: z.string(), private_key: z.string() });

type Row = { dimensionValues?: { value?: string | null }[] | null; metricValues?: { value?: string | null }[] | null };

/** GA4 returns dates as YYYYMMDD. */
export function ga4Day(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

const UNSET = new Set(["", "(not set)", "(none)", "(direct)"]);

/**
 * Maps GA4 report rows to metric rows. `dims` names the dimensions after `date`;
 * `metrics` names the metric columns. Rows whose split dimension is unset are
 * kept only for unsplit reports.
 */
export function mapRows(
  rows: Row[] | null | undefined,
  opts: { metrics: string[]; dimension?: (values: string[]) => string | null },
): MetricRow[] {
  const out: MetricRow[] = [];
  for (const row of rows ?? []) {
    const values = (row.dimensionValues ?? []).map((d) => d.value ?? "");
    const day = ga4Day(values[0] ?? "");
    const dimension = opts.dimension ? opts.dimension(values.slice(1)) : "";
    if (dimension === null) continue;
    opts.metrics.forEach((metric, i) => {
      const value = Number(row.metricValues?.[i]?.value ?? 0);
      if (Number.isFinite(value)) out.push({ day, metric, dimension, value });
    });
  }
  return out;
}

/** Builds a Data API client from the connection's service-account key. */
async function dataClient(secret: string): Promise<BetaAnalyticsDataClient> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secret);
  } catch {
    throw new Error("The GA4 key isn't valid JSON: paste the whole .json file");
  }
  const key = serviceAccount.safeParse(parsed);
  if (key.success) return new BetaAnalyticsDataClient({ credentials: key.data });
  throw new Error("The GA4 key isn't a service account key: reconnect GA4 in Settings → Products → Connections");
}

/** "page:/pricing" for a GA4 page path (query string and fragment dropped, like site scans do). */
export function pageDimension(path: string): string | null {
  const clean = path.split(/[?#]/)[0]!.trim();
  if (!clean.startsWith("/") || clean.length > 500) return null;
  return `page:${clean}`;
}

/** Keeps the `n` largest values of each metric and dimension prefix per day (pages, countries…), so long histories stay small. */
export function topPerDay(rows: MetricRow[], n: number): MetricRow[] {
  const groups = new Map<string, MetricRow[]>();
  for (const r of rows) {
    const k = `${r.day}|${r.metric}|${(r.dimension ?? "").split(":")[0]}`;
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.values()].flatMap((list) => list.sort((a, b) => b.value - a.value).slice(0, n));
}

/** GA4's device categories as Startica stores them (Umami's laptops count as desktop). */
export function deviceDimension(device: string): string | null {
  const d = device.trim().toLowerCase();
  if (!d || UNSET.has(d)) return null;
  return `device:${d === "laptop" ? "desktop" : d}`;
}

/** "country:US" for an ISO 3166 code; names are shown in the app's language. */
export function countryDimension(code: string): string | null {
  const c = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? `country:${c}` : null;
}

/**
 * Daily rows from `from` (YYYY-MM-DD) to today. The metric names and dimensions are the
 * ones every web analytics source writes (types.ts, WEB_METRICS).
 */
export async function fetchGa4Metrics(config: z.infer<typeof ga4Config>, secret: string, opts: { from?: string; signal?: AbortSignal } = {}): Promise<MetricRow[]> {
  const client = await dataClient(secret);
  const property = `properties/${config.propertyId}`;
  const dateRanges = [{ startDate: opts.from ?? `${SYNC_DAYS}daysAgo`, endDate: "today" }];
  const PAGE = 100_000;
  const report = async (dimensions: string[], metrics: string[]) => {
    const rows: Row[] = [];
    // 16 months of pages by day can pass one page of results: read on until GA4 has no more (capped).
    for (let offset = 0; offset < 10 * PAGE; offset += PAGE) {
      opts.signal?.throwIfAborted();
      const [res] = await client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "date" }, ...dimensions.map((name) => ({ name }))],
        metrics: metrics.map((name) => ({ name })),
        limit: PAGE,
        offset,
      });
      rows.push(...(res.rows ?? []));
      if (offset + PAGE >= Number(res.rowCount ?? 0)) break;
    }
    return rows;
  };

  try {
    const [totals, bySource, byContent, byEvent, byPage, byLanding, byCountry, byDevice, byBrowser] = await Promise.all([
      report([], ["sessions", "totalUsers", "newUsers", "screenPageViews", "engagedSessions", "userEngagementDuration", "keyEvents"]),
      report(["sessionSource", "sessionMedium"], ["sessions", "keyEvents", "engagedSessions"]),
      // utm_content carries Startica's draft id, so this is per-reply attribution.
      report(["sessionManualAdContent"], ["sessions", "keyEvents"]),
      report(["eventName"], ["keyEvents"]),
      // Sessions that viewed each page: how much traffic an accessibility issue affects (ARCHITECTURE.md section 9.3).
      report(["pagePath"], ["sessions"]),
      report(["landingPage"], ["sessions", "keyEvents", "engagedSessions"]),
      report(["countryId"], ["sessions"]),
      report(["deviceCategory"], ["sessions"]),
      report(["browser"], ["sessions"]),
    ]);
    const source = ([source = "", medium = ""]: string[]) => `source:${UNSET.has(source) ? "(direct)" : source} / ${medium || "(none)"}`;
    return [
      ...mapRows(totals, { metrics: ["sessions", "users", "new_users", "pageviews", "engaged_sessions", "engagement_seconds", "key_events"] }),
      ...mapRows(bySource, { metrics: ["sessions", "key_events", "engaged_sessions"], dimension: source }).filter((r) => r.metric === "sessions" || r.value > 0),
      ...mapRows(byContent, {
        metrics: ["sessions", "key_events"],
        dimension: ([content = ""]) => (UNSET.has(content) ? null : `utm_content:${content}`),
      }),
      ...mapRows(byEvent, { metrics: ["key_events"], dimension: ([event = ""]) => (event ? `event:${event}` : null) }).filter(
        (r) => r.value > 0,
      ),
      ...topPerDay(
        [
          ...mapRows(byPage, { metrics: ["sessions"], dimension: ([path = ""]) => pageDimension(path) }),
          ...mapRows(byLanding, {
            metrics: ["sessions", "key_events", "engaged_sessions"],
            dimension: ([path = ""]) => pageDimension(path)?.replace(/^page:/, "landing:") ?? null,
          }),
          ...mapRows(byCountry, { metrics: ["sessions"], dimension: ([code = ""]) => countryDimension(code) }),
          ...mapRows(byDevice, { metrics: ["sessions"], dimension: ([device = ""]) => deviceDimension(device) }),
          ...mapRows(byBrowser, { metrics: ["sessions"], dimension: ([browser = ""]) => (UNSET.has(browser) ? null : `browser:${browser}`) }),
        ].filter((r) => r.value > 0),
        TOP_PER_DAY,
      ),
    ];
  } finally {
    await client.close();
  }
}
