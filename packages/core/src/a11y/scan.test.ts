import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, ne } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { a11yIssueGroups, a11yOccurrences, products, seoFindings, siteScans, sitePages, sites } from "@startica/db/schema";
import { playwrightScanner } from "./playwright-backend.ts";
import { runPageCheck, runSiteScan } from "./scan.ts";
import { readScreenshot } from "./screenshots.ts";
import { getScanner, setScanner, type ScannerBackend } from "./scanner.ts";
import { createSite, siteInput, startPageCheck, startSiteScan } from "./sites.ts";
// @ts-expect-error plain JS helper shared with the smoke tests
import { startStandin } from "./standin/server.mjs";

/**
 * End to end: a real Chromium scans the stand-in site (known failures per page) and
 * Startica stores exactly those issues. Skipped when Playwright's Chromium isn't installed.
 */

let standin: { url: string; close: () => Promise<void> };
let scanner: ScannerBackend | null = null;
let workspaceId = "";
let site: { id: string; workspaceId: string };
const fixed = new Set<string>();

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-a11y-"));
  process.env.STARTICA_DATA_DIR = dir; // screenshots are written under the data folder
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  // A "fixed" page gets its missing lang attribute.
  standin = await startStandin(0, { transform: (path: string, html: string) => (fixed.has(path) ? html.replace("<html>", '<html lang="en">') : html) });
  scanner = await playwrightScanner(58300);
  setScanner(scanner);
  const [p] = await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning();
  const id = await createSite(workspaceId, p!.id, siteInput.parse({ name: "Stand-in", start_url: standin.url, respect_robots: "on" }));
  site = { id, workspaceId };
}, 60_000);
afterAll(async () => {
  await scanner?.close?.();
  await standin?.close();
  closeDatabase();
});

const openGroups = async () =>
  (await getDb().select().from(a11yIssueGroups).where(eq(a11yIssueGroups.siteId, site.id)).orderBy(asc(a11yIssueGroups.ruleId)))
    .filter((g) => g.status === "open" && g.kind === "violation")
    .map((g) => `${g.ruleId}×${g.pagesCount}`)
    .sort();

describe("site scan (real browser)", () => {
  it("crawls the stand-in site and finds exactly its known failures", async (t) => {
    if (!scanner) return t.skip();
    const scanId = await startSiteScan(site);
    await runSiteScan({ workspaceId }, { workspaceId, scanId });

    const pages = await getDb().select({ id: sitePages.id, url: sitePages.url, state: sitePages.state, score: sitePages.score }).from(sitePages).where(eq(sitePages.siteId, site.id));
    expect(Object.fromEntries(pages.map((p) => [new URL(p.url).pathname, p.state]))).toEqual({
      "/": "done",
      "/pricing.html": "done",
      "/signup.html": "done",
      "/about.html": "done",
      "/sitemap-only.html": "done", // found through the sitemap only
      "/clean.html": "done",
      "/private/notes.html": "skipped", // robots.txt
      "/missing.html": "failed", // 404
    });
    expect(pages.find((p) => p.url.endsWith("/clean.html"))!.score).toBe(100);

    // The shared header's logo (no alt, so its link has no name) is one issue on five pages.
    expect(await openGroups()).toEqual(
      ["button-name×1", "color-contrast×1", "html-has-lang×1", "image-alt×5", "label×1", "link-name×1", "link-name×5"].sort(),
    );
    const [scan] = await getDb().select().from(siteScans).where(eq(siteScans.id, scanId));
    expect(scan).toMatchObject({ status: "done", pagesDone: 6, pagesFailed: 1, newIssues: 7, fixedIssues: 0, axeVersion: "4.14.0" });

    // Highlights (A2): pages with issues get a screenshot file and their elements a position; clean pages get none.
    const shots = await getDb().select({ url: sitePages.url, screenshot: sitePages.screenshot, size: sitePages.screenshotSize }).from(sitePages).where(eq(sitePages.siteId, site.id));
    const shotOf = (path: string) => shots.find((p) => new URL(p.url).pathname === path)!;
    expect(shotOf("/clean.html").screenshot).toBeNull();
    expect(shotOf("/signup.html").screenshot).toMatch(/\.jpg$/);
    expect(shotOf("/signup.html").size).toMatchObject({ width: 1280 });
    expect(readScreenshot(site.id, shotOf("/signup.html").screenshot!)?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // a JPEG
    const boxes = await getDb().select({ box: a11yOccurrences.box }).from(a11yOccurrences);
    expect(boxes.filter((b) => b.box && b.box.width > 0).length).toBeGreaterThan(0);
    expect(scan!.score).toBeGreaterThan(0);

    // The same crawl checked the pages for search and AI too: exactly the planted SEO problems.
    const seo = await getDb().select().from(seoFindings).where(eq(seoFindings.siteId, site.id));
    const page = (id: string | null) => (id ? new URL(pages.find((p) => p.id === id)?.url ?? "x://").pathname : "site");
    expect(seo.map((f) => `${f.rule}@${page(f.pageId)}`).sort()).toEqual(
      [
        "ai-search-blocked@site", // OAI-SearchBot
        "ai-training-blocked@site", // GPTBot (info)
        "broken-internal-link@/missing.html",
        "description-missing@/about.html",
        "description-missing@/pricing.html",
        "description-missing@/sitemap-only.html",
        "h1-multiple@/about.html",
        "jsonld-invalid@/pricing.html",
        "llms-missing@site",
        "noindex-in-sitemap@/sitemap-only.html",
        "orphan-page@/sitemap-only.html",
        "title-duplicate@/about.html",
        "title-duplicate@/pricing.html",
      ].sort(),
    );
    expect((await getDb().select().from(sites).where(eq(sites.id, site.id)))[0]!.seoScore).toBeGreaterThan(0);
  }, 120_000);

  it("rechecking a fixed page marks its issue fixed and raises the score", async (t) => {
    if (!scanner) return t.skip();
    const [before] = await getDb().select({ score: siteScans.score }).from(siteScans).where(eq(siteScans.siteId, site.id));
    fixed.add("/about.html");
    const url = `${standin.url}/about.html`;
    const scanId = await startPageCheck(site, [url]);
    await runPageCheck({ workspaceId }, { workspaceId, scanId, urls: [url] });

    expect(await openGroups()).not.toContain("html-has-lang×1");
    const [lang] = await getDb().select().from(a11yIssueGroups).where(eq(a11yIssueGroups.ruleId, "html-has-lang"));
    expect(lang).toMatchObject({ status: "fixed", fixedScanId: scanId, pagesCount: 0 });
    const [scan] = await getDb().select().from(siteScans).where(eq(siteScans.id, scanId));
    expect(scan).toMatchObject({ status: "done", scope: "page", pagesDone: 1, newIssues: 0, fixedIssues: 1 });
    expect(scan!.score!).toBeGreaterThan(before!.score!);
  }, 60_000);

  it("pages stored with a query string are folded into their page when a scan starts", async (t) => {
    if (!scanner) return t.skip();
    const scanId = await startSiteScan(site);
    await getDb().insert(sitePages).values([
      { workspaceId, siteId: site.id, url: `${standin.url}/pricing.html?plan=pro`, scanId, state: "queued" },
      { workspaceId, siteId: site.id, url: `${standin.url}/about.html?utm_source=x`, state: "done" },
    ]);
    await runSiteScan({ workspaceId }, { workspaceId, scanId });
    const urls = (await getDb().select({ url: sitePages.url }).from(sitePages).where(eq(sitePages.siteId, site.id))).map((p) => p.url);
    expect(urls.filter((u) => u.includes("?"))).toEqual([]);
    expect(urls.filter((u) => u.endsWith("/pricing.html"))).toHaveLength(1);
  }, 120_000);

  it("a scan stopped by the user ends as stopped and keeps the pages it checked", async (t) => {
    if (!scanner) return t.skip();
    const scanId = await startSiteScan(site);
    const controller = new AbortController();
    const real = getScanner()!;
    let opened = 0;
    // Stop as soon as the first pages are being checked.
    setScanner({ name: "playwright", scan: (request) => (++opened === 1 && controller.abort(new Error("Stopped by you")), real.scan(request)) });
    try {
      await expect(runSiteScan({ workspaceId, signal: controller.signal }, { workspaceId, scanId })).rejects.toThrow(/Stopped by you/);
    } finally {
      setScanner(real);
    }
    const [scan] = await getDb().select().from(siteScans).where(eq(siteScans.id, scanId));
    expect(scan!.status).toBe("cancelled");
    expect(opened).toBeLessThanOrEqual(2); // the batch in flight finishes, nothing after it starts
    const checked = await getDb().select().from(sitePages).where(and(eq(sitePages.scanId, scanId), eq(sitePages.state, "done")));
    expect(checked.length).toBe(opened);
  }, 120_000);

  it("a scan interrupted by quitting resumes where it stopped", async (t) => {
    if (!scanner) return t.skip();
    // A full scan whose queue is seeded and half done, as if the app quit mid-scan.
    const scanId = await startSiteScan(site);
    // Every known page except the one robots.txt blocks (it's skipped without being opened).
    const known = (await getDb().select().from(sitePages).where(and(eq(sitePages.siteId, site.id), ne(sitePages.state, "skipped")))).filter((p) => !p.url.includes("/private/"));
    for (const [i, page] of known.entries()) {
      await getDb().update(sitePages).set({ scanId, state: i < 3 ? "done" : "queued" }).where(eq(sitePages.id, page.id));
    }
    const opened: string[] = [];
    const real = getScanner()!;
    setScanner({ name: "playwright", scan: (request) => (opened.push(request.url), real.scan(request)) });
    try {
      await runSiteScan({ workspaceId }, { workspaceId, scanId });
    } finally {
      setScanner(real);
    }
    // Only the pages still queued were opened (plus none twice), and the scan finished.
    expect(opened.length).toBe(known.length - 3);
    expect(new Set(opened).size).toBe(opened.length);
    const [scan] = await getDb().select().from(siteScans).where(eq(siteScans.id, scanId));
    expect(scan!.status).toBe("done");
  }, 120_000);
});
