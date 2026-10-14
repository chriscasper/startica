import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { a11yIssueGroups, connections, dailyMoves, jobs, metricsSnapshots, products, securityFindings, seoFindings, siteScans, sites } from "@startica/db/schema";
import { localDay } from "../growth/moves.ts";
import { daysAgo, isoDay } from "../metrics/types.ts";
import { dashboardSummary } from "./summary.ts";

let workspaceId = "";
let productId = "";
let siteId = "";
beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-dashboard-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote", intelStatus: "ready" }).returning())[0]!.id;
});
afterAll(() => closeDatabase());

describe("dashboard", () => {
  it("is quiet for a new product with no sites or data", async () => {
    const s = await dashboardSummary(workspaceId, productId);
    expect(s.sites).toEqual([]);
    expect(s.marketing.web).toBeNull();
    expect(s.search).toEqual({ connected: false, clicks: null, change: null });
    // Only the missing AI key (tests run without one).
    expect(s.attention.map((a) => a.title)).toEqual(["Add an AI key"]);
    // AI is off in the demo, so the key isn't asked for there.
    expect((await dashboardSummary(workspaceId, productId, { demo: true })).attention).toEqual([]);
  });

  it("sums each module and lists what needs the owner, broken things first", async () => {
    const db = getDb();
    const site = (await db.insert(sites).values({ workspaceId, productId, name: "fieldnote.example", startUrl: "https://fieldnote.example/", ownershipConfirmedAt: new Date(), score: 72, seoScore: 81, securityVerifiedAt: new Date(), securityScore: 64, security: { tls: { protocol: "TLSv1.3", authorized: true, error: null, validTo: Date.now() + 5 * 86_400_000, issuer: null } } as never }).returning())[0]!;
    siteId = site.id;
    const scan = (await db.insert(siteScans).values({ workspaceId, siteId, scope: "full", status: "done", finishedAt: new Date() }).returning())[0]!;
    await db.update(sites).set({ lastScanId: scan.id });
    const group = (impact: "critical" | "minor", n: number) => ({ workspaceId, siteId, ruleId: `rule-${impact}-${n}`, fingerprint: `${impact}${n}`, help: "Fix it", impact, status: "open" as const });
    await db.insert(a11yIssueGroups).values([group("critical", 1), group("critical", 2), group("minor", 1)]);
    const now = new Date();
    const finding = (severity: "critical" | "low", key: string) => ({ workspaceId, siteId, groupKey: key, rule: key, severity, firstSeenAt: now, lastSeenAt: now });
    await db.insert(securityFindings).values([finding("critical", "exposed-git"), finding("low", "server-version")]);
    // Two pages sharing one problem count once.
    await db.insert(seoFindings).values([
      { workspaceId, siteId, rule: "noindex-in-sitemap", severity: "high", groupKey: "a" },
      { workspaceId, siteId, rule: "noindex-in-sitemap", severity: "high", groupKey: "a" },
    ]);
    await db.insert(connections).values({ workspaceId, productId, kind: "stripe", config: {}, status: "error", lastError: "Invalid API key" });
    await db.insert(jobs).values({ workspaceId, queue: "metrics_sync", payload: {}, status: "failed" });
    const today = localDay();
    await db.insert(dailyMoves).values([
      { workspaceId, productId, day: today, rank: 1, kind: "inbox", title: "Reply", why: "", status: "done" },
      { workspaceId, productId, day: today, rank: 2, kind: "content", title: "Write", why: "", status: "open" },
    ]);
    await db.insert(connections).values({ workspaceId, productId, kind: "ga4", config: { propertyId: "1" }, status: "ok" });
    await db.insert(metricsSnapshots).values([
      { workspaceId, productId, day: isoDay(daysAgo(1)), source: "ga4", metric: "sessions", dimension: "", value: 120 },
      { workspaceId, productId, day: isoDay(daysAgo(40)), source: "ga4", metric: "sessions", dimension: "", value: 100 },
      { workspaceId, productId, day: isoDay(daysAgo(1)), source: "ga4", metric: "key_events", dimension: "", value: 6 },
    ]);

    const s = await dashboardSummary(workspaceId, productId);
    expect(s.marketing.moves).toEqual({ total: 2, done: 1, open: 1 });
    expect(s.marketing.web).toEqual({ source: "ga4", sessions: 120, previous: 100, keyEvents: 6 });
    const [x] = s.sites;
    expect(x!.a11y).toMatchObject({ score: 72, open: 3, critical: 2 });
    expect(x!.a11y.lastScanAt).not.toBeNull();
    expect(x!.seo).toMatchObject({ score: 81, high: 1 });
    expect(x!.security).toMatchObject({ verified: true, score: 64, open: 2, critical: 1, certDays: 4 });
    expect(s.system.failed).toMatchObject({ count: 1, latest: { label: "Syncing analytics" } });

    const titles = s.attention.map((a) => a.title);
    expect(titles).toEqual([
      "Add an AI key",
      "Stripe isn't connecting",
      "1 serious security finding on fieldnote.example",
      "fieldnote.example's certificate expires in 4 days",
      "2 critical accessibility issues on fieldnote.example",
      "1 high-priority search problem on fieldnote.example",
      "1 background job failed this week",
      "1 move left today",
    ]);
    expect(s.attention.find((a) => a.module === "accessibility")!.href).toBe(`/accessibility/issues?site=${siteId}`);
  });

  it("leaves security out until the site is verified", async () => {
    await getDb().update(sites).set({ securityVerifiedAt: null });
    const [x] = (await dashboardSummary(workspaceId, productId)).sites;
    expect(x!.security).toMatchObject({ verified: false, score: null, open: 0, critical: 0, certDays: null });
  });
});
