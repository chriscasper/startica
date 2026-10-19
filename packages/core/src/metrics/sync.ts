import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import { connections, metricsSnapshots } from "@startica/db/schema";
import { readSecret } from "@startica/db/secrets";
import type { AiContext } from "../ai/client.ts";
import { fetchGa4Metrics, ga4Config } from "./ga4.ts";
import { fetchProductDbMetrics, productDbConfig } from "./product-db.ts";
import { fetchStripeMetrics, stripeConfig } from "./stripe.ts";
import { fetchUmamiMetrics, umamiConfig } from "./umami.ts";
import { syncBing, syncSearchConsole } from "../search/sync.ts";
import { historyDays, localDayBefore, pruneMetrics, syncWindow } from "./history.ts";
import type { MetricRow } from "./types.ts";

type Kind = "ga4" | "umami" | "stripe" | "product_db";

type Window = { from: string; days: number; signal?: AbortSignal };

const connectors: Record<Kind, (config: unknown, secret: string, window: Window) => Promise<MetricRow[]>> = {
  ga4: (config, secret, w) => fetchGa4Metrics(ga4Config.parse(config), secret, { from: w.from, signal: w.signal }),
  umami: (config, secret, w) => fetchUmamiMetrics(umamiConfig.parse(config), secret, { days: w.days, signal: w.signal }),
  stripe: (config, secret, w) => fetchStripeMetrics(stripeConfig.parse(config), secret, { days: w.days }),
  product_db: (config, secret, w) => fetchProductDbMetrics(productDbConfig.parse(config), secret, { days: w.days }),
};
// Web analytics reads its history once, then the last few days (history.ts); the others re-read it all.
const incremental = new Set<Kind>(["ga4", "umami"]);
const isMetricKind = (kind: string): kind is Kind => kind in connectors;

export const metricsSyncPayload = z.object({
  workspaceId: z.guid(),
  productId: z.guid().optional(),
  connectionId: z.guid().optional(),
});

async function saveMetrics(conn: { workspaceId: string; productId: string; kind: Kind }, rows: MetricRow[]) {
  if (rows.length === 0) return;
  const values = rows.map((r) => ({
    workspaceId: conn.workspaceId,
    productId: conn.productId,
    day: r.day,
    source: conn.kind,
    metric: r.metric,
    dimension: r.dimension ?? "",
    value: r.value,
  }));
  await transaction(async (db) => {
    for (let i = 0; i < values.length; i += 200) {
      await db
        .insert(metricsSnapshots)
        .values(values.slice(i, i + 200))
        .onConflictDoUpdate({
          target: [metricsSnapshots.productId, metricsSnapshots.day, metricsSnapshots.source, metricsSnapshots.metric, metricsSnapshots.dimension],
          set: { value: sql`excluded.value`, updatedAt: new Date() },
        });
    }
  });
}

/** The secret a connection syncs with: its own (GA4: a service-account key). */
async function connectionSecret(conn: typeof connections.$inferSelect): Promise<string | null> {
  return conn.secretId ? readSecret(conn.secretId) : null;
}

/** Pulls metrics for every connection in scope and records each connection's status. */
export async function runMetricsSync(ctx: AiContext, payload: z.infer<typeof metricsSyncPayload>) {
  const db = getDb();
  const conns = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.workspaceId, payload.workspaceId),
        payload.productId ? eq(connections.productId, payload.productId) : undefined,
        payload.connectionId ? eq(connections.id, payload.connectionId) : undefined,
      ),
    );

  const results: Record<string, { rows?: number; error?: string }> = {};
  const history = new Map<string, number>();
  for (const conn of conns) {
    if (!history.has(conn.productId)) history.set(conn.productId, await historyDays(conn.productId));
    ctx.signal?.throwIfAborted();
    try {
      let count: number;
      if (conn.kind === "search_console") count = await syncSearchConsole(conn, ctx.signal);
      else if (conn.kind === "bing_webmaster") count = await syncBing(conn, ctx.signal);
      else if (isMetricKind(conn.kind)) {
        const secret = await connectionSecret(conn);
        if (!secret) throw new Error("No credentials saved for this connection");
        const days = history.get(conn.productId)!;
        const syncedFrom = typeof conn.config.syncedFrom === "string" ? conn.config.syncedFrom : null;
        const window = incremental.has(conn.kind) ? syncWindow(syncedFrom, days) : { from: localDayBefore(new Date(), days - 1), days, full: true };
        const rows = await connectors[conn.kind](conn.config, secret, { ...window, signal: ctx.signal });
        await saveMetrics({ ...conn, kind: conn.kind }, rows);
        // Remember the history is read, so later syncs only re-read the last few days.
        if (window.full && incremental.has(conn.kind)) {
          await db.update(connections).set({ config: { ...conn.config, syncedFrom: window.from } }).where(eq(connections.id, conn.id));
        }
        count = rows.length;
      } else continue;
      await db.update(connections).set({ status: "ok", lastError: null, lastSyncedAt: new Date() }).where(eq(connections.id, conn.id));
      results[conn.kind] = { rows: count };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(connections).set({ status: "error", lastError: message }).where(eq(connections.id, conn.id));
      results[conn.kind] = { error: message };
      if (ctx.signal?.aborted) throw error;
    }
  }
  for (const [productId, days] of history) await pruneMetrics(productId, days);
  return results;
}
