import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { adCampaigns, ads, communities, competitors, jobs, keywords, products } from "@startica/db/schema";
import { runStructured } from "../ai/client.ts";
import { adUrl, checkAdCopy, utmSlug } from "./checks.ts";
import { copyFromForm, createCampaign, loadCampaign, parseKeyword, rewriteAd, targetingFromForm } from "./campaigns.ts";
import { campaignBrief, googleAdsEditorCsv, metaBulkCsv, utf16le } from "./exports.ts";
import { adPlanSchema, toAdCopy } from "./prompts.ts";

// The jobs call the AI through runStructured; tests answer with fixed plans instead.
const structured = vi.hoisted(() => ({ next: null as unknown }));
vi.mock("../ai/client.ts", () => ({ runStructured: vi.fn(async () => structured.next) }));
const { adResearch, runAdCopy, runAdPlan } = await import("./jobs.ts");

const headlines = ["Field notes that sync", "Notes for field teams", "Works offline in the field", "Fieldnote for crews", "Share notes with your team"];
const googlePlan = {
  summary: "Search ads for teams looking for a field notes app.",
  bid_strategy: "Maximize clicks with a $3 max CPC until conversions are tracked",
  test_budget: 300,
  test_days: 21,
  success_metric: "Cost per trial signup under $30; stop at $60",
  groups: [
    {
      name: "Field notes app",
      angle: "Teams searching for a notes app that works in the field.",
      targeting: {
        keywords: [
          { text: "field notes app", match: "phrase" },
          { text: "offline notes for teams", match: "exact" },
        ],
        negative_keywords: ["free", "jobs"],
        locations: ["United States"],
      },
      ads: [{ headlines, descriptions: ["Capture notes offline and sync when you're back.", "Photos, checklists and notes in one place."], path1: "notes", path2: "field-teams" }],
    },
  ],
};

let workspaceId = "";
let productId = "";

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-ads-"));
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote", url: "https://fieldnote.example" }).returning())[0]!.id;
  await getDb().insert(competitors).values({ workspaceId, productId, name: "Notably" });
});
afterAll(() => closeDatabase());

describe("checkAdCopy", () => {
  it("passes good Google copy", () => {
    expect(checkAdCopy("google", { headlines, descriptions: ["One.", "Two."] })).toEqual([]);
  });

  it("flags limits, counts, duplicates and Google's punctuation rules", () => {
    const flags = checkAdCopy("google", { headlines: ["A headline that is far too long to fit", "Try it!", "try it!"], descriptions: ["Only one"], path1: "a-path-longer-than-15" });
    const messages = flags.map((f) => `${f.field}${f.index ?? ""}: ${f.message}`);
    expect(messages).toContain("headlines0: 38 characters: the limit is 30.");
    expect(messages).toContain("headlines1: Google doesn't allow exclamation marks in headlines.");
    expect(messages).toContain("headlines: Two headlines are the same; Google needs each to be different.");
    expect(messages).toContain("descriptions: At least 2 descriptions needed (1 now).");
    expect(messages).toContain("path1: 21 characters: the limit is 15.");
  });

  it("warns about claims, personal attributes and competitor names", () => {
    const flags = checkAdCopy("meta", { primaryText: "Are you struggling with messy notes? The best app, guaranteed. Better than Notably.", headline: "Fieldnote", callToAction: "SIGN_UP" }, ["Notably"]);
    expect(flags.every((f) => f.level === "warning")).toBe(true);
    const text = flags.map((f) => f.message).join("\n");
    expect(text).toMatch(/Superlatives/);
    expect(text).toMatch(/Guarantees/);
    expect(text).toMatch(/personal attributes/);
    expect(text).toMatch(/Mentions Notably/);
  });

  it("warns, but doesn't block, past the recommended length", () => {
    const flags = checkAdCopy("reddit", { title: "x".repeat(120) });
    expect(flags).toEqual([{ field: "title", index: undefined, level: "warning", message: "120 characters: over about 100, it's cut off in some placements." }]);
  });
});

describe("links and forms", () => {
  it("tags ad links for analytics", () => {
    const url = new URL(adUrl("https://fieldnote.example/signup?ref=x", "meta", "spring-test", "ad-1"));
    expect(Object.fromEntries(url.searchParams)).toEqual({ ref: "x", utm_source: "meta", utm_medium: "paid", utm_campaign: "spring-test", utm_content: "ad-1" });
    expect(utmSlug("Search: Field notes app!")).toBe("search-field-notes-app");
  });

  it("reads keywords in Editor notation and form fields per platform", () => {
    expect(["[exact one]", '"a phrase"', "broad words"].map(parseKeyword)).toEqual([
      { text: "exact one", match: "exact" },
      { text: "a phrase", match: "phrase" },
      { text: "broad words", match: "broad" },
    ]);
    expect(targetingFromForm("reddit", { communities: "r/fieldwork, surveying", interests: "", locations: "US" })).toEqual({ locations: ["US"], communities: ["fieldwork", "surveying"], interests: [] });
    expect(copyFromForm("google", { headlines: "One\n\nTwo\n", descriptions: "D", path1: " ", path2: "x" })).toEqual({ headlines: ["One", "Two"], descriptions: ["D"], path2: "x" });
  });

  it("maps model output to stored copy, dropping empty fields", () => {
    expect(toAdCopy("reddit", { title: " A post ", body: "", call_to_action: "Sign Up" })).toEqual({ title: "A post", callToAction: "Sign Up" });
    expect(adPlanSchema("google").safeParse(googlePlan).success).toBe(true);
  });
});

describe("research", () => {
  it("passes Intel's keywords and the watched communities to the plan", async () => {
    const [p] = await getDb().insert(products).values({ workspaceId, name: "Research Co" }).returning();
    expect(await adResearch(p!.id, "google")).toBe("");
    await getDb().insert(keywords).values([
      { workspaceId, productId: p!.id, keyword: "field notes app", intent: "solution" },
      { workspaceId, productId: p!.id, keyword: "notably alternative", intent: "competitor" },
    ]);
    await getDb().insert(communities).values([
      { workspaceId, productId: p!.id, channel: "reddit", name: "r/fieldwork", why: "Crews swap tools here", status: "watching" },
      { workspaceId, productId: p!.id, channel: "discourse", name: "Surveyors forum", status: "watching" },
      { workspaceId, productId: p!.id, channel: "reddit", name: "geology", status: "suggested" },
    ]);
    const reddit = await adResearch(p!.id, "reddit");
    expect(reddit).toContain("- field notes app (looking for a solution)");
    expect(reddit).toContain("- notably alternative (competitor)");
    expect(reddit).toContain("Subreddits the founder watches:\n- fieldwork: Crews swap tools here");
    expect(reddit).not.toContain("Surveyors forum");
    expect(reddit).not.toContain("geology"); // only watched ones
    expect(await adResearch(p!.id, "meta")).toContain("- Surveyors forum (discourse)");

    const id = await createCampaign(workspaceId, p!.id, { platform: "reddit", name: "Reddit test", goal: "Signups", landing_url: "https://fieldnote.example/", monthly_budget: 100, notes: "" });
    structured.next = { ...googlePlan, groups: [] };
    await runAdPlan({ workspaceId }, { workspaceId, campaignId: id });
    const call = vi.mocked(runStructured).mock.calls.at(-1)![1] as { promptVersion: string; messages: { content: string }[] };
    expect(call.promptVersion).toBe("ad-plan@2");
    expect(call.messages[0]!.content).toContain("<research>");
    expect(call.messages[0]!.content).toContain("- fieldwork: Crews swap tools here");
    await getDb().delete(jobs); // the next test reads the queue
  });
});

describe("campaigns", () => {
  it("plans a campaign, rewrites an ad, and exports the hand-off files", async () => {
    const id = await createCampaign(workspaceId, productId, {
      platform: "google",
      name: "Search: field notes app",
      goal: "Trial signups",
      landing_url: "https://fieldnote.example/signup",
      monthly_budget: 300,
      notes: "",
    });
    const [job] = await getDb().select().from(jobs).where(eq(jobs.queue, "ad_plan"));
    expect(job!.payload).toMatchObject({ campaignId: id, workspaceId });

    structured.next = googlePlan;
    expect(await runAdPlan({ workspaceId }, { workspaceId, campaignId: id })).toEqual({ groups: 1, ads: 1 });
    const detail = (await loadCampaign(workspaceId, id))!;
    expect(detail.campaign).toMatchObject({ status: "draft", testBudget: 300, testDays: 21, utmCampaign: "search-field-notes-app" });
    expect(detail.groups[0]!.targeting.keywords).toHaveLength(2);
    expect(detail.errors).toBe(0);

    const adId = detail.groups[0]!.ads[0]!.id;
    await rewriteAd(workspaceId, adId, "Lead with offline");
    expect((await getDb().select().from(ads).where(eq(ads.id, adId)))[0]!.status).toBe("rewriting");
    structured.next = { ...googlePlan.groups[0]!.ads[0], headlines: [...headlines, "Offline first notes"] };
    await runAdCopy({ workspaceId }, { workspaceId, adId, guidance: "Lead with offline" });
    const [rewritten] = await getDb().select().from(ads).where(eq(ads.id, adId));
    expect(rewritten).toMatchObject({ status: "ready", source: "ai" });
    expect(rewritten!.copy.headlines).toHaveLength(6);

    const fresh = (await loadCampaign(workspaceId, id))!;
    const tsv = googleAdsEditorCsv(fresh).split("\r\n").map((l) => l.split("\t"));
    const header = tsv[0]!;
    const col = (row: string[], name: string) => row[header.indexOf(name)];
    expect(col(tsv[1]!, "Campaign Status")).toBe("Paused");
    expect(col(tsv[1]!, "Budget")).toBe("14.29");
    expect(tsv.some((r) => col(r, "Keyword") === "field notes app" && col(r, "Criterion Type") === "Phrase")).toBe(true);
    expect(tsv.some((r) => col(r, "Keyword") === "free" && col(r, "Criterion Type") === "Negative Broad")).toBe(true);
    const adRow = tsv.find((r) => col(r, "Ad type") === "Responsive search ad")!;
    expect(col(adRow, "Headline 6")).toBe("Offline first notes");
    expect(col(adRow, "Status")).toBe("Paused");
    expect(col(adRow, "Final URL")).toContain(`utm_content=${adId}`);
    expect([...utf16le("Hi").slice(0, 4)]).toEqual([0xff, 0xfe, 0x48, 0x00]);

    expect(campaignBrief(fresh)).toContain('Keywords: "field notes app", [offline notes for teams]');
  });

  it("exports Meta ads paused, with quoted cells", async () => {
    const id = await createCampaign(workspaceId, productId, { platform: "meta", name: "Meta test", goal: "Leads", landing_url: "https://fieldnote.example", monthly_budget: 200, notes: "" });
    structured.next = {
      summary: "s",
      bid_strategy: "Highest volume",
      test_budget: 140,
      test_days: 14,
      success_metric: "m",
      groups: [{ name: "Crews", angle: "a", targeting: { audience: "Field crews", interests: ["Surveying"], placements: [], locations: [] }, ads: [{ primary_text: 'Notes, photos and "checklists"', headline: "Fieldnote", description: "", call_to_action: "SIGN_UP" }] }],
    };
    await runAdPlan({ workspaceId }, { workspaceId, campaignId: id });
    const csv = metaBulkCsv((await loadCampaign(workspaceId, id))!);
    expect(csv).toContain('"Notes, photos and ""checklists"""');
    expect(csv).toContain("Outcome Leads");
    expect(csv.split("\r\n")[1]).toMatch(/^Meta test,PAUSED,/);
  });

  it("marks the campaign failed when planning fails", async () => {
    const id = await createCampaign(workspaceId, productId, { platform: "reddit", name: "R", goal: "g", landing_url: "https://fieldnote.example", monthly_budget: 100, notes: "" });
    structured.next = Promise.reject(new Error("Monthly AI budget reached"));
    await expect(runAdPlan({ workspaceId }, { workspaceId, campaignId: id })).rejects.toThrow(/budget/);
    const [row] = await getDb().select().from(adCampaigns).where(eq(adCampaigns.id, id));
    expect(row).toMatchObject({ status: "failed", error: "Monthly AI budget reached" });
  });
});

describe("review fixes", () => {
  it("flags #1, per-word capitals and repeated exclamation marks once", () => {
    const warn = (copy: Parameters<typeof checkAdCopy>[1]) => checkAdCopy("google", copy).map((f) => f.message);
    expect(warn({ headlines: [...headlines.slice(0, 2), "The #1 field notebook"], descriptions: ["One.", "Two."] }).join()).toMatch(/Superlatives/);
    expect(warn({ headlines, descriptions: ["SEO and FREE notes.", "Two."] }).join()).toMatch(/capitals/);
    expect(warn({ headlines, descriptions: ["SEO and GDPR ready.", "Two."] })).toEqual([]);
    const bangs = checkAdCopy("google", { headlines: [...headlines.slice(0, 2), "Try it!!"], descriptions: ["Wow! Wow!", "Two."] });
    expect(bangs.filter((f) => f.field === "headlines").map((f) => f.level)).toEqual(["error"]);
    expect(bangs.filter((f) => f.field === "descriptions").map((f) => f.level)).toEqual(["warning"]);
    expect(utmSlug("Café Été")).toBe("cafe-ete");
  });
});
