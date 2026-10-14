import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { z } from "zod";
import { SYNC_DAYS, type MetricRow } from "./types.ts";

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

export async function fetchGa4Metrics(config: z.infer<typeof ga4Config>, secret: string): Promise<MetricRow[]> {
  const client = await dataClient(secret);
  const property = `properties/${config.propertyId}`;
  const dateRanges = [{ startDate: `${SYNC_DAYS}daysAgo`, endDate: "today" }];
  const report = async (dimensions: string[], metrics: string[]) => {
    const [res] = await client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "date" }, ...dimensions.map((name) => ({ name }))],
      metrics: metrics.map((name) => ({ name })),
      limit: 10_000,
    });
    return res.rows;
  };

  try {
    const [totals, bySource, byContent, byEvent, byPage] = await Promise.all([
      report([], ["sessions", "totalUsers", "keyEvents"]),
      report(["sessionSource", "sessionMedium"], ["sessions"]),
      // utm_content carries Startica's draft id, so this is per-reply attribution.
      report(["sessionManualAdContent"], ["sessions", "keyEvents"]),
      report(["eventName"], ["keyEvents"]),
      // Sessions that viewed each page: how much traffic an accessibility issue affects (ARCHITECTURE.md section 9.3).
      report(["pagePath"], ["sessions"]),
    ]);
    return [
      ...mapRows(totals, { metrics: ["sessions", "users", "key_events"] }),
      ...mapRows(bySource, {
        metrics: ["sessions"],
        dimension: ([source = "", medium = ""]) => `source:${UNSET.has(source) ? "(direct)" : source} / ${medium || "(none)"}`,
      }),
      ...mapRows(byContent, {
        metrics: ["sessions", "key_events"],
        dimension: ([content = ""]) => (UNSET.has(content) ? null : `utm_content:${content}`),
      }),
      ...mapRows(byEvent, { metrics: ["key_events"], dimension: ([event = ""]) => (event ? `event:${event}` : null) }).filter(
        (r) => r.value > 0,
      ),
      ...mapRows(byPage, { metrics: ["sessions"], dimension: ([path = ""]) => pageDimension(path) }).filter((r) => r.value > 0),
    ];
  } finally {
    await client.close();
  }
}
