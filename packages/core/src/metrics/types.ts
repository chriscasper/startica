export type MetricSource = "ga4" | "umami" | "stripe" | "product_db" | "manual";

/** One value for one day. `dimension` splits a metric, e.g. "source:reddit / community". */
export type MetricRow = {
  day: string; // YYYY-MM-DD
  metric: string;
  dimension?: string;
  value: number;
};

export const SYNC_DAYS = 30;

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysAgo(n: number, from = new Date()): Date {
  return new Date(from.getTime() - n * 86400_000);
}
