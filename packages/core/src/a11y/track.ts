import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { a11yIssueGroups, a11yOccurrences, metricsSnapshots, roadmapItems, sitePages, siteScans, sites, type A11yImpact } from "@startica/db/schema";
import type { AiContext } from "../ai/client.ts";
import { IMPACT_WEIGHT } from "./results.ts";
import { activeScan, startSiteScan } from "./sites.ts";
import { webSource } from "../metrics/web.ts";

/**
 * Tracking and prioritizing accessibility issues (ARCHITECTURE.md section 9.3, A2): rescans when
 * they're due, ignore and review decisions remembered by fingerprint, priority from
 * impact, pages and traffic, score history, CSV export.
 */

type Group = typeof a11yIssueGroups.$inferSelect;

// --- Scheduled rescans

export const scanDuePayload = z.object({ workspaceId: z.guid() });

/** Sites whose last full scan finished longer ago than their interval (0 = off). Only sites scanned at least once. */
export async function dueSites(workspaceId: string, now = Date.now()) {
  const rows = await getDb()
    .select({ site: sites, finishedAt: siteScans.finishedAt })
    .from(sites)
    .leftJoin(siteScans, eq(siteScans.id, sites.lastScanId))
    .where(and(eq(sites.workspaceId, workspaceId), isNotNull(sites.lastScanId)));
  return rows.filter((r) => r.site.scanIntervalDays > 0 && (!r.finishedAt || now - r.finishedAt.getTime() >= r.site.scanIntervalDays * 86_400_000)).map((r) => r.site);
}

/** Hourly: queues a full scan for every site that's due (due-based, so a closed app catches up when it opens). */
export async function runScanDue(_ctx: AiContext, payload: z.infer<typeof scanDuePayload>) {
  if (process.env.STARTICA_DEMO === "1") return { skipped: "demo" };
  let started = 0;
  for (const site of await dueSites(payload.workspaceId)) {
    if (await activeScan(site.id, "full")) continue;
    await startSiteScan(site, "scheduled");
    started++;
  }
  return { started };
}

// --- Priority

/** 30-day sessions per page path for a product (from `page:<path>` rows of GA4 or Umami). Empty without web analytics. */
export async function pageSessions(productId: string, now = new Date()): Promise<Map<string, number>> {
  // Local days, like the GA4 and Umami rows.
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toLocaleDateString("en-CA");
  const source = await webSource(productId);
  if (!source) return new Map();
  const rows = await getDb()
    .select({ dimension: metricsSnapshots.dimension, value: sql<number>`sum(${metricsSnapshots.value})` })
    .from(metricsSnapshots)
    .where(and(eq(metricsSnapshots.productId, productId), eq(metricsSnapshots.source, source), eq(metricsSnapshots.metric, "sessions"), like(metricsSnapshots.dimension, "page:%"), gte(metricsSnapshots.day, since)))
    .groupBy(metricsSnapshots.dimension);
  return new Map(rows.map((r) => [r.dimension!.slice("page:".length), Number(r.value)]));
}

const pathOf = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

export type PriorityBand = "high" | "medium" | "low";

/**
 * Priority = impact weight × the pages it's on, each counted as 1 + its 30-day sessions
 * (1 without GA4). Bands: High for critical or serious issues on 5+ pages or pages with
 * 10%+ of the site's tracked sessions; Medium for other critical or serious ones and
 * moderate ones on 5+ pages; Low for the rest.
 */
export function priorityOf(impact: A11yImpact | null, pages: string[], sessions: Map<string, number>, siteSessions: number) {
  const weight = IMPACT_WEIGHT[impact ?? "moderate"];
  const traffic = pages.reduce((sum, url) => sum + (sessions.get(pathOf(url)) ?? 0), 0);
  const score = weight * pages.reduce((sum, url) => sum + 1 + (sessions.get(pathOf(url)) ?? 0), 0);
  const serious = weight >= IMPACT_WEIGHT.serious;
  const busy = siteSessions > 0 && traffic >= 0.1 * siteSessions;
  const band: PriorityBand = serious && (pages.length >= 5 || busy) ? "high" : serious || (weight >= IMPACT_WEIGHT.moderate && pages.length >= 5) ? "medium" : "low";
  return { score, band, traffic };
}

/** A site's issue groups with their pages, priority and traffic, most important first. */
export async function prioritizedGroups(site: { id: string; productId: string }, filter: { status?: Group["status"]; kind?: "issues" | "review" } = {}) {
  const db = getDb();
  const groups = await db
    .select()
    .from(a11yIssueGroups)
    .where(and(eq(a11yIssueGroups.siteId, site.id), filter.status ? eq(a11yIssueGroups.status, filter.status) : undefined));
  const shown = groups.filter((g) => (filter.kind === "review" ? g.kind === "needs_review" && g.reviewStatus !== "fail" : g.kind === "violation" || g.reviewStatus === "fail"));
  const ids = shown.map((g) => g.id);
  const pages = ids.length
    ? await db
        .selectDistinct({ groupId: a11yOccurrences.groupId, url: sitePages.url })
        .from(a11yOccurrences)
        .innerJoin(sitePages, eq(sitePages.id, a11yOccurrences.pageId))
        .where(and(inArray(a11yOccurrences.groupId, ids), isNull(sitePages.goneAt)))
    : [];
  const urlsOf = new Map<string, string[]>();
  for (const p of pages) urlsOf.set(p.groupId, [...(urlsOf.get(p.groupId) ?? []), p.url]);
  const sessions = await pageSessions(site.productId);
  const siteUrls = (await db.select({ url: sitePages.url }).from(sitePages).where(and(eq(sitePages.siteId, site.id), isNull(sitePages.goneAt)))).map((p) => p.url);
  const siteSessions = siteUrls.reduce((sum, url) => sum + (sessions.get(pathOf(url)) ?? 0), 0);
  return shown
    .map((g) => ({ group: g, pages: urlsOf.get(g.id) ?? [], ...priorityOf(g.impact, urlsOf.get(g.id) ?? [], sessions, siteSessions) }))
    .sort((a, b) => b.score - a.score || b.group.occurrencesCount - a.group.occurrencesCount);
}

// --- Decisions

export const ignoreReasons = ["false_positive", "wont_fix", "not_applicable"] as const;
export const IGNORE_LABEL: Record<(typeof ignoreReasons)[number], string> = { false_positive: "False positive", wont_fix: "Won't fix", not_applicable: "Not applicable" };

export const ignoreInput = z.object({ reason: z.enum(ignoreReasons, { error: "Pick a reason" }), note: z.string().trim().max(500).default("") });

async function ownGroup(workspaceId: string, groupId: string) {
  const [g] = await getDb().select().from(a11yIssueGroups).where(and(eq(a11yIssueGroups.id, groupId), eq(a11yIssueGroups.workspaceId, workspaceId)));
  if (!g) throw new Error("Issue not found");
  return g;
}

/** Ignores an issue on the whole site, remembered by fingerprint across scans; it stops counting in the lists and compliance views. */
export async function ignoreGroup(workspaceId: string, groupId: string, input: z.infer<typeof ignoreInput>): Promise<void> {
  await ownGroup(workspaceId, groupId);
  await getDb().update(a11yIssueGroups).set({ status: "ignored", ignoreReason: input.reason, ignoreNote: input.note || null, ignoredAt: new Date() }).where(eq(a11yIssueGroups.id, groupId));
}

/** Back to open if the latest results still show it, otherwise fixed. */
export async function unignoreGroup(workspaceId: string, groupId: string): Promise<void> {
  const g = await ownGroup(workspaceId, groupId);
  await getDb()
    .update(a11yIssueGroups)
    .set({ status: g.occurrencesCount > 0 ? "open" : "fixed", ignoreReason: null, ignoreNote: null, ignoredAt: null })
    .where(eq(a11yIssueGroups.id, groupId));
}

export const reviewInput = z.object({ decision: z.enum(["pass", "fail", "skip", "undo"]), note: z.string().trim().max(500).default("") });

/** Decides a Needs review item: Pass, Fail (it becomes an issue), Skip, or undo. Remembered by fingerprint. */
export async function reviewGroup(workspaceId: string, groupId: string, input: z.infer<typeof reviewInput>): Promise<void> {
  const g = await ownGroup(workspaceId, groupId);
  if (g.kind !== "needs_review") throw new Error("Only Needs review items take a decision");
  await getDb()
    .update(a11yIssueGroups)
    .set(input.decision === "undo" ? { reviewStatus: null, reviewNote: null, reviewedAt: null } : { reviewStatus: input.decision, reviewNote: input.note || null, reviewedAt: new Date() })
    .where(eq(a11yIssueGroups.id, groupId));
}

// --- History, roadmap, export

/** Finished full scans, oldest first: the score history. */
export async function scoreHistory(siteId: string, limit = 26) {
  const rows = await getDb()
    .select({ at: siteScans.finishedAt, score: siteScans.score, seoScore: siteScans.seoScore, securityScore: siteScans.securityScore, impacts: siteScans.impacts })
    .from(siteScans)
    .where(and(eq(siteScans.siteId, siteId), eq(siteScans.scope, "full"), inArray(siteScans.status, ["done", "cancelled"]), isNotNull(siteScans.score)))
    .orderBy(desc(siteScans.finishedAt))
    .limit(limit);
  return rows.reverse();
}

/** What changed in a scan: issues it found first and issues it marked fixed. */
export async function scanChanges(siteId: string, scanId: string) {
  const db = getDb();
  const [added, fixed] = await Promise.all([
    db.select().from(a11yIssueGroups).where(and(eq(a11yIssueGroups.siteId, siteId), eq(a11yIssueGroups.firstSeenScanId, scanId), eq(a11yIssueGroups.kind, "violation"))).orderBy(asc(a11yIssueGroups.help)),
    db.select().from(a11yIssueGroups).where(and(eq(a11yIssueGroups.siteId, siteId), eq(a11yIssueGroups.fixedScanId, scanId))).orderBy(asc(a11yIssueGroups.help)),
  ]);
  return { added, fixed };
}

/** An owner roadmap item for an issue (playbook "accessibility-fixes"), kept by re-plans. */
export async function addGroupToRoadmap(workspaceId: string, groupId: string): Promise<string> {
  const g = await ownGroup(workspaceId, groupId);
  const [site] = await getDb().select().from(sites).where(eq(sites.id, g.siteId));
  const title = `Accessibility: ${g.help} on ${site!.name}`;
  const [existing] = await getDb().select({ id: roadmapItems.id }).from(roadmapItems).where(and(eq(roadmapItems.productId, site!.productId), eq(roadmapItems.title, title)));
  if (existing) throw new Error("Already on the Roadmap");
  const [item] = await getDb()
    .insert(roadmapItems)
    .values({
      workspaceId,
      productId: site!.productId,
      stage: "activation",
      title,
      why: `${g.description} Found on ${g.pagesCount} ${g.pagesCount === 1 ? "page" : "pages"} (${g.impact ?? "moderate"} impact).`,
      playbook: "accessibility-fixes",
      successMetric: "Marked fixed by the next scan",
      nextStep: g.helpUrl ? `Fix it with the rule's guidance (${g.helpUrl}), then Recheck its pages` : "Fix it, then Recheck its pages",
      priority: g.impact === "critical" ? 1 : g.impact === "serious" ? 2 : 3,
      source: "owner",
    })
    .returning({ id: roadmapItems.id });
  return item!.id;
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote everything; a leading = + - @ is prefixed so spreadsheets don't run it as a formula.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Every open, fixed and ignored issue with each page and element it's on, as CSV. */
export async function issuesCsv(siteId: string): Promise<string> {
  const rows = await getDb()
    .select({ group: a11yIssueGroups, url: sitePages.url, selector: a11yOccurrences.selector, html: a11yOccurrences.html, summary: a11yOccurrences.failureSummary })
    .from(a11yIssueGroups)
    .leftJoin(a11yOccurrences, eq(a11yOccurrences.groupId, a11yIssueGroups.id))
    .leftJoin(sitePages, eq(sitePages.id, a11yOccurrences.pageId))
    .where(eq(a11yIssueGroups.siteId, siteId))
    .orderBy(asc(a11yIssueGroups.status), asc(a11yIssueGroups.help), asc(sitePages.url));
  const header = ["Issue", "Kind", "Impact", "WCAG criteria", "Level", "Status", "Reason", "Review", "Pages", "Page", "Element", "HTML", "How to fix", "Rule", "Help"];
  const lines = rows.map(({ group: g, url, selector, html, summary }) =>
    [g.help, g.kind === "violation" ? "Issue" : "Needs review", g.impact, g.criteria.join(" "), g.level, g.status, g.ignoreReason, g.reviewStatus, g.pagesCount, url, selector, html, summary, g.ruleId, g.helpUrl]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}

/** The top open issue for Today: priority first, with its traffic when GA4 is connected. */
export async function topIssue(productId: string) {
  const [site] = await getDb().select().from(sites).where(and(eq(sites.productId, productId), isNotNull(sites.lastScanId))).orderBy(asc(sites.createdAt)).limit(1);
  if (!site) return null;
  const [top] = await prioritizedGroups(site, { status: "open", kind: "issues" });
  return top ? { site, ...top } : null;
}
