import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, transaction } from "@startica/db/client";
import { seoFindings, sitePages, siteScans, sites } from "@startica/db/schema";
import { SCAN_USER_AGENT } from "../a11y/discovery.ts";
import type { ScanResponse } from "../a11y/scanner.ts";
import { normalizeUrl } from "../a11y/urls.ts";
import { duplicateGroups, llmsTxtValid, pageFindings, pageSeo, type SeoFindingDraft } from "./checks.ts";
import { AI_CRAWLERS } from "./crawlers.ts";
import { parseRobots, robotsAllows } from "./robots.ts";
import { SEO_RULES, SEVERITY_WEIGHT, type SeoRuleId } from "./rules.ts";

/**
 * SEO & GEO site health on the shared crawl (ARCHITECTURE.md section 10.2): page checks when a
 * page is stored, site checks (duplicates, broken links, orphans, robots.txt for AI
 * crawlers, llms.txt) and the scores when the scan finishes.
 */

type Site = typeof sites.$inferSelect;

const severityOf = (rule: SeoRuleId) => SEO_RULES[rule].severity;

function rows(site: Site, pageId: string | null, drafts: SeoFindingDraft[]) {
  return drafts.map((d) => ({ workspaceId: site.workspaceId, siteId: site.id, pageId, rule: d.rule, severity: severityOf(d.rule), groupKey: d.groupKey, detail: d.detail }));
}

/** Page score: 100 minus 15 per high, 7 per medium and 2 per low finding (info doesn't count), at least 0. */
export function seoPageScore(rules: SeoRuleId[]): number {
  const penalty = rules.reduce((sum, r) => {
    const s = severityOf(r);
    return sum + (s === "info" ? 0 : SEVERITY_WEIGHT[s]);
  }, 0);
  return Math.max(0, 100 - penalty);
}

/** Stores a checked page's search facts and page-level findings (inside the page's own transaction). */
export async function storePageSeo(
  db: Parameters<Parameters<typeof transaction>[0]>[0],
  site: Site,
  page: { id: string; url: string; inSitemap: boolean },
  response: ScanResponse,
): Promise<void> {
  await db.delete(seoFindings).where(and(eq(seoFindings.pageId, page.id), eq(seoFindings.siteId, site.id)));
  const seo = pageSeo(response.result.seo, response.xRobotsTag ?? null);
  const links = [...new Set(response.result.links.map((l) => normalizeUrl(l)).filter((u): u is string => !!u))].slice(0, 300);
  if (!seo) {
    await db.update(sitePages).set({ seo: null, seoScore: null, links }).where(eq(sitePages.id, page.id));
    return;
  }
  const drafts = pageFindings({ url: page.url, title: response.result.title, inSitemap: page.inSitemap }, seo, response.result.seo?.jsonLd ?? []);
  if (drafts.length) await db.insert(seoFindings).values(rows(site, page.id, drafts));
  await db.update(sitePages).set({ seo, links, seoScore: seoPageScore(drafts.map((d) => d.rule)) }).where(eq(sitePages.id, page.id));
}

// Reserved names that never resolve (the demo's fieldnote.example): no request is made for them.
const RESERVED = /\.(example|test|invalid)$/i;

async function fetchText(url: string): Promise<{ status: number; text: string; html: boolean } | null> {
  if (RESERVED.test(new URL(url).hostname)) return null;
  try {
    const res = await fetch(url, { headers: { "user-agent": SCAN_USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    const text = res.ok ? await res.text() : "";
    // A web page where a text file should be: many sites answer every unknown path with their app's HTML.
    const html = /html/i.test(res.headers.get("content-type") ?? "") || /^\s*<(!doctype|html)/i.test(text);
    return { status: res.status, text, html };
  } catch {
    return null;
  }
}

/** A text file the site really serves (not its HTML page for an unknown address). */
const isTextFile = (r: { status: number; html: boolean } | null) => Boolean(r && r.status === 200 && !r.html);

/**
 * The site's own files and its answer to a missing page: llms.txt (an HTML page there is the
 * site's "not found" page, so it counts as missing), robots.txt answered with a web page, and
 * an address that can't exist answering 200 (a "soft 404").
 */
export async function siteFiles(startUrl: string): Promise<{ llmsTxt: "present" | "invalid" | "missing"; robotsNotText: boolean; soft404: boolean }> {
  const [llms, robots, missing] = await Promise.all([
    fetchText(new URL("/llms.txt", startUrl).toString()),
    fetchText(new URL("/robots.txt", startUrl).toString()),
    fetchText(new URL(`/startica-missing-page-${Date.now().toString(36)}`, startUrl).toString()),
  ]);
  return {
    llmsTxt: !isTextFile(llms) ? "missing" : llmsTxtValid(llms!.text) ? "present" : "invalid",
    robotsNotText: Boolean(robots && robots.status === 200 && robots.html),
    soft404: Boolean(missing && missing.status === 200),
  };
}

/** Which AI crawlers robots.txt lets read the home page (the AI access table and its findings). */
export async function aiCrawlerAccess(startUrl: string) {
  const robots = await fetchText(new URL("/robots.txt", startUrl).toString());
  const groups = parseRobots(isTextFile(robots) ? robots!.text : "");
  const path = new URL(startUrl).pathname || "/";
  return AI_CRAWLERS.map((c) => ({ ...c, allowed: robotsAllows(groups, c.token, path) }));
}

/** Site-level checks and scores once a scan has finished (page-level findings are already stored). */
export async function finishSeo(site: Site, scanId: string): Promise<void> {
  const db = getDb();
  const pages = await db
    .select({ id: sitePages.id, url: sitePages.url, title: sitePages.title, state: sitePages.state, httpStatus: sitePages.httpStatus, inSitemap: sitePages.inSitemap, links: sitePages.links, seo: sitePages.seo, seoScore: sitePages.seoScore })
    .from(sitePages)
    .where(and(eq(sitePages.siteId, site.id), isNull(sitePages.goneAt)));
  const done = pages.filter((p) => p.state === "done" && p.seo);
  const drafts: { pageId: string | null; draft: SeoFindingDraft }[] = [];
  const add = (pageId: string | null, rule: SeoRuleId, detail: Record<string, unknown> = {}, groupKey: string = rule) => drafts.push({ pageId, draft: { rule, groupKey, detail } });

  // Duplicates: one group per shared text.
  for (const [value, ids] of duplicateGroups(done.map((p) => ({ id: p.id, value: p.title })))) {
    const title = done.find((p) => p.id === ids[0])?.title ?? value; // as written, not the lowercased key
    for (const id of ids) add(id, "title-duplicate", { title, pages: ids.length }, `title-duplicate:${value}`);
  }
  for (const [value, ids] of duplicateGroups(done.map((p) => ({ id: p.id, value: p.seo!.description })))) for (const id of ids) add(id, "description-duplicate", { pages: ids.length }, `description-duplicate:${value}`);

  // Broken internal links: pages that answered with an error, and which checked pages link to them.
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  for (const target of pages.filter((p) => p.state === "failed" && (p.httpStatus ?? 0) >= 400)) {
    const from = done.filter((p) => p.links.includes(target.url)).map((p) => p.url);
    if (from.length) add(target.id, "broken-internal-link", { status: target.httpStatus, from: from.slice(0, 10), linkedFrom: from.length }, `broken:${target.url}`);
  }
  // Canonicals pointing at a page that errors.
  for (const p of done) {
    const canonical = p.seo!.canonical ? normalizeUrl(p.seo!.canonical) : null;
    const target = canonical && canonical !== p.url ? byUrl.get(canonical) : undefined;
    if (target?.state === "failed") add(p.id, "canonical-broken", { canonical, status: target.httpStatus });
  }
  // Orphans: in the sitemap, linked from no checked page (the start page doesn't count).
  const start = normalizeUrl(site.startUrl);
  const linked = new Set(done.flatMap((p) => p.links));
  for (const p of done) if (p.inSitemap && p.url !== start && !linked.has(p.url)) add(p.id, "orphan-page");
  if (!pages.some((p) => p.inSitemap)) add(null, "sitemap-missing");

  // AI crawlers and llms.txt.
  const access = await aiCrawlerAccess(site.startUrl);
  const blockedSearch = access.filter((c) => !c.allowed && c.purpose !== "training");
  const blockedTraining = access.filter((c) => !c.allowed && c.purpose === "training");
  if (blockedSearch.length) add(null, "ai-search-blocked", { crawlers: blockedSearch.map((c) => `${c.token} (${c.operator})`) });
  if (blockedTraining.length) add(null, "ai-training-blocked", { crawlers: blockedTraining.map((c) => `${c.token} (${c.operator})`) });
  const files = await siteFiles(site.startUrl);
  const llmsTxt = files.llmsTxt;
  if (llmsTxt === "missing") add(null, "llms-missing");
  else if (llmsTxt === "invalid") add(null, "llms-invalid");
  if (files.robotsNotText) add(null, "robots-not-text");
  if (files.soft404) add(null, "soft-404");

  // Home page facts.
  const home = done.find((p) => p.url === start);
  if (home) {
    if (!home.seo!.structuredTypes.some((t) => ["Organization", "WebSite", "Product", "SoftwareApplication", "LocalBusiness"].includes(t))) add(home.id, "home-no-structured-data");
    if (!home.seo!.ogImage) add(home.id, "og-image-missing");
  }

  await transaction(async (tx) => {
    // Replace the site-level rules (page-level ones are replaced as each page is checked).
    await tx.delete(seoFindings).where(and(eq(seoFindings.siteId, site.id), inArray(seoFindings.rule, SITE_RULES)));
    if (drafts.length) {
      await tx.insert(seoFindings).values(drafts.map((d) => rows(site, d.pageId, [d.draft])[0]!));
    }
  });

  // Scores: pages from all their findings; the site from its pages, less the site-wide problems.
  const findings = await db.select({ pageId: seoFindings.pageId, rule: seoFindings.rule }).from(seoFindings).where(eq(seoFindings.siteId, site.id));
  const byPage = new Map<string, SeoRuleId[]>();
  for (const f of findings) if (f.pageId) byPage.set(f.pageId, [...(byPage.get(f.pageId) ?? []), f.rule as SeoRuleId]);
  const scores: number[] = [];
  for (const p of done) {
    const score = seoPageScore(byPage.get(p.id) ?? []);
    scores.push(score);
    if (score !== p.seoScore) await db.update(sitePages).set({ seoScore: score }).where(eq(sitePages.id, p.id));
  }
  // Site-wide problems, plus broken links: those sit on the broken page, which (having failed) has no score of its own.
  const sitePenalty = Math.min(
    30,
    findings.filter((f) => !f.pageId || f.rule === "broken-internal-link").reduce((sum, f) => {
      const s = severityOf(f.rule as SeoRuleId);
      return sum + (s === "info" ? 0 : SEVERITY_WEIGHT[s] / 1.5);
    }, 0),
  );
  const seoScore = scores.length ? Math.max(0, Math.round((10 * scores.reduce((a, b) => a + b, 0)) / scores.length - 10 * sitePenalty) / 10) : null;
  await db.update(sites).set({ seoScore, aiAccess: { crawlers: access, llmsTxt, checkedAt: Date.now() } }).where(eq(sites.id, site.id));
  await db.update(siteScans).set({ seoScore }).where(eq(siteScans.id, scanId));
}

/** Rules computed across the site when a scan finishes (as opposed to per page). */
const SITE_RULES: SeoRuleId[] = [
  "title-duplicate",
  "description-duplicate",
  "broken-internal-link",
  "canonical-broken",
  "orphan-page",
  "sitemap-missing",
  "ai-search-blocked",
  "ai-training-blocked",
  "llms-missing",
  "llms-invalid",
  "robots-not-text",
  "soft-404",
  "home-no-structured-data",
  "og-image-missing",
];

/** Findings for the UI, newest scan's, grouped by rule then group key. */
export async function siteSeoFindings(siteId: string) {
  return getDb()
    .select({ finding: seoFindings, url: sitePages.url, title: sitePages.title })
    .from(seoFindings)
    .leftJoin(sitePages, eq(sitePages.id, seoFindings.pageId))
    .where(and(eq(seoFindings.siteId, siteId), isNull(sitePages.goneAt)));
}

