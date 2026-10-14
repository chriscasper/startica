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
import type { MetricRow } from "./types.ts";

type Kind = "ga4" | "umami" | "stripe" | "product_db";

const connectors: Record<Kind, (config: unknown, secret: string) => Promise<MetricRow[]>> = {
  ga4: (config, secret) => fetchGa4Metrics(ga4Config.parse(config), secret),
  umami: (config, secret) => fetchUmamiMetrics(umamiConfig.parse(config), secret),
  stripe: (config, secret) => fetchStripeMetrics(stripeConfig.parse(config), secret),
  product_db: (config, secret) => fetchProductDbMetrics(productDbConfig.parse(config), secret),
};
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
  for (const conn of conns) {
    try {
      let count: number;
      if (conn.kind === "search_console") count = await syncSearchConsole(conn, ctx.signal);
      else if (conn.kind === "bing_webmaster") count = await syncBing(conn, ctx.signal);
      else if (isMetricKind(conn.kind)) {
        const secret = await connectionSecret(conn);
        if (!secret) throw new Error("No credentials saved for this connection");
        const rows = await connectors[conn.kind](conn.config, secret);
        await saveMetrics({ ...conn, kind: conn.kind }, rows);
        count = rows.length;
      } else continue;
      await db.update(connections).set({ status: "ok", lastError: null, lastSyncedAt: new Date() }).where(eq(connections.id, conn.id));
      results[conn.kind] = { rows: count };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(connections).set({ status: "error", lastError: message }).where(eq(connections.id, conn.id));
      results[conn.kind] = { error: message };
    }
  }
  return results;
}
