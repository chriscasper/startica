import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { contentPieces, dailyMoves, jobs, roadmapItems, seoOpportunities } from "@startica/db/schema";
import { seedDemo } from "../demo/seed.ts";
import { collectOpportunities } from "./collect.ts";

// Drafts call the AI; tests answer with fixed drafts.
const ai = vi.hoisted(() => ({ next: null as unknown }));
vi.mock("../ai/client.ts", () => ({
  runStructured: vi.fn(async () => ai.next),
  taskModel: async () => ({ model: "claude-sonnet-5-5", effort: "medium", maxTokens: 4000 }),
  hasAiKey: async () => true,
}));
const { faqJsonLd, jsonldProblems, metaProblems, runOpportunityDraft } = await import("./drafts.ts");
const { addToRoadmap, addToToday, requestDraft, sendBrief, setOpportunityStatus } = await import("./actions.ts");

let workspaceId = "";
let productId = "";

beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-opps-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  ({ workspaceId, productId } = await seedDemo());
});
afterAll(() => closeDatabase());

describe("collecting", () => {
  it("ranks opportunities from Search, Site health and AI visibility", async () => {
    const opps = await collectOpportunities(productId);
    const areas = new Set(opps.map((o) => o.area));
    expect(areas).toEqual(new Set(["search", "site", "ai"]));
    expect(opps.map((o) => o.score)).toEqual([...opps.map((o) => o.score)].sort((a, b) => b - a));
    expect(new Set(opps.map((o) => o.key)).size).toBe(opps.length);

    // Bigger estimated gains rank higher within an area.
    const searchImpacts = opps.filter((o) => o.key.startsWith("query:")).map((o) => Number(/~(\d+)/.exec(o.impact)?.[1]));
    expect(searchImpacts).toEqual([...searchImpacts].sort((a, b) => b - a));
    const striking = opps.find((o) => o.key === "query:field notes app");
    expect(striking).toMatchObject({ area: "search", brief: { topic: "field notes app" } });
    expect(striking!.impact).toMatch(/more clicks a month/);
    // Brand queries are never "striking distance" work.
    expect(opps.some((o) => o.key === "query:fieldnote")).toBe(false);

    const meta = opps.find((o) => o.key.endsWith(":description-missing"));
    expect(meta?.draft?.kind).toBe("meta");
    expect(opps.find((o) => o.key.endsWith(":llms-missing"))?.draft?.kind).toBe("llms_txt");

    const gap = opps.find((o) => o.area === "ai" && o.key.startsWith("ai:"));
    expect(gap?.draft?.kind).toBe("faq");
    expect(gap!.why).toMatch(/named .* but not Fieldnote/);
  });
});

describe("checking drafts", () => {
  it("checks titles and descriptions against the length guidance", () => {
    expect(metaProblems([{ url: "/a", title: "Offline field notes for researchers", description: "x".repeat(140) }])).toEqual([]);
    expect(metaProblems([{ url: "/a", title: "x".repeat(70), description: "short" }, { url: "/b", title: "x".repeat(70), description: "y".repeat(170) }])).toEqual([
      "/a: title is 70 characters (over 60)",
      "/a: description is short (5 characters; aim for 120 to 160)",
      "/b: title is 70 characters (over 60)",
      "/b: description is 170 characters (over 160)",
      "Two pages got the same title",
    ]);
  });

  it("validates JSON-LD with Site health's own checks", () => {
    expect(jsonldProblems('{"@context":"https://schema.org","@type":"Organization","name":"Fieldnote","url":"https://fieldnote.example"}').problems).toEqual([]);
    expect(jsonldProblems('{"@type":"SoftwareApplication","name":"Fieldnote"}').problems).toEqual(['@context should be "https://schema.org"', "SoftwareApplication is missing offers"]);
    expect(jsonldProblems("{not json").problems).toEqual(["It isn't valid JSON"]);
    expect(jsonldProblems(faqJsonLd("Q?", "A.")).problems).toEqual([]);
  });
});

describe("acting on an opportunity", () => {
  it("drafts a fix, keeps it, and records what failed the checks", async () => {
    const opp = (await collectOpportunities(productId)).find((o) => o.key.endsWith(":description-missing"))!;
    const scope = { workspaceId, productId };
    await requestDraft(scope, opp.key);
    expect((await getDb().select().from(jobs).where(eq(jobs.queue, "opportunity_draft")))[0]?.payload).toMatchObject({ key: opp.key });
    const urls = opp.draft!.pages!;
    ai.next = { pages: urls.map((url) => ({ url, title: "Offline field notes for researchers", description: "Too short" })) };
    await runOpportunityDraft({ workspaceId }, { workspaceId, productId, key: opp.key });
    const [state] = await getDb().select().from(seoOpportunities).where(and(eq(seoOpportunities.productId, productId), eq(seoOpportunities.key, opp.key)));
    expect(state).toMatchObject({ draftStatus: "ready", draftError: null });
    expect(state!.draft!.text).toContain('<meta name="description" content="Too short">');
    expect(state!.draft!.problems.some((p) => p.includes("description is short"))).toBe(true);
  });

  it("fails a draft clearly when the opportunity is gone", async () => {
    const scope = { workspaceId, productId };
    await setOpportunityStatus(scope, "query:no such query", "open");
    await expect(runOpportunityDraft({ workspaceId }, { workspaceId, productId, key: "query:no such query" })).rejects.toThrow(/gone/);
    const [state] = await getDb().select().from(seoOpportunities).where(eq(seoOpportunities.key, "query:no such query"));
    expect(state).toMatchObject({ draftStatus: "failed" });
  });

  it("goes to the Roadmap, Today and Content Studio once each, and can be dismissed", async () => {
    const scope = { workspaceId, productId };
    const key = "query:field notes app";
    await addToRoadmap(scope, key);
    await expect(addToRoadmap(scope, key)).rejects.toThrow(/Already on the Roadmap/);
    const [item] = await getDb().select().from(roadmapItems).where(eq(roadmapItems.title, "Move “field notes app” up to page 1"));
    expect(item).toMatchObject({ source: "owner", playbook: "seo-geo", stage: "acquisition" });

    await addToToday(scope, key);
    await expect(addToToday(scope, key)).rejects.toThrow(/Already on Today/);
    expect((await getDb().select().from(dailyMoves).where(eq(dailyMoves.refId, key)))[0]?.href).toBe(`/seo/opportunities#${encodeURIComponent(key)}`);

    const pieceId = await sendBrief(scope, key);
    expect((await getDb().select().from(contentPieces).where(eq(contentPieces.id, pieceId)))[0]).toMatchObject({ channel: "blog", format: "article", topic: "field notes app" });
    expect((await getDb().select().from(jobs).where(eq(jobs.queue, "content_generate")))[0]?.payload).toMatchObject({ pieceId });

    await setOpportunityStatus(scope, key, "dismissed");
    expect((await collectOpportunities(productId)).find((o) => o.key === key)?.status).toBe("dismissed");
  });
});
