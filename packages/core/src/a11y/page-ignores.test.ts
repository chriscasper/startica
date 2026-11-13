import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { a11yIssueGroups, a11yOccurrences, a11yPageIgnores, sitePages, sites } from "@startica/db/schema";
import { seedDemo } from "../demo/seed.ts";
import { ignoreOnPage, PAGES_REASON, recountGroups, unignoreOnPage } from "./page-ignores.ts";
import { ignoreGroup, issuesCsv, prioritizedGroups, unignoreGroup } from "./track.ts";
import { siteScore } from "./results.ts";
import { freshSummaryLine } from "./track.ts";
import { buildCandidates } from "../growth/moves.ts";
import { evidence } from "../growth/roadmap.ts";

/** Ignoring an issue on one page, and the traffic-weighted site score (ARCHITECTURE.md section 9.3). */

let workspaceId = "";
let productId = "";
let site: typeof sites.$inferSelect;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-page-ignores-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  ({ workspaceId, productId } = await seedDemo());
  site = (await getDb().select().from(sites))[0]!;
});
afterAll(() => closeDatabase());

const group = async (id: string) => (await getDb().select().from(a11yIssueGroups).where(eq(a11yIssueGroups.id, id)))[0]!;
const pagesOf = async (groupId: string) =>
  (await getDb().selectDistinct({ id: sitePages.id, url: sitePages.url }).from(a11yOccurrences).innerJoin(sitePages, eq(sitePages.id, a11yOccurrences.pageId)).where(eq(a11yOccurrences.groupId, groupId))).sort((a, b) =>
    a.url.localeCompare(b.url),
  );

describe("ignore on one page", () => {
  it("leaves the page out of the issue's counts and priority, and counts it again when undone", async () => {
    const [top] = await prioritizedGroups(site, { status: "open", kind: "issues" });
    const g = top!.group;
    const pages = await pagesOf(g.id);
    expect(pages.length).toBeGreaterThan(1);
    const [first] = pages;

    await ignoreOnPage(workspaceId, g.id, first!.id, { reason: "false_positive", note: "Decorative on the home page" });
    const after = await group(g.id);
    expect(after).toMatchObject({ status: "open", pagesCount: pages.length - 1 });
    const ranked = (await prioritizedGroups(site, { status: "open", kind: "issues" })).find((r) => r.group.id === g.id)!;
    expect(ranked.pages).not.toContain(first!.url);
    expect(await getDb().select().from(a11yPageIgnores)).toMatchObject([{ fingerprint: g.fingerprint, url: first!.url, reason: "false_positive", note: "Decorative on the home page" }]);
    const csv = await issuesCsv(site.id);
    expect(csv).toContain('"Ignored on this page"');
    expect(csv).toContain(`"${first!.url}","yes"`);

    await unignoreOnPage(workspaceId, g.id, first!.id);
    expect(await group(g.id)).toMatchObject({ status: "open", pagesCount: pages.length });
    expect(await getDb().select().from(a11yPageIgnores)).toEqual([]);
  });

  it("shows an issue ignored on every page it's on as ignored, and opens it again when a page counts", async () => {
    const [g] = await getDb().select().from(a11yIssueGroups).where(and(eq(a11yIssueGroups.siteId, site.id), eq(a11yIssueGroups.status, "open"), eq(a11yIssueGroups.pagesCount, 1)));
    const [page] = await pagesOf(g!.id);
    await ignoreOnPage(workspaceId, g!.id, page!.id, { reason: "not_applicable", note: "" });
    expect(await group(g!.id)).toMatchObject({ status: "ignored", ignoreReason: PAGES_REASON, pagesCount: 0, occurrencesCount: 0 });
    expect((await prioritizedGroups(site, { status: "open", kind: "issues" })).some((r) => r.group.id === g!.id)).toBe(false);

    // A scan that no longer finds it there: fixed.
    await getDb().update(a11yOccurrences).set({ ignored: false }).where(eq(a11yOccurrences.groupId, g!.id));
    await recountGroups(site.id, null);
    expect(await group(g!.id)).toMatchObject({ status: "open", ignoreReason: null, pagesCount: 1 });
    await unignoreOnPage(workspaceId, g!.id, page!.id);
  });

  it("keeps a site-wide ignore the owner's, and undoing it respects the pages still ignored", async () => {
    const [g] = await getDb().select().from(a11yIssueGroups).where(and(eq(a11yIssueGroups.siteId, site.id), eq(a11yIssueGroups.status, "open"), eq(a11yIssueGroups.pagesCount, 1)));
    const [page] = await pagesOf(g!.id);
    await ignoreGroup(workspaceId, g!.id, { reason: "wont_fix", note: "" });
    await ignoreOnPage(workspaceId, g!.id, page!.id, { reason: "false_positive", note: "" });
    expect(await group(g!.id)).toMatchObject({ status: "ignored", ignoreReason: "wont_fix" });
    await unignoreGroup(workspaceId, g!.id);
    expect(await group(g!.id)).toMatchObject({ status: "ignored", ignoreReason: PAGES_REASON });
    await unignoreOnPage(workspaceId, g!.id, page!.id);
    expect(await group(g!.id)).toMatchObject({ status: "open" });
  });
});

describe("site score", () => {
  it("averages the pages, weighted by their visits when GA4 is connected", () => {
    expect(siteScore([100, 50])).toBe(75);
    expect(siteScore([100, 50], [1, 1])).toBe(75);
    // A page with 2 visits (weight 3) counts three times as much as one without (weight 1).
    expect(siteScore([100, 0], [3, 1])).toBe(75);
    expect(siteScore([])).toBeNull();
  });
});

describe("the AI summary elsewhere", () => {
  it("takes the first sentence of a summary of the latest scan, and nothing from an older one", () => {
    const summary = { text: "Fieldnote scores 78. Fix the logo's alt text first.", scanId: "s2", model: "m", createdAt: "" };
    expect(freshSummaryLine({ a11ySummary: summary, lastScanId: "s2" })).toBe("Fieldnote scores 78.");
    expect(freshSummaryLine({ a11ySummary: summary, lastScanId: "s3" })).toBeNull();
    expect(freshSummaryLine({ a11ySummary: null, lastScanId: "s3" })).toBeNull();
  });

  it("goes into Today's accessibility move and the re-plan's evidence", async () => {
    await getDb().update(sites).set({ a11ySummary: { text: "The score held at 78 this week. Next, the logo.", scanId: site.lastScanId, model: "m", createdAt: new Date().toISOString() } }).where(eq(sites.id, site.id));
    const move = (await buildCandidates(productId)).find((m) => m.href?.startsWith("/accessibility/issues/"));
    expect(move?.why).toContain("AI summary: The score held at 78 this week.");
    expect(await evidence(productId)).toMatch(/Accessibility \(automated checks[^\n]*\n- .*accessibility score \d+\/100\. AI summary: The score held at 78 this week\./);
  });
});
