import { and, eq, lt, ne } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { getSetting, setSetting } from "@startica/db/bootstrap";
import { metricsSnapshots } from "@startica/db/schema";

/**
 * How much metric history a product keeps (ARCHITECTURE.md section 8.2): 90 days unless the
 * owner asks for more, up to 16 months (about what GA4 and Search Console keep for reports).
 * The first sync of a web analytics connection reads the whole history; later syncs re-read
 * the last few days, which GA4 and Umami may still correct. Stripe and the product database
 * are cheap to read, so they re-read the whole history every time.
 */
export const HISTORY_CHOICES = [
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "12 months" },
  { days: 486, label: "16 months" },
] as const;
export const DEFAULT_HISTORY_DAYS = 90;
export const MAX_HISTORY_DAYS = 486;
/** Days a web analytics sync re-reads after the first one. */
export const REFRESH_DAYS = 5;

const key = (productId: string) => `analytics_history_days:${productId}`;

export async function historyDays(productId: string): Promise<number> {
  const saved = await getSetting<number>(key(productId));
  return HISTORY_CHOICES.some((c) => c.days === saved) ? saved! : DEFAULT_HISTORY_DAYS;
}

export async function setHistoryDays(productId: string, days: number): Promise<void> {
  if (!HISTORY_CHOICES.some((c) => c.days === days)) throw new Error("Pick one of the history lengths offered");
  await setSetting(key(productId), days);
}

/** YYYY-MM-DD of the local day `n` days before `now`. */
export function localDayBefore(now: Date, n: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The days a web analytics sync reads: the whole history when the connection hasn't read it yet
 * (`syncedFrom`, kept in its config, is later than the history's first day: a new connection, a
 * replaced one, or a longer history), otherwise the last REFRESH_DAYS days.
 */
export function syncWindow(syncedFrom: string | null, history: number, now = new Date()): { from: string; days: number; full: boolean } {
  const from = localDayBefore(now, history - 1);
  if (!syncedFrom || syncedFrom > from) return { from, days: history, full: true };
  return { from: localDayBefore(now, REFRESH_DAYS - 1), days: REFRESH_DAYS, full: false };
}

/** Drops a product's synced rows older than its history (numbers entered by hand are kept). */
export async function pruneMetrics(productId: string, history: number, now = new Date()): Promise<void> {
  await getDb()
    .delete(metricsSnapshots)
    .where(and(eq(metricsSnapshots.productId, productId), ne(metricsSnapshots.source, "manual"), lt(metricsSnapshots.day, localDayBefore(now, history - 1))));
}
