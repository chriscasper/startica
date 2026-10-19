export type MetricSource = "ga4" | "umami" | "stripe" | "product_db" | "manual";

/** One value for one day. `dimension` splits a metric, e.g. "source:reddit / community". */
export type MetricRow = {
  day: string; // YYYY-MM-DD
  metric: string;
  dimension?: string;
  value: number;
};

/** Days read when a caller doesn't say (tests); syncs read the product's history (history.ts). */
export const SYNC_DAYS = 30;

/** Long splits (pages, landing pages, countries, browsers) keep this many values per day. */
export const TOP_PER_DAY = 50;

/**
 * What GA4 and Umami both write, per local day (ARCHITECTURE.md section 8.2). Totals have no
 * dimension; splits are "prefix:value". Counts only, never averages or rates, so any range adds up.
 * `users` are per day, so a range's sum overcounts people who came back: screens show a daily average.
 */
export const WEB_METRICS = {
  totals: ["sessions", "users", "new_users", "pageviews", "engaged_sessions", "engagement_seconds", "key_events"],
  sessions: ["source:", "page:", "landing:", "country:", "device:", "browser:", "utm_content:"],
  key_events: ["event:", "utm_content:", "source:", "landing:"],
} as const;

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysAgo(n: number, from = new Date()): Date {
  return new Date(from.getTime() - n * 86400_000);
}
