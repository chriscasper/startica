import { and, eq, sql } from "drizzle-orm";
import { getSetting, setSetting } from "@startica/db/bootstrap";
import { getDb, transaction } from "@startica/db/client";
import { connections, searchStats, type SearchSource } from "@startica/db/schema";
import { readSecret } from "@startica/db/secrets";
import { daysAgo, isoDay } from "../metrics/types.ts";
import { bingConfig, fetchBingRows } from "./bing.ts";
import { parseServiceAccount } from "./google.ts";
import { fetchPageQueries, fetchSearchRows, fetchSitemaps, HISTORY_DAYS, REFRESH_DAYS, searchConsoleConfig, type SearchRow, type Sitemap } from "./search-console.ts";

/** Syncing search data into `search_stats` (ARCHITECTURE.md section 10.2). Runs inside metrics_sync. */

type Conn = typeof connections.$inferSelect;

export const sitemapsSettingKey = (productId: string) => `search_sitemaps:${productId}`;
export type SavedSitemaps = { checkedAt: string; sitemaps: Sitemap[] };

export async function savedSitemaps(productId: string): Promise<SavedSitemaps | null> {
  return getSetting<SavedSitemaps>(sitemapsSettingKey(productId));
}

/** The key a Search Console connection uses: its own, or the product's GA4 key. */
export async function searchConsoleSecret(conn: Conn): Promise<string | null> {
  const config = searchConsoleConfig.parse(conn.config);
  if (!config.useGa4Key) return conn.secretId ? readSecret(conn.secretId) : null;
  const [ga4] = await getDb()
    .select({ secretId: connections.secretId })
    .from(connections)
    .where(and(eq(connections.productId, conn.productId), eq(connections.kind, "ga4")));
  if (!ga4?.secretId) throw new Error("This connection uses the GA4 key, but GA4 isn't connected for this product. Connect GA4 or paste a key here.");
  return readSecret(ga4.secretId);
}

export async function saveSearchRows(scope: { workspaceId: string; productId: string }, source: SearchSource, rows: SearchRow[]): Promise<void> {
  const values = rows.map((r) => ({ workspaceId: scope.workspaceId, productId: scope.productId, source, ...r, position: Math.round(r.position * 100) / 100 }));
  await transaction(async (db) => {
    for (let i = 0; i < values.length; i += 200) {
      await db
        .insert(searchStats)
        .values(values.slice(i, i + 200))
        .onConflictDoUpdate({
          target: [searchStats.productId, searchStats.source, searchStats.day, searchStats.kind, searchStats.key],
          set: { clicks: sql`excluded.clicks`, impressions: sql`excluded.impressions`, position: sql`excluded.position`, updatedAt: new Date() },
        });
    }
  });
}

/** The first day to read: everything Google keeps on the first sync, then the last few days. */
async function syncStart(productId: string, source: SearchSource, historyDays: number, now: Date): Promise<string> {
  const [row] = await getDb()
    .select({ last: sql<string | null>`max(${searchStats.day})` })
    .from(searchStats)
    .where(and(eq(searchStats.productId, productId), eq(searchStats.source, source), eq(searchStats.kind, "total")));
  if (!row?.last) return isoDay(daysAgo(historyDays, now));
  const refresh = isoDay(daysAgo(REFRESH_DAYS, now));
  return row.last < refresh ? row.last : refresh;
}

export async function syncSearchConsole(conn: Conn, signal?: AbortSignal, now = new Date()): Promise<number> {
  const config = searchConsoleConfig.parse(conn.config);
  const secret = await searchConsoleSecret(conn);
  if (!secret) throw new Error("No service account key saved for Search Console");
  const key = parseServiceAccount(secret, config.useGa4Key ? "GA4" : "Search Console");
  const start = await syncStart(conn.productId, "google", HISTORY_DAYS, now);
  const rows = await fetchSearchRows(key, config.siteUrl, start, isoDay(now), signal);
  await saveSearchRows(conn, "google", rows);
  const sitemaps = await fetchSitemaps(key, config.siteUrl, signal);
  await setSetting(sitemapsSettingKey(conn.productId), { checkedAt: now.toISOString(), sitemaps } satisfies SavedSitemaps);
  return rows.length;
}

export async function syncBing(conn: Conn, signal?: AbortSignal, now = new Date()): Promise<number> {
  const config = bingConfig.parse(conn.config);
  const apiKey = conn.secretId ? await readSecret(conn.secretId) : null;
  if (!apiKey) throw new Error("No Bing API key saved");
  // Bing returns everything it has each time; keep only what's new or recent (its weekly rows change for a while).
  const start = await syncStart(conn.productId, "bing", HISTORY_DAYS, now);
  const since = isoDay(daysAgo(14, new Date(`${start}T00:00:00Z`)));
  const rows = await fetchBingRows(apiKey, config.siteUrl, since, signal);
  await saveSearchRows(conn, "bing", rows);
  return rows.length;
}

/** A page's top Google queries over the last 28 days, read live; empty without Search Console or on any error. */
export async function topQueriesForPage(productId: string, page: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const [conn] = await getDb()
      .select()
      .from(connections)
      .where(and(eq(connections.productId, productId), eq(connections.kind, "search_console")));
    if (!conn) return [];
    const secret = await searchConsoleSecret(conn);
    if (!secret) return [];
    const config = searchConsoleConfig.parse(conn.config);
    const now = new Date();
    const rows = await fetchPageQueries(parseServiceAccount(secret), config.siteUrl, page, isoDay(daysAgo(28, now)), isoDay(now), signal);
    return rows.sort((a, b) => b.impressions - a.impressions).map((r) => `${r.query} (${r.impressions} impressions, position ${r.position.toFixed(1)})`);
  } catch {
    return [];
  }
}
