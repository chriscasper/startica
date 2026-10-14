import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { adCampaigns, adGroups, ads, connections, dailyMoves, metricsSnapshots, products, roadmapItems } from "@startica/db/schema";
import { buildCandidates } from "../growth/moves.ts";
import {
  addDays,
  addSpend,
  campaignResults,
  campaignReview,
  readOut,
  spendInput,
  spendInWindow,
  suggest,
  suggestionToRoadmap,
  suggestionToToday,
  topAdSuggestions,
  type AdResult,
} from "./results.ts";

let workspaceId = "";
let productId = "";
let campaignId = "";
let adIds: string[] = [];
const today = new Date().toLocaleDateString("en-CA");

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-ad-results-"));
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning())[0]!.id;
  await getDb().insert(connections).values({ workspaceId, productId, kind: "ga4", config: { propertyId: "1" }, status: "ok" });
  campaignId = (
    await getDb()
      .insert(adCampaigns)
      .values({ workspaceId, productId, platform: "reddit", name: "Reddit test", goal: "Signups", landingUrl: "https://fieldnote.example/", utmCampaign: "reddit-test", status: "running", testBudget: 100, targetCost: 7 })
      .returning()
  )[0]!.id;
  const groupId = (await getDb().insert(adGroups).values({ workspaceId, campaignId, name: "Fieldwork" }).returning())[0]!.id;
  for (const title of ["One", "Two", "Three"]) adIds.push((await getDb().insert(ads).values({ workspaceId, groupId, copy: { title }, createdAt: new Date(Date.now() + adIds.length) }).returning())[0]!.id);
  // 14 days: ad 1 cheap signups, ad 2 expensive, ad 3 barely spent.
  const rows: (typeof metricsSnapshots.$inferInsert)[] = [];
  for (let n = 0; n < 14; n++) {
    const day = addDays(today, -n);
    rows.push({ workspaceId, productId, day, source: "ga4", metric: "sessions", dimension: `utm_content:${adIds[0]}`, value: 20 });
    rows.push({ workspaceId, productId, day, source: "ga4", metric: "key_events", dimension: `utm_content:${adIds[0]}`, value: 1 });
    rows.push({ workspaceId, productId, day, source: "ga4", metric: "sessions", dimension: `utm_content:${adIds[1]}`, value: 10 });
    rows.push({ workspaceId, productId, day, source: "ga4", metric: "key_events", dimension: `utm_content:${adIds[1]}`, value: n === 3 ? 1 : 0 });
    // Another source's rows for the same ad are ignored while GA4 is the web source.
    rows.push({ workspaceId, productId, day, source: "umami", metric: "sessions", dimension: `utm_content:${adIds[0]}`, value: 999 });
  }
  await getDb().insert(metricsSnapshots).values(rows);
  const campaign = (await getDb().select().from(adCampaigns).where(eq(adCampaigns.id, campaignId)))[0]!;
  const spend = (v: Record<string, string>) => addSpend(campaign, spendInput.parse(v));
  await spend({ ad_id: adIds[0]!, start_day: addDays(today, -13), end_day: today, amount: "56", clicks: "300", impressions: "100000" });
  await spend({ ad_id: adIds[1]!, start_day: addDays(today, -13), end_day: today, amount: "60", clicks: "40", impressions: "90000" });
  await spend({ ad_id: adIds[2]!, start_day: addDays(today, -6), end_day: today, amount: "5" });
  await spend({ ad_id: "", start_day: addDays(today, -6), end_day: today, amount: "14" });
});
afterAll(() => closeDatabase());

const campaign = async () => (await getDb().select().from(adCampaigns).where(eq(adCampaigns.id, campaignId)))[0]!;
const result = (r: Partial<AdResult>): AdResult => ({ adId: "a", label: "Ad", group: "G", copy: {}, spend: 0, visits: 0, results: 0, clicks: null, impressions: null, cpa: null, costPerVisit: null, ...r });

describe("spend", () => {
  it("checks what's entered", () => {
    expect(() => spendInput.parse({ start_day: today, end_day: addDays(today, -1), amount: "5" })).toThrow(/after the first/);
    expect(() => spendInput.parse({ start_day: today, end_day: addDays(today, 1), amount: "5" })).toThrow(/future/);
    expect(() => spendInput.parse({ start_day: today, end_day: today, amount: "-1" })).toThrow(/negative/);
    expect(spendInput.parse({ start_day: today, end_day: today, amount: "5", clicks: "" }).clicks).toBeUndefined();
  });

  it("spreads spend evenly over its days", () => {
    const entry = { startDay: "2026-10-01", endDay: "2026-10-10", amount: 100, clicks: 50, impressions: null };
    expect(spendInWindow(entry, { from: "2026-10-06", to: "2026-10-20" })).toEqual({ amount: 50, clicks: 25, impressions: null });
    expect(spendInWindow(entry, { from: "2026-10-11", to: "2026-10-20" })).toBeNull();
  });
});

describe("results", () => {
  it("adds up visits, results and spend per ad from the web source", async () => {
    const r = await campaignResults(await campaign(), { from: addDays(today, -13), to: today });
    const [one, two, three] = r.ads;
    expect(r.source).toBe("ga4");
    expect(one).toMatchObject({ visits: 280, results: 14, spend: 56, clicks: 300, impressions: 100000, cpa: 4, costPerVisit: 0.2 });
    expect(two).toMatchObject({ visits: 140, results: 1, spend: 60, cpa: 60 });
    expect(three).toMatchObject({ spend: 5, results: 0, cpa: null });
    expect(r.unassignedSpend).toBe(14);
    expect(r.total.spend).toBe(135);
    // The last 7 days only: half of each two-week entry.
    const week = await campaignResults(await campaign(), { from: addDays(today, -6), to: today });
    expect(week.ads[0]).toMatchObject({ spend: 28, visits: 140, results: 7 });
  });

  it("suggests scale, stop and wait from the target", async () => {
    const { suggestions } = await campaignReview(await campaign(), today);
    expect(suggestions.map((s) => s.verdict)).toEqual(["scale", "stop", "wait"]);
    expect(suggestions[0]!.why).toContain("4.00 per result, under the 7.00 target");
    expect(suggestions[2]!.why).toContain("needs about");
  });

  it("works without a target by comparing ads, and says when there's too little data", () => {
    const c = { platform: "meta" as const, targetCost: null, testBudget: 200 };
    // Median of $10 and $30 is $20: $10 scales, $30 is between 1.2× and 2× (rewrite).
    const out = suggest(c, [result({ adId: "a", spend: 100, results: 10, cpa: 10 }), result({ adId: "b", spend: 90, results: 3, cpa: 30 })]);
    expect(out.map((s) => s.verdict)).toEqual(["scale", "rewrite"]);
    expect(out[1]!.guidance).toBeTruthy();
    // One ad with results and no target: keep, and ask for a target; before half its test budget, too early.
    expect(suggest(c, [result({ spend: 120, results: 6, cpa: 20 })])[0]).toMatchObject({ verdict: "keep" });
    expect(suggest(c, [result({ spend: 120, results: 6, cpa: 20 })])[0]!.why).toMatch(/Set a target/);
    expect(suggest(c, [result({ spend: 80, results: 4, cpa: 20 })])[0]).toMatchObject({ verdict: "wait" });
    // No results: rewrite first, stop once it has spent twice as much; few clicks are called out.
    const google = { platform: "google" as const, targetCost: 25, testBudget: 40 };
    expect(suggest(google, [result({ spend: 30, clicks: 10, impressions: 2000, visits: 9 })])[0]).toMatchObject({ verdict: "rewrite" });
    expect(suggest(google, [result({ spend: 30, clicks: 10, impressions: 2000, visits: 9 })])[0]!.why).toMatch(/few people click \(0\.50% of views\)/);
    expect(suggest(google, [result({ spend: 60, visits: 4, clicks: 40 })])[0]).toMatchObject({ verdict: "stop" });
    expect(suggest(google, [result({ spend: 60, visits: 4, clicks: 40 })])[0]!.why).toMatch(/Only 10% of clicks arrived/);
  });

  it("writes the weekly read-out", () => {
    const week = { window: { from: "", to: "" }, source: "ga4" as const, ads: [result({ label: "Ad 1", cpa: 4 })], unassignedSpend: 7, total: { spend: 70, visits: 300, results: 10, clicks: null, impressions: null, cpa: 7 } };
    const before = { ...week, ads: [], unassignedSpend: 0, total: { ...week.total, spend: 70, results: 7, cpa: 10 } };
    const lines = readOut(week, before, [{ adId: "a", label: "Ad 1", verdict: "scale", title: "Scale Ad 1", why: "" }]);
    expect(lines[0]).toBe("Last 7 days: 70.00 spent, 300 visits, 10 results at 7.00 each.");
    expect(lines[1]).toBe("Cost per result fell 30% from 10.00.");
    expect(lines.join(" ")).toContain("Best ad: Ad 1");
    expect(lines.join(" ")).toContain("To do: scale Ad 1.");
    expect(lines.join(" ")).toContain("entered for the whole campaign");
    expect(readOut({ ...week, total: { ...week.total, spend: 0, visits: 0 } }, before, [])[0]).toMatch(/No spend or visits/);
  });
});

describe("suggestions elsewhere", () => {
  it("puts the most pressing one on Today, and adds to Today and the Roadmap on request", async () => {
    const top = await topAdSuggestions(productId, 2);
    expect(top.map((s) => s.verdict)).toEqual(["stop", "scale"]);
    const candidates = await buildCandidates(productId);
    expect(candidates.find((c) => c.kind === "ads")).toMatchObject({ title: "Stop Fieldwork: ad 2 in Reddit test", href: `/ads/${campaignId}/results` });

    const c = await campaign();
    const { suggestions } = await campaignReview(c, today);
    await suggestionToToday(c, suggestions[0]!);
    await expect(suggestionToToday(c, suggestions[0]!)).rejects.toThrow(/Already on Today/);
    const [move] = await getDb().select().from(dailyMoves).where(eq(dailyMoves.refId, `${adIds[0]}:scale`));
    expect(move).toMatchObject({ kind: "ads", source: "owner" });
    await suggestionToRoadmap(c, suggestions[1]!);
    await expect(suggestionToRoadmap(c, suggestions[1]!)).rejects.toThrow(/Already on the Roadmap/);
    const [item] = await getDb().select().from(roadmapItems).where(eq(roadmapItems.productId, productId));
    expect(item).toMatchObject({ stage: "revenue", playbook: "paid-conversion", priority: 1, nextStep: "Pause the ad in the ad manager" });
  });
});
