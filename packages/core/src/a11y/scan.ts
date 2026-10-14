import { and, asc, count, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import { a11yIssueGroups, a11yOccurrences, siteScans, sitePages, sites } from "@startica/db/schema";
import type { AiContext } from "../ai/client.ts";
import { reportProgress } from "../jobs/activity.ts";
import { queueTrackerSync } from "../trackers/trackers.ts";
import { queueAgentCheck } from "../agents/run.ts";
import { finishSecurity, storePageSecurity } from "../security/findings.ts";
import { queueMonitor } from "../security/monitor.ts";
import { syncSiteImages } from "./ai.ts";
import { queueContentCheck } from "./documents.ts";
import { finishSeo, storePageSeo } from "../seo/site.ts";
import { readRobots, sitemapUrls, type Robots } from "./discovery.ts";
import { criteriaFromTags, findings, impactCounts, levelFromTags, pageScore, siteScore, emptyImpacts } from "./results.ts";
import { getScanner, profileTags, scanRequest, type ScanResponse } from "./scanner.ts";
import { knownWords, pageContent, policySelectors, storePageContent } from "./content.ts";
import { deleteScreenshot, saveScreenshot } from "./screenshots.ts";
import { allowedForSite, normalizeUrl, sameSite } from "./urls.ts";

/**
 * Site scans (ARCHITECTURE.md section 9.2). A full scan crawls and checks the whole site;
 * a page check rechecks given URLs. Both are resumable: every page row carries the
 * scan's id and its state, so a scan interrupted by quitting picks up where it was.
 */

type Site = typeof sites.$inferSelect;
type Page = typeof sitePages.$inferSelect;

const CONCURRENCY = 2;
const MIN_GAP_MS = 1000; // at most one page load a second per site (section 9.2)

export const NO_SCANNER = "Accessibility scans run in the Startica desktop app.";

export const siteScanPayload = z.object({ workspaceId: z.guid(), scanId: z.guid() });
export const pageCheckPayload = z.object({ workspaceId: z.guid(), scanId: z.guid(), urls: z.array(z.string()).min(1).max(500) });

async function load(scanId: string): Promise<{ scan: typeof siteScans.$inferSelect; site: Site }> {
  const [row] = await getDb().select({ scan: siteScans, site: sites }).from(siteScans).innerJoin(sites, eq(sites.id, siteScans.siteId)).where(eq(siteScans.id, scanId));
  if (!row) throw new Error("Scan not found");
  return row;
}

async function markRunning(scanId: string) {
  await getDb()
    .update(siteScans)
    .set({ status: "running", startedAt: sql`coalesce(${siteScans.startedAt}, ${Date.now()})`, error: null })
    .where(eq(siteScans.id, scanId));
}

/** Adds pages to a scan's queue (or requeues known ones for it); returns how many are now in the scan. */
async function enqueuePages(site: Site, scanId: string, entries: { url: string; depth: number; inSitemap?: boolean }[]): Promise<void> {
  if (entries.length === 0) return;
  await transaction(async (db) => {
    for (const { url, depth, inSitemap } of entries) {
      await db
        .insert(sitePages)
        .values({ workspaceId: site.workspaceId, siteId: site.id, url, depth, scanId, state: "queued", inSitemap: inSitemap ?? false })
        .onConflictDoUpdate({
          target: [sitePages.siteId, sitePages.url],
          set: { scanId, state: "queued", depth, ...(inSitemap === undefined ? {} : { inSitemap }) },
          // Already part of this scan: leave it as it is.
          setWhere: sql`${sitePages.scanId} is not ${scanId}`,
        });
    }
  });
}

/**
 * Brings a site's pages in line with today's URL rules (e.g. query strings dropped,
 * 2026-10-10): pages stored under another form are removed with their results, and
 * the ones still waiting in this scan are queued again under their canonical address.
 */
async function canonicalizePages(site: Site, scanId: string): Promise<void> {
  const pages = await getDb().select({ id: sitePages.id, url: sitePages.url, scanId: sitePages.scanId, state: sitePages.state, depth: sitePages.depth }).from(sitePages).where(eq(sitePages.siteId, site.id));
  const stale = pages.filter((p) => normalizeUrl(p.url) !== p.url);
  if (stale.length === 0) return;
  const requeue = stale
    .filter((p) => p.scanId === scanId && p.state === "queued")
    .flatMap((p) => {
      const url = normalizeUrl(p.url);
      return url && allowedForSite(url, site) ? [{ url, depth: p.depth }] : [];
    });
  await getDb().delete(sitePages).where(inArray(sitePages.id, stale.map((p) => p.id)));
  await enqueuePages(site, scanId, [...new Map(requeue.map((r) => [r.url, r])).values()]);
}

async function pagesInScan(scanId: string): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(sitePages).where(eq(sitePages.scanId, scanId));
  return row?.n ?? 0;
}

async function nextQueued(scanId: string, limit: number): Promise<Page[]> {
  return getDb()
    .select()
    .from(sitePages)
    .where(and(eq(sitePages.scanId, scanId), eq(sitePages.state, "queued")))
    .orderBy(asc(sitePages.depth), asc(sitePages.createdAt))
    .limit(limit);
}

async function markPage(pageId: string, state: "failed" | "skipped", error: string, httpStatus: number | null = null) {
  await getDb().update(sitePages).set({ state, error, httpStatus, lastScannedAt: new Date() }).where(eq(sitePages.id, pageId));
}

/** Replaces a page's latest results with this check's: page facts, score, issue groups and occurrences. */
export async function storePageResult(site: Site, page: Page, scanId: string, response: ScanResponse): Promise<void> {
  const { result } = response;
  const found = findings(result);
  const now = new Date();
  // The latest screenshot only (ARCHITECTURE.md section 9.3): replaced, or removed when the page is clean now.
  const shot = response.screenshot?.data ? saveScreenshot(site.id, page.id, response.screenshot.data) : null;
  // Content quality (A5), worked out before the transaction: spelling suggestions take a moment.
  const content = await pageContent(site, response, await knownWords(site));
  if (!shot && page.screenshot) deleteScreenshot(site.id, page.screenshot);
  await transaction(async (db) => {
    await db.delete(a11yOccurrences).where(eq(a11yOccurrences.pageId, page.id));
    for (const f of found) {
      const [existing] = await db
        .select({ id: a11yIssueGroups.id, status: a11yIssueGroups.status })
        .from(a11yIssueGroups)
        .where(and(eq(a11yIssueGroups.siteId, site.id), eq(a11yIssueGroups.fingerprint, f.fingerprint)));
      let groupId = existing?.id;
      if (!groupId) {
        const [created] = await db
          .insert(a11yIssueGroups)
          .values({
            workspaceId: site.workspaceId,
            siteId: site.id,
            kind: f.kind,
            ruleId: f.rule.id,
            fingerprint: f.fingerprint,
            impact: f.impact,
            help: f.rule.help,
            description: f.rule.description,
            helpUrl: f.rule.helpUrl,
            tags: f.rule.tags,
            criteria: criteriaFromTags(f.rule.tags),
            level: levelFromTags(f.rule.tags),
            sampleSelector: f.selector,
            sampleHtml: f.html,
            firstSeenScanId: scanId,
            firstSeenAt: now,
            lastSeenAt: now,
          })
          .returning({ id: a11yIssueGroups.id });
        groupId = created!.id;
      } else {
        // Seen again: a fixed issue reopens; an ignored one stays ignored.
        await db
          .update(a11yIssueGroups)
          .set({ lastSeenAt: now, ...(existing!.status === "fixed" ? { status: "open" as const, fixedAt: null, fixedScanId: null } : {}) })
          .where(eq(a11yIssueGroups.id, groupId));
      }
      await db.insert(a11yOccurrences).values({
        workspaceId: site.workspaceId,
        pageId: page.id,
        groupId,
        selector: f.selector,
        html: f.html,
        failureSummary: f.failureSummary,
        impact: f.impact,
        box: f.box,
      });
    }
    await db
      .update(sitePages)
      .set({
        title: result.title || null,
        lang: result.lang || null,
        httpStatus: response.httpStatus,
        state: "done",
        score: pageScore(result),
        impacts: impactCounts(found),
        needsReview: found.filter((f) => f.kind === "needs_review").length,
        error: null,
        lastScannedAt: now,
        goneAt: null,
        screenshot: shot,
        images: result.images ?? null,
        screenshotSize: shot && response.screenshot ? { width: response.screenshot.width, height: response.screenshot.height } : null,
      })
      .where(eq(sitePages.id, page.id));
    // The same page, checked for search and AI too (SEO & GEO site health, ARCHITECTURE.md 10.2).
    await storePageSeo(db, site, page, response);
    // And for security, on verified sites (ARCHITECTURE.md section 11.2).
    await storePageSecurity(db, site, page, response);
    await storePageContent(db, site, page, content);
  });
}

/** Opens one page and stores its results; returns the links found on it (empty on failure). */
async function checkPage(site: Site, page: Page, scanId: string, tags: string[], robots: Robots | null): Promise<{ links: string[]; axeVersion?: string; ok: boolean }> {
  if (robots && !robots.allows(page.url)) {
    await markPage(page.id, "skipped", "Blocked by the site's robots.txt");
    return { links: [], ok: true };
  }
  const scanner = getScanner();
  if (!scanner) throw new Error(NO_SCANNER);
  let response: ScanResponse;
  try {
    response = await scanner.scan(scanRequest(page.url, tags, policySelectors(site)));
  } catch (error) {
    await markPage(page.id, "failed", error instanceof Error ? error.message : String(error));
    return { links: [], ok: false };
  }
  if (response.httpStatus !== null && response.httpStatus >= 400) {
    await markPage(page.id, "failed", `The page answered HTTP ${response.httpStatus}`, response.httpStatus);
    return { links: [], ok: false };
  }
  if (!sameSite(response.finalUrl, site.startUrl)) {
    await markPage(page.id, "skipped", `Redirects off the site, to ${response.finalUrl}`, response.httpStatus);
    return { links: [], ok: true };
  }
  if (!Array.isArray(response.result?.violations) || !Array.isArray(response.result?.passes)) {
    await markPage(page.id, "failed", "The scanner returned no results for this page", response.httpStatus);
    return { links: [], ok: false };
  }
  try {
    await storePageResult(site, page, scanId, response);
  } catch (error) {
    await markPage(page.id, "failed", `Couldn't save the results: ${error instanceof Error ? error.message : String(error)}`, response.httpStatus);
    return { links: [], ok: false };
  }
  return { links: response.result.links ?? [], axeVersion: response.result.axeVersion, ok: true };
}

/** Works through a scan's queue, two pages at a time, at most one page load a second. */
async function work(ctx: AiContext, site: Site, scanId: string, opts: { discover: boolean; robots: Robots | null }) {
  const tags = profileTags(site);
  let lastStart = 0;
  let axeVersion: string | undefined;
  const pace = async () => {
    const wait = lastStart + MIN_GAP_MS - Date.now();
    lastStart = Math.max(Date.now(), lastStart + MIN_GAP_MS);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  };

  for (;;) {
    ctx.signal?.throwIfAborted(); // stopped by the user: pages already checked keep their results
    const batch = await nextQueued(scanId, CONCURRENCY);
    if (batch.length === 0) break;
    const results = await Promise.all(
      batch.map(async (page) => {
        await pace();
        return { page, ...(await checkPage(site, page, scanId, tags, opts.robots)) };
      }),
    );
    for (const r of results) {
      axeVersion ??= r.axeVersion;
      if (!opts.discover || r.page.depth >= site.maxDepth) continue;
      const room = site.maxPages - (await pagesInScan(scanId));
      if (room <= 0) continue;
      const next = [...new Set(r.links.map((l) => normalizeUrl(l)).filter((u): u is string => !!u && allowedForSite(u, site)))].slice(0, room);
      await enqueuePages(site, scanId, next.map((url) => ({ url, depth: r.page.depth + 1 })));
    }
    const [done] = await getDb()
      .select({ done: sql<number>`sum(${sitePages.state} = 'done')`, failed: sql<number>`sum(${sitePages.state} = 'failed')`, total: count() })
      .from(sitePages)
      .where(eq(sitePages.scanId, scanId));
    await getDb()
      .update(siteScans)
      .set({ pagesDone: Number(done?.done ?? 0), pagesFailed: Number(done?.failed ?? 0), ...(axeVersion ? { axeVersion } : {}) })
      .where(eq(siteScans.id, scanId));
    await reportProgress(ctx.jobRunId, { siteId: site.id, pagesDone: Number(done?.done ?? 0) + Number(done?.failed ?? 0), pagesTotal: done?.total ?? 0, url: batch[0]!.url });
  }
}

/**
 * Recounts every group of the site from the pages' latest occurrences: groups no
 * longer found anywhere become fixed (in this scan). Then the site score and the
 * scan's summary: score, counts by impact, needs review, new and fixed issues.
 */
export async function finishScan(site: Site, scanId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  const live = await db
    .select({ groupId: a11yOccurrences.groupId, pages: sql<number>`count(distinct ${a11yOccurrences.pageId})`, occurrences: count() })
    .from(a11yOccurrences)
    .innerJoin(sitePages, eq(sitePages.id, a11yOccurrences.pageId))
    .where(and(eq(sitePages.siteId, site.id), isNull(sitePages.goneAt)))
    .groupBy(a11yOccurrences.groupId);
  const byGroup = new Map(live.map((g) => [g.groupId, g]));
  const groups = await db.select({ id: a11yIssueGroups.id, status: a11yIssueGroups.status }).from(a11yIssueGroups).where(eq(a11yIssueGroups.siteId, site.id));
  await transaction(async (tx) => {
    for (const group of groups) {
      const counts = byGroup.get(group.id);
      const fixedNow = !counts && group.status === "open";
      await tx
        .update(a11yIssueGroups)
        .set({
          pagesCount: Number(counts?.pages ?? 0),
          occurrencesCount: counts?.occurrences ?? 0,
          ...(fixedNow ? { status: "fixed" as const, fixedAt: now, fixedScanId: scanId } : {}),
        })
        .where(eq(a11yIssueGroups.id, group.id));
    }
  });

  const pages = await db
    .select({ score: sitePages.score, impacts: sitePages.impacts, needsReview: sitePages.needsReview })
    .from(sitePages)
    .where(and(eq(sitePages.siteId, site.id), eq(sitePages.state, "done"), isNull(sitePages.goneAt)));
  const impacts = emptyImpacts();
  for (const p of pages) for (const k of Object.keys(impacts) as (keyof typeof impacts)[]) impacts[k] += p.impacts?.[k] ?? 0;
  const score = siteScore(pages.flatMap((p) => (p.score == null ? [] : [p.score])));
  const [changes] = await db
    .select({
      added: sql<number>`sum(${a11yIssueGroups.firstSeenScanId} = ${scanId} and ${a11yIssueGroups.kind} = 'violation')`,
      fixed: sql<number>`sum(${a11yIssueGroups.fixedScanId} = ${scanId} and ${a11yIssueGroups.kind} = 'violation')`,
    })
    .from(a11yIssueGroups)
    .where(eq(a11yIssueGroups.siteId, site.id));
  // Nothing could be checked (the site is down, or every page failed): say why instead of reporting no issues.
  const [scanPages] = await db
    .select({ done: sql<number>`coalesce(sum(${sitePages.state} = 'done'), 0)`, error: sql<string | null>`max(${sitePages.error})` })
    .from(sitePages)
    .where(eq(sitePages.scanId, scanId));
  if (Number(scanPages?.done ?? 0) === 0) {
    await db
      .update(siteScans)
      .set({ status: "failed", finishedAt: now, error: `No page could be checked${scanPages?.error ? `: ${scanPages.error}` : ""}` })
      .where(eq(siteScans.id, scanId));
    return;
  }
  await db
    .update(siteScans)
    .set({
      status: "done",
      finishedAt: now,
      score,
      impacts,
      needsReview: pages.reduce((a, p) => a + p.needsReview, 0),
      newIssues: Number(changes?.added ?? 0),
      fixedIssues: Number(changes?.fixed ?? 0),
    })
    .where(eq(siteScans.id, scanId));
  await db.update(sites).set({ score, lastScanId: scanId }).where(eq(sites.id, site.id));
  const fresh = (await db.select().from(sites).where(eq(sites.id, site.id)))[0]!;
  await finishSeo(fresh, scanId);
  // Security: fold the pages' occurrences into findings; a full scan also runs the site probes.
  const [{ scope } = { scope: "page" }] = await db.select({ scope: siteScans.scope }).from(siteScans).where(eq(siteScans.id, scanId));
  await finishSecurity(fresh, { scanId, probes: scope === "full" });
  // Exposure monitoring after each full scan of a verified site (S2): the scan just refreshed the libraries and scripts.
  if (scope === "full") await queueMonitor(fresh);
  // Documents and external links after each full scan (A5).
  if (scope === "full") await queueContentCheck(fresh);
  // The site's image list for the alt text review (A3), from the pages' latest checks.
  await syncSiteImages(fresh);
  // Open or close repo issues for what changed, if the product has an issue tracker.
  await queueTrackerSync(site);
  // Agent readiness reads this scan's results (SEO & GEO, section 10.3).
  await queueAgentCheck(site);
}

/** Stopped by the user: recount from the pages checked so far and record the scan as stopped. */
async function markStopped(site: Site, scanId: string): Promise<void> {
  await finishScan(site, scanId);
  await getDb().update(siteScans).set({ status: "cancelled", error: null, finishedAt: new Date() }).where(eq(siteScans.id, scanId));
}

/** A full scan: start URL and sitemap first, then links found on each checked page, up to the site's caps. */
export async function runSiteScan(ctx: AiContext, payload: z.infer<typeof siteScanPayload>) {
  const { scan, site } = await load(payload.scanId);
  if (scan.status === "done") return { skipped: "already finished" };
  if (!getScanner()) {
    await getDb().update(siteScans).set({ status: "failed", error: NO_SCANNER, finishedAt: new Date() }).where(eq(siteScans.id, scan.id));
    throw new Error(NO_SCANNER);
  }
  await markRunning(scan.id);
  try {
    await canonicalizePages(site, scan.id);
    const robots = site.respectRobots ? await readRobots(site.startUrl) : null;
    // A fresh scan seeds its queue; a resumed one already has it.
    if ((await pagesInScan(scan.id)) === 0) {
      const start = normalizeUrl(site.startUrl)!;
      const listed = await sitemapUrls(site.startUrl, robots ?? { allows: () => true, sitemaps: [] }, site.maxPages);
      const fromSitemap = listed.filter((u) => u !== start && allowedForSite(u, site));
      // The sitemap is read fresh each full scan (SEO checks use it: orphans, noindex pages listed in it).
      await getDb().update(sitePages).set({ inSitemap: false }).where(eq(sitePages.siteId, site.id));
      await enqueuePages(site, scan.id, [
        { url: start, depth: 0, inSitemap: listed.includes(start) },
        ...fromSitemap.slice(0, site.maxPages - 1).map((url) => ({ url, depth: 1, inSitemap: true })),
      ]);
    }
    await work(ctx, site, scan.id, { discover: true, robots });
    // Pages this full scan didn't reach are gone from the site: their issues no longer count.
    // (A page a page check reached during the scan has been checked since it started.)
    const startedAt = (await load(scan.id)).scan.startedAt ?? new Date();
    const gone = await getDb()
      .select({ id: sitePages.id })
      .from(sitePages)
      .where(
        and(
          eq(sitePages.siteId, site.id),
          ne(sitePages.scanId, scan.id),
          isNull(sitePages.goneAt),
          or(isNull(sitePages.lastScannedAt), lt(sitePages.lastScannedAt, startedAt)),
        ),
      );
    if (gone.length) {
      const ids = gone.map((p) => p.id);
      await getDb().delete(a11yOccurrences).where(inArray(a11yOccurrences.pageId, ids));
      await getDb().update(sitePages).set({ goneAt: new Date() }).where(inArray(sitePages.id, ids));
    }
    await finishScan(site, scan.id);
  } catch (error) {
    if (ctx.signal?.aborted) await markStopped(site, scan.id);
    else
      await getDb()
        .update(siteScans)
        .set({ status: "failed", error: error instanceof Error ? error.message : String(error), finishedAt: new Date() })
        .where(eq(siteScans.id, scan.id));
    throw error;
  }
  const done = await load(scan.id);
  return { pagesDone: done.scan.pagesDone, pagesFailed: done.scan.pagesFailed, score: done.scan.score };
}

/** Rechecks the given pages now (Check a page, Recheck page, Recheck an issue group's pages). */
export async function runPageCheck(ctx: AiContext, payload: z.infer<typeof pageCheckPayload>) {
  const { scan, site } = await load(payload.scanId);
  if (scan.status === "done") return { skipped: "already finished" };
  if (!getScanner()) {
    await getDb().update(siteScans).set({ status: "failed", error: NO_SCANNER, finishedAt: new Date() }).where(eq(siteScans.id, scan.id));
    throw new Error(NO_SCANNER);
  }
  await markRunning(scan.id);
  try {
    await canonicalizePages(site, scan.id);
    if ((await pagesInScan(scan.id)) === 0) {
      const urls = payload.urls.map((u) => normalizeUrl(u)).filter((u): u is string => !!u && sameSite(u, site.startUrl));
      if (urls.length === 0) throw new Error("That address isn't on this site");
      await enqueuePages(site, scan.id, urls.map((url) => ({ url, depth: 0 })));
    }
    await work(ctx, site, scan.id, { discover: false, robots: null });
    await finishScan(site, scan.id);
  } catch (error) {
    if (ctx.signal?.aborted) await markStopped(site, scan.id);
    else
      await getDb()
        .update(siteScans)
        .set({ status: "failed", error: error instanceof Error ? error.message : String(error), finishedAt: new Date() })
        .where(eq(siteScans.id, scan.id));
    throw error;
  }
  const done = await load(scan.id);
  return { pagesDone: done.scan.pagesDone, pagesFailed: done.scan.pagesFailed, score: done.scan.score };
}
