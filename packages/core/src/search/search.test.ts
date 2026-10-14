import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { connections, metricsSnapshots, products, searchStats } from "@startica/db/schema";
import { fileKeyCipher, putSecret, setCipher } from "@startica/db/secrets";
import { runMetricsSync } from "../metrics/sync.ts";
import { aiAndOrganicTraffic, aiAssistantOf } from "./ai-referrals.ts";
import { bingDay, setBingApiBase } from "./bing.ts";
import { clearTokenCache, parseServiceAccount, setGoogleApiBase } from "./google.ts";
import { brandMatcher, dailyTotals, expectedCtr, flagsFor, periods, siteTotals, topKeys } from "./report.ts";
import { checkProperty, domainPropertyFor, normalizeProperty, windows } from "./search-console.ts";
import { savedSitemaps } from "./sync.ts";
// @ts-expect-error plain JS helper shared with the smoke test
import { BING_KEY, BING_SITE, startBingStandin, startGoogleStandin, STANDIN_PROPERTY, testServiceAccount } from "./standin.mjs";

const account = testServiceAccount();
let google: { url: string; requests: { path: string; body: string }[]; close: () => Promise<void> };
let workspaceId = "";
let productId = "";

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-search-"));
  openDatabase(join(dir, "test.db"));
  setCipher(fileKeyCipher(join(dir, "key")));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  productId = (await getDb().insert(products).values({ workspaceId, name: "Example", url: "https://example.com" }).returning())[0]!.id;
  google = await startGoogleStandin(0, { publicKey: account.publicKey, clientEmail: account.key.client_email, days: 60, today: new Date() });
  setGoogleApiBase(google.url);
});
afterAll(async () => {
  setGoogleApiBase(null);
  await google.close();
  closeDatabase();
});

describe("properties and keys", () => {
  it("reads what the user typed as a property", () => {
    expect(normalizeProperty("example.com")).toBe("sc-domain:example.com");
    expect(normalizeProperty("sc-domain:Example.com")).toBe("sc-domain:example.com");
    expect(normalizeProperty("https://example.com")).toBe("https://example.com/");
  });

  it("explains what to fix for a bad key or a property the account can't read", async () => {
    expect(() => parseServiceAccount("{")).toThrow(/valid JSON/);
    expect(() => parseServiceAccount('{"type":"authorized_user"}')).toThrow(/service account key/);
    await expect(checkProperty(account.key, "sc-domain:other.example")).rejects.toThrow(/It can read: sc-domain:example.com/);
    const stranger = testServiceAccount("someone@else.iam.gserviceaccount.com");
    clearTokenCache();
    await expect(checkProperty(stranger.key, STANDIN_PROPERTY)).rejects.toThrow(/Google refused the service account key/);
    await expect(checkProperty(account.key, STANDIN_PROPERTY)).resolves.toBe(STANDIN_PROPERTY);
    // A URL-prefix property the account can't read falls back to the site's Domain property it can.
    await expect(checkProperty(account.key, "https://www.example.com/")).resolves.toBe(STANDIN_PROPERTY);
    expect(domainPropertyFor("https://WWW.Example.com/blog/")).toBe("sc-domain:example.com");
    expect(domainPropertyFor("sc-domain:example.com")).toBeNull();
  });
});

describe("sync", () => {
  it("syncs every dimension, then only recent days, and can reuse the GA4 key", async () => {
    const ga4Secret = await putSecret("connection-ga4", account.json);
    await getDb().insert(connections).values({ workspaceId, productId, kind: "ga4", config: { propertyId: "1" }, secretId: ga4Secret });
    const [conn] = await getDb()
      .insert(connections)
      .values({ workspaceId, productId, kind: "search_console", config: { siteUrl: STANDIN_PROPERTY, useGa4Key: true } })
      .returning();

    const first = await runMetricsSync({ workspaceId }, { workspaceId, connectionId: conn!.id });
    expect(first.search_console?.error).toBeUndefined();
    const count = (kind: string) => getDb().select().from(searchStats).where(and(eq(searchStats.productId, productId), eq(searchStats.kind, kind as "query")));
    expect((await count("total")).length).toBe(60);
    expect((await count("query")).length).toBe(300);
    expect(new Set((await count("device")).map((r) => r.key))).toEqual(new Set(["desktop", "mobile"]));
    const [saved] = await getDb().select().from(connections).where(eq(connections.id, conn!.id));
    expect(saved).toMatchObject({ status: "ok", lastError: null });
    expect((await savedSitemaps(productId))?.sitemaps[0]).toMatchObject({ path: "https://example.com/sitemap.xml", submitted: 42, warnings: 1 });

    // The second sync re-reads only the last few days.
    const before = google.requests.length;
    await runMetricsSync({ workspaceId }, { workspaceId, connectionId: conn!.id });
    const queries = google.requests.slice(before).filter((r) => r.path.endsWith("/searchAnalytics/query"));
    const start = JSON.parse(queries[0]!.body).startDate as string;
    expect(Date.now() - Date.parse(start)).toBeLessThan(7 * 86400_000);
  });

  it("records a clear error when the property isn't readable", async () => {
    const other = (await getDb().insert(products).values({ workspaceId, name: "Other" }).returning())[0]!.id;
    const secretId = await putSecret("connection-other", account.json);
    const [conn] = await getDb().insert(connections).values({ workspaceId, productId: other, kind: "search_console", config: { siteUrl: "sc-domain:other.example" }, secretId }).returning();
    await runMetricsSync({ workspaceId }, { workspaceId, connectionId: conn!.id });
    const [saved] = await getDb().select().from(connections).where(eq(connections.id, conn!.id));
    expect(saved?.status).toBe("error");
    expect(saved?.lastError).toMatch(/Settings → Users and permissions.*startica@fieldnote-test/);
  });
});

describe("report", () => {
  it("sums periods, weights positions by impressions, and flags opportunities", async () => {
    const p = await periods(productId, "google", 28);
    const totals = await siteTotals(productId, "google", p.current);
    const days = await dailyTotals(productId, "google", p.current);
    expect(days).toHaveLength(28);
    expect(totals.clicks).toBe(days.reduce((n, d) => n + d.clicks, 0));
    expect(totals.position).toBeGreaterThan(1);

    const isBrand = brandMatcher(["Example"]);
    const queries = await topKeys(productId, "google", "query", p.current, p.previous, { isBrand });
    const byKey = Object.fromEntries(queries.map((q) => [q.key, q]));
    expect(byKey["example app"]?.brand).toBe(true);
    expect(byKey["field notes app"]?.brand).toBe(false);
    expect(byKey["field notes app"]?.flags).toContain("striking");
    expect(byKey["example app"]?.flags).toEqual([]);
    expect(byKey["how to take field notes"]?.flags).toContain("low_ctr");
    expect(byKey["field notes app"]!.previousClicks).toBeGreaterThan(0);
  });

  it("keeps the flag rules simple and predictable", () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(8));
    expect(flagsFor({ clicks: 1, impressions: 500, ctr: 0.002, position: 3 }, 50)).toEqual(["low_ctr"]);
    expect(flagsFor({ clicks: 1, impressions: 10, ctr: 0.1, position: 9 }, 50)).toEqual([]);
    expect(brandMatcher(["Field note"])("fieldnote pricing")).toBe(true);
  });

  it("finds AI assistant and organic visits in GA4 sources", async () => {
    expect(aiAssistantOf("chatgpt.com")).toBe("ChatGPT");
    expect(aiAssistantOf("www.perplexity.ai")).toBe("Perplexity");
    expect(aiAssistantOf("google")).toBeNull();
    const row = (day: string, dimension: string, value: number) => ({ workspaceId, productId, day, source: "ga4" as const, metric: "sessions", dimension, value });
    await getDb()
      .insert(metricsSnapshots)
      .values([
        row("2026-10-01", "source:chatgpt.com / referral", 4),
        row("2026-10-02", "source:claude.ai / referral", 2),
        row("2026-10-02", "source:google / organic", 30),
        row("2026-10-02", "source:bing / organic", 5),
        row("2026-10-02", "source:reddit.com / referral", 9),
      ]);
    const t = await aiAndOrganicTraffic(productId, "2026-10-01", "2026-10-31");
    expect(t).toMatchObject({ ai: 6, organic: 35, hasData: true });
    expect(t.assistants).toEqual([{ name: "ChatGPT", sessions: 4 }, { name: "Claude", sessions: 2 }]);
    expect(t.engines[0]).toEqual({ source: "google", sessions: 30 });
  });
});


describe("bing", () => {
  it("syncs daily totals and weekly queries and pages, and explains a bad key", async () => {
    const bing = await startBingStandin(0);
    setBingApiBase(bing.url);
    try {
      expect(bingDay("/Date(1316156400000-0700)/")).toBe("2011-09-16");
      const bingProduct = (await getDb().insert(products).values({ workspaceId, name: "Bing Co" }).returning())[0]!.id;
      const secretId = await putSecret("connection-bing", BING_KEY);
      const [conn] = await getDb().insert(connections).values({ workspaceId, productId: bingProduct, kind: "bing_webmaster", config: { siteUrl: BING_SITE }, secretId }).returning();
      const result = await runMetricsSync({ workspaceId }, { workspaceId, connectionId: conn!.id });
      expect(result.bing_webmaster?.error).toBeUndefined();
      const rows = await getDb().select().from(searchStats).where(and(eq(searchStats.productId, bingProduct), eq(searchStats.source, "bing")));
      expect(rows.filter((r) => r.kind === "total")).toHaveLength(30);
      expect(rows.filter((r) => r.kind === "query")).toHaveLength(8);
      // Bing sends -1 when it has no position: stored as unknown (0), not as a top result.
      expect(rows.find((r) => r.kind === "query" && r.key === "field notes app")?.position).toBe(0);

      const badSecret = await putSecret("connection-bing-bad", "wrong");
      await getDb().update(connections).set({ secretId: badSecret }).where(eq(connections.id, conn!.id));
      await runMetricsSync({ workspaceId }, { workspaceId, connectionId: conn!.id });
      const [saved] = await getDb().select().from(connections).where(eq(connections.id, conn!.id));
      expect(saved?.lastError).toMatch(/Bing refused the API key/);
    } finally {
      setBingApiBase(null);
      await bing.close();
    }
  });

  it("counts GA4's ai-assistant medium as AI visits", async () => {
    await getDb().insert(metricsSnapshots).values({ workspaceId, productId, day: "2026-10-03", source: "ga4", metric: "sessions", dimension: "source:newassistant.example / ai-assistant", value: 3 });
    const t = await aiAndOrganicTraffic(productId, "2026-10-03", "2026-10-03");
    expect(t.assistants).toEqual([{ name: "newassistant.example", sessions: 3 }]);
  });
});

describe("review fixes", () => {
  it("matches brand names as whole words, written with or without spaces", () => {
    const isBrand = brandMatcher(["Fieldnote", "fieldnote"]);
    expect(["fieldnote", "field note app", "Fieldnote pricing", "field-note"].map(isBrand)).toEqual([true, true, true, true]);
    expect(["field notes app", "how to take field notes", "offline field notebook"].map(isBrand)).toEqual([false, false, false]);
  });

  it("reads a long range a month at a time, newest first", () => {
    const w = windows("2026-01-01", "2026-03-15");
    expect(w[0]).toEqual({ start: "2026-02-13", end: "2026-03-15" });
    expect(w.at(-1)?.start).toBe("2026-01-01");
    expect(w.reduce((n, x) => n + (Date.parse(x.end) - Date.parse(x.start)) / 86400_000 + 1, 0)).toBe(74);
  });

  it("leaves rows without a position out of the average, and compares only covered periods", async () => {
    const pid = (await getDb().insert(products).values({ workspaceId, name: "Avg Co" }).returning())[0]!.id;
    const row = (day: string, position: number) => ({ workspaceId, productId: pid, source: "bing" as const, day, kind: "total" as const, key: "", clicks: 1, impressions: 100, position });
    await getDb().insert(searchStats).values([row("2026-10-01", 4), row("2026-10-02", 0)]);
    const p = await periods(pid, "bing", 7);
    expect((await siteTotals(pid, "bing", p.current)).position).toBe(4);
    expect(p.previousComplete).toBe(false);
  });
});
