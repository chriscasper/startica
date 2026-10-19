import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { connections, metricsSnapshots, products } from "@startica/db/schema";
import { fileKeyCipher, putSecret, setCipher } from "@startica/db/secrets";
import { runMetricsSync } from "./sync.ts";
// @ts-expect-error plain JS helper shared with the smoke test
import { startUmamiStandin, UMAMI_STANDIN_KEY, UMAMI_STANDIN_SITE } from "./umami-standin.mjs";
import { checkUmami, fetchUmamiMetrics, normalizeUmamiUrl, setUmamiGap, sourceDimension, UMAMI_CLOUD } from "./umami.ts";
import { webSource } from "./web.ts";

const SITE = UMAMI_STANDIN_SITE;
const KEY = UMAMI_STANDIN_KEY;
let base = "";
let seen: string[] = [];
let close: () => Promise<unknown> = async () => {};

beforeAll(async () => {
  const standin = await startUmamiStandin(0);
  base = standin.url;
  seen = standin.seen;
  close = standin.close;
  setUmamiGap(0);
});
afterAll(async () => {
  setUmamiGap(null);
  await close();
});

describe("Umami", () => {
  it("reads what people type as a server address", () => {
    expect(normalizeUmamiUrl("cloud")).toBe(UMAMI_CLOUD);
    expect(normalizeUmamiUrl("https://cloud.umami.is/websites/x")).toBe(UMAMI_CLOUD);
    expect(normalizeUmamiUrl("umami.fieldnote.example")).toBe("https://umami.fieldnote.example/api");
    expect(normalizeUmamiUrl("https://stats.fieldnote.example/umami/api/")).toBe("https://stats.fieldnote.example/umami/api");
  });

  it("turns referrers into GA4-style sources, with search engines as organic", () => {
    expect(sourceDimension("")).toBe("source:(direct) / (none)");
    expect(sourceDimension("www.google.co.uk")).toBe("source:google / organic");
    expect(sourceDimension("duckduckgo.com")).toBe("source:duckduckgo / organic");
    expect(sourceDimension("chatgpt.com")).toBe("source:chatgpt.com / referral");
    expect(sourceDimension("search.yahoo.com")).toBe("source:yahoo / organic");
    expect(sourceDimension("search.brave.com")).toBe("source:brave / organic");
  });

  it("checks the key and the website, with errors that say what to do", async () => {
    expect(await checkUmami({ baseUrl: base, websiteId: SITE, keyEvents: [] }, KEY)).toBe("Fieldnote");
    await expect(checkUmami({ baseUrl: base, websiteId: SITE, keyEvents: [] }, "umami_wrong")).rejects.toThrow(/refused the credentials/);
    await expect(checkUmami({ baseUrl: base, websiteId: "00000000-0000-0000-0000-000000000000", keyEvents: [] }, KEY)).rejects.toThrow(/no website with that ID/);
    // Older self-hosted installs: username and password.
    expect(await checkUmami({ baseUrl: base, websiteId: SITE, keyEvents: [] }, "admin:secret")).toBe("Fieldnote");
    await expect(checkUmami({ baseUrl: base, websiteId: SITE, keyEvents: [] }, "admin:wrong")).rejects.toThrow(/refused the credentials/);
    await expect(checkUmami({ baseUrl: base, websiteId: SITE, keyEvents: [] }, "twofactor:secret")).rejects.toThrow(/two-factor/);
    // A server that isn't Umami (an HTML page answering 200) is caught at the check, not at the first sync.
    const html = createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end("<html>hi</html>"));
    await new Promise<void>((r) => html.listen(0, "127.0.0.1", r));
    try {
      await expect(checkUmami({ baseUrl: `http://127.0.0.1:${(html.address() as { port: number }).port}/api`, websiteId: SITE, keyEvents: [] }, KEY)).rejects.toThrow(/didn't answer like Umami/);
    } finally {
      await new Promise((r) => html.close(r));
    }
  });

  it("writes the same metric rows GA4 does", async () => {
    const rows = await fetchUmamiMetrics({ baseUrl: base, websiteId: SITE, keyEvents: ["signup"] }, KEY, { days: 3 });
    const day = rows.find((r) => r.metric === "sessions" && !r.dimension)!.day;
    const on = (metric: string, dimension?: string) => rows.filter((r) => r.day === day && r.metric === metric && r.dimension === dimension).map((r) => r.value);
    expect(on("sessions")).toEqual([20]);
    expect(on("users")).toEqual([18]);
    expect(on("sessions", "source:google / organic")).toEqual([6]);
    expect(on("sessions", "source:chatgpt.com / referral")).toEqual([4]);
    // Visits without a referrer aren't in Umami's referrer breakdown: they're the rest of the day's visits.
    expect(on("sessions", "source:(direct) / (none)")).toEqual([8]);
    expect(on("sessions", "page:/pricing")).toEqual([8]);
    expect(on("sessions", "utm_content:draft-123")).toEqual([3]);
    // Engagement, landing pages, countries, devices and browsers, named as GA4's are.
    expect(on("engaged_sessions")).toEqual([15]);
    expect(on("engagement_seconds")).toEqual([900]);
    expect(on("sessions", "landing:/pricing")).toEqual([6]);
    expect(on("sessions", "country:US")).toEqual([11]);
    expect(on("sessions", "device:desktop")).toEqual([12]);
    expect(on("sessions", "browser:firefox")).toEqual([12]);
    // Key events: only the chosen ones count in the total; every event is kept by name.
    const today = new Date().toLocaleDateString("en-CA");
    expect(rows.filter((r) => r.day === today && r.metric === "key_events" && !r.dimension).map((r) => r.value)).toEqual([2]);
    expect(rows.some((r) => r.dimension === "event:newsletter")).toBe(true);
    expect(rows.some((r) => r.metric === "key_events" && r.dimension === "utm_content:draft-123")).toBe(true);
    // Every day has a key-event total, zero included, so changing the chosen events replaces old totals.
    expect(rows.filter((r) => r.metric === "key_events" && !r.dimension)).toHaveLength(3);
    // One stats call per day, and breakdowns only on days with visits.
    expect(seen.filter((s) => s.endsWith("/stats")).length).toBeGreaterThanOrEqual(3);
  });

  it("syncs as a connection and becomes the product's web analytics", async () => {
    const dir = mkdtempSync(join(tmpdir(), "startica-umami-"));
    openDatabase(join(dir, "test.db"));
    setCipher(fileKeyCipher(join(dir, "key")));
    try {
      await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
      const workspaceId = (await ensureWorkspace()).id;
      const productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning())[0]!.id;
      const secretId = await putSecret("connection-umami", KEY);
      const [conn] = await getDb().insert(connections).values({ workspaceId, productId, kind: "umami", config: { baseUrl: base, websiteId: SITE, keyEvents: [] }, secretId }).returning();
      expect(await webSource(productId)).toBe("umami");
      const result = await runMetricsSync({ workspaceId }, { workspaceId, connectionId: conn!.id });
      expect(result.umami?.error).toBeUndefined();
      const stored = await getDb().select().from(metricsSnapshots).where(and(eq(metricsSnapshots.productId, productId), eq(metricsSnapshots.source, "umami"), eq(metricsSnapshots.metric, "sessions"), eq(metricsSnapshots.dimension, "")));
      // The first sync reads the product's whole history (90 days), and says so in the connection.
      expect(stored.length).toBe(90);
      const [synced] = await getDb().select().from(connections).where(eq(connections.id, conn!.id));
      expect(synced!.config.syncedFrom).toBe(stored.map((r) => r.day).sort()[0]);
      // Later syncs re-read only the last few days.
      const before = seen.filter((x) => x.endsWith("/stats")).length;
      await runMetricsSync({ workspaceId }, { workspaceId, connectionId: conn!.id });
      expect(seen.filter((x) => x.endsWith("/stats")).length - before).toBe(5);
      // With GA4 connected and working too, GA4 wins; Umami is used when GA4 isn't working.
      await getDb().insert(connections).values({ workspaceId, productId, kind: "ga4", config: { propertyId: "1" }, status: "ok" });
      expect(await webSource(productId)).toBe("ga4");
      await getDb().update(connections).set({ status: "error" }).where(eq(connections.kind, "ga4"));
      expect(await webSource(productId)).toBe("umami");
    } finally {
      closeDatabase();
    }
  }, 30_000); // a 90-day first sync, then a short one
});
