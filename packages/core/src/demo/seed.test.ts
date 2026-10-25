import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import * as s from "@startica/db/schema";
import { loadCampaign } from "../ads/campaigns.ts";
import { evalPath, readEvalFile } from "../ai/evals/score/cases.ts";
import { loadProductContext } from "../distribution/context.ts";
import { importKey } from "../security/ai.ts";
import { citedDomains } from "../offsite/domains.ts";
import { listeningTrends } from "../distribution/trends.ts";
import { aiAndOrganicTraffic } from "../search/ai-referrals.ts";
import { periods, topKeys } from "../search/report.ts";
import { DEMO_OPPORTUNITIES, DEMO_PRODUCT } from "./fieldnote.ts";
import { clearProductData, productCount, seedDemo } from "./seed.ts";
import { hintFor, loadBestTimes } from "../content/best-time.ts";
import { loadActivity } from "../competitors/activity.ts";
import { competitorCandidates } from "../competitors/briefs.ts";
import { loadBenchmarks } from "../benchmarks/report.ts";

beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-demo-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
});
afterAll(() => closeDatabase());

describe("seedDemo", () => {
  it("loads a complete demo product without AI calls", async () => {
    expect(await productCount()).toBe(0);
    const { productId, counts } = await seedDemo(new Date("2026-10-09T12:00:00Z"));
    expect(await productCount()).toBe(1);

    const db = getDb();
    const opps = await db.select().from(s.opportunities).where(eq(s.opportunities.productId, productId));
    expect(opps).toHaveLength(DEMO_OPPORTUNITIES.length + counts["listening history"]!);
    expect(new Set(opps.map((o) => o.status))).toEqual(new Set(["drafted", "posted", "archived", "dismissed"]));
    expect(opps.filter((o) => o.duplicateOfId)).toHaveLength(1);

    const days = new Set((await db.select({ day: s.metricsSnapshots.day }).from(s.metricsSnapshots)).map((r) => r.day));
    expect(days.size).toBeGreaterThanOrEqual(30);
    expect(counts["ai runs"]).toBeGreaterThan(0);
    expect(counts["accessibility pages"]).toBe(7);
    expect(counts["ad campaigns"]).toBe(2);
    // Content calendar: a plan for the coming week, a planned reply, and enough Bluesky history for a best-time hint.
    expect(counts["calendar pieces"]).toBe(13);
    const [plan] = await db.select().from(s.contentPlans).where(eq(s.contentPlans.productId, productId));
    expect(plan).toMatchObject({ status: "ready", postsPerWeek: 3 });
    expect(plan!.items.every((i) => i.pieceId)).toBe(true);
    expect(opps.filter((o) => o.plannedAt)).toHaveLength(1);
    expect(hintFor(await loadBestTimes(productId, new Date("2026-10-09T12:00:00Z")), "bluesky")).toMatchObject({ enough: true, source: "engagement", hours: [9] });
    expect(counts["search rows"]).toBeGreaterThan(90 * 10);
    expect(counts["AI visibility questions"]).toBe(12);
    expect(counts["agent readiness checks"]).toBe(2);
    expect(counts["off-site pages read"]).toBeGreaterThan(10);
    const offsite = await citedDomains(productId);
    expect(offsite.domains.find((d) => d.domain === "reviews.example")).toMatchObject({ youAppear: false, competitorsThere: ["TerraJot", "Quadrat"] });
    // Intel → Following: a researched competitor, people, new posts, a page change and briefs; people's accounts stay out of Benchmarks.
    expect(counts["competitor posts"]).toBe(6);
    const activity = await loadActivity(productId);
    expect(activity.filter((p) => !p.seen).map((p) => p.person ?? p.competitor)).toEqual(["TerraJot", "Morgan Fieldhouse", "TerraJot", "Morgan Fieldhouse"]);
    expect(activity.find((p) => p.kind === "change")).toMatchObject({ relevance: "high", title: "Changed: TerraJot pricing" });
    expect((await competitorCandidates(productId, new Date("2026-10-09T12:00:00Z")))[0]).toMatchObject({ title: "Read today's competitor brief" });
    expect((await loadBenchmarks(productId)).accounts.some((a) => a.handle === "morgan.terrajot.example")).toBe(false);
    // Inbox → Trends and Replies have something to show.
    const trends = await listeningTrends(productId, 30, new Date("2026-10-09T12:00:00Z"));
    expect(trends.spikes.map((sp) => sp.label)).toContain("offline note taking");
    expect(trends.shareOfVoice.find((v) => v.id === null)!.mentions).toBeGreaterThan(0);
    expect(trends.shareOfVoice.filter((v) => v.mentions > 0).length).toBeGreaterThan(2);
    expect(trends.sentiment.scored).toBeGreaterThan(30);
    expect(counts["replies to your posts"]).toBe(4);
    expect(await db.select().from(s.jobs).where(eq(s.jobs.queue, "agent_check"))).toEqual([]);
    expect((await db.select().from(s.agentChecks)).map((c) => c.score).sort()).toEqual([73, 79]);
    const visibilityRuns = await db.select().from(s.aiVisibilityRuns).orderBy(s.aiVisibilityRuns.startedAt);
    expect(visibilityRuns.map((r) => r.metrics?.mentioned)).toEqual([3, 4, 5, 6]);
    expect(visibilityRuns.at(-1)?.metrics?.brands[0]?.name).toBeDefined();
    const sp = await periods(productId, "google", 28);
    const queries = await topKeys(productId, "google", "query", sp.current, sp.previous);
    expect(queries.some((q) => q.flags.includes("striking"))).toBe(true);
    expect(queries.some((q) => q.flags.includes("low_ctr"))).toBe(true);
    expect((await aiAndOrganicTraffic(productId, sp.current.start, sp.current.end)).assistants.map((a) => a.name).sort()).toEqual(["ChatGPT", "Claude", "Perplexity"]);
    // The demo's ads pass the platforms' limits: only advice, no errors.
    for (const c of await db.select().from(s.adCampaigns)) {
      const detail = await loadCampaign(c.workspaceId, c.id);
      expect(detail!.errors, c.name).toBe(0);
    }
    const groups = (await getDb().select().from(s.a11yIssueGroups).where(eq(s.a11yIssueGroups.status, "open"))).filter((g) => g.kind === "violation");
    expect((await getDb().select().from(s.a11yIssueGroups).where(eq(s.a11yIssueGroups.kind, "needs_review"))).map((g) => g.ruleId)).toEqual(["color-contrast"]);
    // The shared logo (6 pages, image + link) plus one issue each on pricing, signup and blog.
    expect(groups.map((g) => `${g.ruleId}×${g.pagesCount}`).sort()).toEqual(["color-contrast×1", "image-alt×6", "label×1", "link-name×6", "target-size×1"]);
    // Content (A5): the planted misspellings, the dense blog post, the placeholder rule, and the checked PDFs and links.
    const content = await db.select({ kind: s.siteFindings.kind, key: s.siteFindings.key, url: s.sitePages.url }).from(s.siteFindings).innerJoin(s.sitePages, eq(s.sitePages.id, s.siteFindings.pageId));
    expect(content.map((f) => `${f.kind}:${f.key}@${new URL(f.url).pathname}`).sort()).toEqual([
      "readability:readability@/blog/offline-field-kit",
      "rule:demo-placeholder-text@/help",
      "spelling:recieve@/help",
      "spelling:seperate@/blog/offline-field-kit",
    ]);
    expect((await db.select().from(s.siteDocuments)).map((d) => d.problems.length).sort()).toEqual([0, 3]);
    expect(await db.select().from(s.jobs).where(eq(s.jobs.queue, "site_content_check"))).toEqual([]);
    const [site] = await getDb().select().from(s.sites);
    expect(site!.score).toBeGreaterThan(63); // better than the last seeded history entry
    // Security: verified as demo data, every finding state present, scored above the last history entry.
    const sec = await db.select().from(s.securityFindings);
    expect(sec.filter((f) => f.status === "open").map((f) => f.groupKey).sort()).toEqual(
      [
        "cookie-no-samesite:fn_theme",
        "csp-missing",
        "dmarc-none",
        "mixed-content-passive",
        "permissions-policy-missing",
        "security-txt-missing",
        "server-version:server:fieldnote-edge/2.4",
        "third-party-script-no-sri:cdn.chartkit.example",
        importKey("Password reset links stay valid after use"),
        "vuln:jquery@3.4.1",
      ].sort(),
    );
    expect(new Set(sec.map((f) => f.status))).toEqual(new Set(["open", "accepted", "fixed"]));
    expect(site).toMatchObject({ securityVerifiedBy: "demo", securityScore: 66 }); // the monitor's high finding counts; imported findings don't
    expect((await db.select().from(s.securityReports))[0]?.triage?.duplicateOf).toBe(sec.find((f) => f.groupKey.startsWith("third-party"))!.id);
    const runs = await db.select().from(s.aiRuns);
    expect(runs.every((r) => r.costUsd > 0)).toBe(true);
    for (const table of [s.personas, s.competitors, s.communities, s.drafts, s.publications, s.voiceSamples, s.contentPieces, s.roadmapItems, s.audits]) {
      expect((await db.select().from(table)).length).toBeGreaterThan(0);
    }
    const [voice] = await db.select().from(s.voiceProfiles);
    expect(voice?.status).toBe("ready");
  }, 30_000); // 90 days of demo metrics: seeding takes a few seconds when the whole suite runs at once

  it("keeps the scorer eval set's product snapshot in sync with the demo product", async () => {
    const [product] = await getDb().select({ id: s.products.id }).from(s.products);
    const file = readEvalFile(evalPath(DEMO_PRODUCT.name));
    expect(file?.productContext).toBe((await loadProductContext(product!.id)).text);
  });

  it("clears products and their data for --force", async () => {
    await clearProductData();
    expect(await productCount()).toBe(0);
    expect(await getDb().select().from(s.opportunities)).toHaveLength(0);
    await seedDemo();
    expect(await productCount()).toBe(1);
  }, 30_000);
});
