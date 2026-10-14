import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { connections } from "@startica/db/schema";

/**
 * A product's web analytics: Google Analytics 4 or Umami (ARCHITECTURE.md section 8.2). Both store
 * the same metrics in `metrics_snapshots` (sessions, users, key_events; by `source:`,
 * `utm_content:`, `event:` and `page:`), under their own source, so every screen reads one
 * of them through this. GA4 wins when both are connected and working.
 */
export const webSources = ["ga4", "umami"] as const;
export type WebSource = (typeof webSources)[number];

export const WEB_LABEL: Record<WebSource, string> = { ga4: "Google Analytics", umami: "Umami" };

export async function webSource(productId: string): Promise<WebSource | null> {
  const rows = await getDb()
    .select({ kind: connections.kind, status: connections.status })
    .from(connections)
    .where(and(eq(connections.productId, productId), inArray(connections.kind, [...webSources])));
  const order = (r: { kind: string; status: string }) => (r.status === "ok" ? 0 : 1) * 10 + (r.kind === "ga4" ? 0 : 1);
  const best = rows.sort((a, b) => order(a) - order(b))[0];
  return (best?.kind as WebSource | undefined) ?? null;
}
