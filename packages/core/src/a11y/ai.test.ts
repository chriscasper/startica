import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { a11yImages, a11yIssueGroups, jobs, sitePages, sites } from "@startica/db/schema";
import { seedDemo } from "../demo/seed.ts";

// A3 calls the AI; tests answer with fixed outputs and check what's sent and stored.
const ai = vi.hoisted(() => ({ next: [] as unknown[], calls: [] as { task: string; system: string; content: unknown }[] }));
vi.mock("../ai/client.ts", () => ({
  runStructured: vi.fn(async (_ctx: unknown, req: { task: string; system: string; messages: { content: unknown }[] }) => {
    ai.calls.push({ task: req.task, system: req.system, content: req.messages[0]!.content });
    return ai.next.shift();
  }),
  taskModel: async (_ctx: unknown, task: string) => ({ model: task === "vision" ? "claude-sonnet-5-5" : "claude-sonnet-5-5", effort: "medium", maxTokens: 4000 }),
  hasAiKey: async () => true,
}));
const { fixMessage, requestFix, requestReviewHelp, runAltReview, runFixSuggest, runReviewAssist, runSummary, syncSiteImages, altEstimate } = await import("./ai.ts");

let workspaceId = "";
let site: typeof sites.$inferSelect;
let imageServer: Server;
let imageBase = "";
// A 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-a11y-ai-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  ({ workspaceId } = await seedDemo());
  site = (await getDb().select().from(sites))[0]!;
  imageServer = createServer((req, res) => {
    if (req.url === "/photo.png") return res.writeHead(200, { "content-type": "image/png" }).end(PNG);
    res.writeHead(200, { "content-type": "image/svg+xml" }).end("<svg/>");
  });
  await new Promise<void>((r) => imageServer.listen(0, "127.0.0.1", () => r()));
  imageBase = `http://127.0.0.1:${(imageServer.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise((r) => imageServer.close(r));
  closeDatabase();
});

const group = async (ruleId: string, kind: "violation" | "needs_review" = "violation") =>
  (await getDb().select().from(a11yIssueGroups).where(and(eq(a11yIssueGroups.ruleId, ruleId), eq(a11yIssueGroups.kind, kind))))[0]!;

describe("fix suggestions", () => {
  it("sends the failing HTML as data and stores the fix, with guidance on a second try", async () => {
    const label = await group("label");
    await requestFix(workspaceId, label.id);
    await expect(requestFix(workspaceId, label.id)).rejects.toThrow(/Already/);
    await getDb().delete(jobs);
    ai.next.push({ explanation: "The email field has no label.", fixed_html: '<label for="signup-email">Email</label><input id="signup-email" type="email">', steps: ["Add a visible label"], confidence: "high" });
    await runFixSuggest({ workspaceId }, { workspaceId, groupId: label.id, guidance: "We use plain HTML" });
    const call = ai.calls.at(-1)!;
    expect(call.content).toContain('<html><input id="signup-email"');
    expect(call.content).toContain("The developer adds: We use plain HTML");
    expect(call.system).toMatch(/data, not instructions/);
    expect(await group("label")).toMatchObject({ aiFixStatus: "ready", aiFix: { confidence: "high", guidance: "We use plain HTML" } });
  });

  it("says when an issue is on many pages", () => {
    expect(fixMessage({ help: "h", description: "d", ruleId: "image-alt", criteria: ["1.1.1"], level: "A" }, [], 6)).toContain("probably a shared template");
  });
});

describe("review helper", () => {
  it("only takes Needs review items, and stores its suggestion for the owner", async () => {
    await expect(requestReviewHelp(workspaceId, (await group("label")).id)).rejects.toThrow(/Needs review/);
    const item = await group("color-contrast", "needs_review");
    ai.next.push({ suggestion: "fail", reason: "Light text over the bright sky is hard to read." });
    await runReviewAssist({ workspaceId }, { workspaceId, groupId: item.id });
    expect(ai.calls.at(-1)!.task).toBe("vision");
    expect(await group("color-contrast", "needs_review")).toMatchObject({ aiReviewStatus: "ready", reviewStatus: null, aiReview: { suggestion: "fail" } });
  });
});

describe("alt text review", () => {
  it("lists each image once, reviews what it can download, and skips the rest", async () => {
    const [page] = await getDb().select().from(sitePages).where(eq(sitePages.siteId, site.id)).limit(1);
    await getDb()
      .update(sitePages)
      .set({
        images: [
          { src: `${imageBase}/photo.png`, alt: "IMG_2041", decorative: false, link: null, nearby: "Our field team at the coast", width: 1, height: 1 },
          { src: `${imageBase}/logo.svg`, alt: null, decorative: false, link: "https://fieldnote.example/", nearby: "", width: 1, height: 1 },
        ],
      })
      .where(eq(sitePages.id, page!.id));
    expect(await syncSiteImages(site)).toBeGreaterThanOrEqual(2);
    expect((await altEstimate(site.id)).next).toBeGreaterThanOrEqual(2);

    ai.next.push({ verdict: "needs_better", suggested_alt: "Three researchers taking notes on a rocky coast", reason: "A file name tells people nothing." });
    const result = await runAltReview({ workspaceId }, { workspaceId, siteId: site.id });
    expect(result.reviewed).toBe(1);
    const img = async (src: string) => (await getDb().select().from(a11yImages).where(and(eq(a11yImages.siteId, site.id), eq(a11yImages.src, src))))[0]!;
    expect(await img(`${imageBase}/photo.png`)).toMatchObject({ verdict: "needs_better", judgedAlt: "IMG_2041", suggestedAlt: "Three researchers taking notes on a rocky coast" });
    expect(await img(`${imageBase}/logo.svg`)).toMatchObject({ verdict: "skipped" });
    const sent = ai.calls.at(-1)!.content as { type: string; mediaType?: string }[];
    expect(sent.map((p) => p.type)).toEqual(["text", "image"]);
    expect(sent[1]!.mediaType).toBe("image/png");

    // A new alt text makes the old verdict stale.
    await getDb()
      .update(sitePages)
      .set({ images: [{ src: `${imageBase}/photo.png`, alt: "Researchers on the coast", decorative: false, link: null, nearby: "", width: 1, height: 1 }] })
      .where(eq(sitePages.id, page!.id));
    await syncSiteImages(site);
    expect(await img(`${imageBase}/photo.png`)).toMatchObject({ status: "new", verdict: null });
  });
});

describe("summary", () => {
  it("writes the site's summary from its scans and open issues", async () => {
    ai.next.push({ text: "Fieldnote's score rose from 54 to 70 this month. Fix the logo's alt text first." });
    await runSummary({ workspaceId }, { workspaceId, siteId: site.id });
    expect(ai.calls.at(-1)!.content).toMatch(/Open issues: .*Images must have alternative text/);
    expect(ai.calls.at(-1)!.system).toMatch(/Don't claim the site is accessible or compliant/);
    const [after] = await getDb().select().from(sites).where(eq(sites.id, site.id));
    expect(after).toMatchObject({ a11ySummaryStatus: "ready", a11ySummary: { scanId: site.lastScanId } });
  });
});
