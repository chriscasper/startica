import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import {
  a11yIssueGroups,
  adCampaigns,
  aiVisibilityRuns,
  connections,
  contentPieces,
  dailyMoves,
  jobRuns,
  jobs,
  metricsSnapshots,
  opportunities,
  products,
  roadmapItems,
  securityFindings,
  siteScans,
  sites,
} from "@startica/db/schema";
import { hasAiKey, monthlyBudgetUsd, monthToDateSpendUsd } from "../ai/client.ts";
import { topAdSuggestions } from "../ads/results.ts";
import { localDay } from "../growth/moves.ts";
import { QUEUE_LABELS } from "../jobs/background.ts";
import { daysAgo, isoDay } from "../metrics/types.ts";
import { webSource } from "../metrics/web.ts";
import { periods, siteTotals } from "../search/report.ts";
import { SEO_RULES, type SeoRuleId } from "../seo/rules.ts";
import { siteSeoFindings } from "../seo/site.ts";

/**
 * The Dashboard: every module's headline status for one product, and the short list of
 * things that need the owner, most urgent first. Reads only (unlike `ensureTodayMoves`,
 * which builds the day's moves), so opening the Dashboard never starts work.
 */

export type DashboardModule = "marketing" | "accessibility" | "seo" | "security" | "system";

export type Attention = {
  module: DashboardModule;
  /** bad: broken or risky now; warn: worth doing soon. */
  tone: "bad" | "warn";
  title: string;
  detail: string;
  href: string;
};

export type SiteStatus = {
  id: string;
  name: string;
  a11y: { score: number | null; target: number; open: number; critical: number; serious: number; lastScanAt: number | null };
  seo: { score: number | null; high: number; medium: number; low: number; aiBlocked: boolean | null };
  security: { verified: boolean; score: number | null; open: number; critical: number; high: number; certDays: number | null; checkedAt: number | null };
};

export type DashboardSummary = {
  product: { id: string; name: string; intel: string; intelUpdatedAt: number | null };
  marketing: {
    moves: { total: number; done: number; open: number };
    inbox: { review: number; working: number; posted30: number };
    content: { drafts: number; writing: number; posted30: number };
    ads: { running: number; total: number };
    roadmap: { todo: number; doing: number };
    /** Web analytics, last 30 days against the 30 before; null when no web source has data. */
    web: { source: "ga4" | "umami"; sessions: number; previous: number | null; keyEvents: number } | null;
    mrr: number | null;
    signups30: number | null;
  };
  sites: SiteStatus[];
  search: { connected: boolean; clicks: number | null; change: number | null };
  visibility: { mentioned: number; answered: number; at: number } | null;
  system: {
    hasKey: boolean;
    spent: number;
    budget: number;
    running: number;
    /** Jobs that gave up in the last 7 days. */
    failed: { count: number; latest: { label: string; error: string | null; at: number } | null };
    connectionErrors: { kind: string; error: string | null }[];
  };
  attention: Attention[];
};

type MetricSource = (typeof metricsSnapshots.$inferSelect)["source"];

const CONNECTION_LABEL: Record<string, string> = {
  ga4: "Google Analytics",
  umami: "Umami",
  stripe: "Stripe",
  product_db: "Product database",
  search_console: "Search Console",
  bing_webmaster: "Bing Webmaster Tools",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** `demo`: AI is off in demo mode, so a missing key isn't something to fix there. */
export async function dashboardSummary(workspaceId: string, productId: string, opts: { demo?: boolean } = {}): Promise<DashboardSummary> {
  const db = getDb();
  const today = localDay();
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const since7 = new Date(Date.now() - 7 * 86_400_000);
  const day30 = isoDay(daysAgo(29));
  const day60 = isoDay(daysAgo(59));

  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) throw new Error("That product doesn't exist");

  const countBy = async <T extends string>(rows: Promise<{ k: T; n: number }[]>) => {
    const out = new Map<T, number>();
    for (const r of await rows) out.set(r.k, Number(r.n));
    return out;
  };

  const [moves, inbox, posted30, pieces, piecesPosted30, campaigns, roadmap, conns, siteRows, spent, budget, hasKey, running, failedJobs, runs, web] = await Promise.all([
    countBy(db.select({ k: dailyMoves.status, n: sql<number>`count(*)` }).from(dailyMoves).where(and(eq(dailyMoves.productId, productId), eq(dailyMoves.day, today))).groupBy(dailyMoves.status)),
    countBy(db.select({ k: opportunities.status, n: sql<number>`count(*)` }).from(opportunities).where(eq(opportunities.productId, productId)).groupBy(opportunities.status)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(opportunities)
      .where(and(eq(opportunities.productId, productId), eq(opportunities.status, "posted"), gte(opportunities.updatedAt, since30))),
    countBy(db.select({ k: contentPieces.status, n: sql<number>`count(*)` }).from(contentPieces).where(eq(contentPieces.productId, productId)).groupBy(contentPieces.status)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(contentPieces)
      .where(and(eq(contentPieces.productId, productId), eq(contentPieces.status, "posted"), gte(contentPieces.postedAt, since30))),
    countBy(db.select({ k: adCampaigns.status, n: sql<number>`count(*)` }).from(adCampaigns).where(eq(adCampaigns.productId, productId)).groupBy(adCampaigns.status)),
    countBy(db.select({ k: roadmapItems.status, n: sql<number>`count(*)` }).from(roadmapItems).where(eq(roadmapItems.productId, productId)).groupBy(roadmapItems.status)),
    db.select().from(connections).where(eq(connections.productId, productId)),
    db.select().from(sites).where(eq(sites.productId, productId)).orderBy(sites.createdAt),
    monthToDateSpendUsd(workspaceId),
    monthlyBudgetUsd(),
    hasAiKey(),
    db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, workspaceId), inArray(jobs.status, ["queued", "running"]))),
    db
      .select({ id: jobs.id, queue: jobs.queue, at: jobs.updatedAt })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.status, "failed"), gte(jobs.updatedAt, since7)))
      .orderBy(desc(jobs.updatedAt)),
    db
      .select({ metrics: aiVisibilityRuns.metrics, at: aiVisibilityRuns.startedAt })
      .from(aiVisibilityRuns)
      .where(and(eq(aiVisibilityRuns.productId, productId), eq(aiVisibilityRuns.status, "done")))
      .orderBy(desc(aiVisibilityRuns.startedAt))
      .limit(1),
    webSource(productId),
  ]);

  // Web analytics and revenue: totals rows only (dimension "").
  const metric = (source: MetricSource, name: string, from: string, to?: string) =>
    db
      .select({ n: sql<number | null>`sum(${metricsSnapshots.value})`, days: sql<number>`count(*)` })
      .from(metricsSnapshots)
      .where(
        and(
          eq(metricsSnapshots.productId, productId),
          eq(metricsSnapshots.source, source),
          eq(metricsSnapshots.metric, name),
          eq(metricsSnapshots.dimension, ""),
          gte(metricsSnapshots.day, from),
          to ? lt(metricsSnapshots.day, to) : undefined,
        ),
      )
      .then(([r]) => (r && Number(r.days) > 0 ? Number(r.n ?? 0) : null));
  const latest = (source: MetricSource, name: string) =>
    db
      .select({ value: metricsSnapshots.value })
      .from(metricsSnapshots)
      .where(and(eq(metricsSnapshots.productId, productId), eq(metricsSnapshots.source, source), eq(metricsSnapshots.metric, name), eq(metricsSnapshots.dimension, "")))
      .orderBy(desc(metricsSnapshots.day))
      .limit(1)
      .then(([r]) => (r ? Number(r.value) : null));
  const searchConnected = conns.some((c) => c.kind === "search_console" && c.status === "ok");
  const [sessions, sessionsBefore, keyEvents, mrr, signups30, search, adSuggestion] = await Promise.all([
    web ? metric(web, "sessions", day30) : null,
    web ? metric(web, "sessions", day60, day30) : null,
    web ? metric(web, "key_events", day30) : null,
    latest("stripe", "mrr"),
    metric("product_db", "signups", day30),
    searchConnected
      ? periods(productId, "google", 28).then(async (p) => {
          if (!p.newest) return { clicks: null, change: null };
          const now = await siteTotals(productId, "google", p.current);
          const before = p.previousComplete ? await siteTotals(productId, "google", p.previous) : null;
          return { clicks: now.clicks, change: before && before.clicks > 0 ? (now.clicks - before.clicks) / before.clicks : null };
        })
      : { clicks: null, change: null },
    topAdSuggestions(productId, 1).catch(() => []),
  ]);

  // Per site: accessibility issues, site health problems and security findings, all open.
  const siteIds = siteRows.map((s) => s.id);
  const scanIds = siteRows.map((s) => s.lastScanId).filter((v): v is string => Boolean(v));
  const [a11y, findings, seo, scans] = await Promise.all([
    siteIds.length
      ? db
          .select({ siteId: a11yIssueGroups.siteId, impact: a11yIssueGroups.impact, n: sql<number>`count(*)` })
          .from(a11yIssueGroups)
          .where(and(inArray(a11yIssueGroups.siteId, siteIds), eq(a11yIssueGroups.status, "open"), eq(a11yIssueGroups.kind, "violation")))
          .groupBy(a11yIssueGroups.siteId, a11yIssueGroups.impact)
      : [],
    siteIds.length
      ? db
          .select({ siteId: securityFindings.siteId, severity: securityFindings.severity, n: sql<number>`count(*)` })
          .from(securityFindings)
          .where(and(inArray(securityFindings.siteId, siteIds), eq(securityFindings.status, "open")))
          .groupBy(securityFindings.siteId, securityFindings.severity)
      : [],
    Promise.all(siteRows.map((s) => siteSeoFindings(s.id))),
    scanIds.length ? db.select({ id: siteScans.id, finishedAt: siteScans.finishedAt }).from(siteScans).where(inArray(siteScans.id, scanIds)) : [],
  ]);

  const siteStatus: SiteStatus[] = siteRows.map((s, i) => {
    const issues = a11y.filter((r) => r.siteId === s.id);
    const impact = (name: string) => Number(issues.find((r) => r.impact === name)?.n ?? 0);
    const sec = findings.filter((r) => r.siteId === s.id && r.severity !== "info");
    const severity = (name: string) => Number(sec.find((r) => r.severity === name)?.n ?? 0);
    // One problem per rule and group (a duplicate title shared by 3 pages is one fix).
    const problems = { high: new Set<string>(), medium: new Set<string>(), low: new Set<string>() };
    for (const { finding } of seo[i]!) {
      const sev = SEO_RULES[finding.rule as SeoRuleId]?.severity;
      if (sev && sev !== "info") problems[sev].add(`${finding.rule}:${finding.groupKey}`);
    }
    const ai = s.aiAccess;
    const validTo = s.security?.tls?.validTo ?? null;
    const verified = Boolean(s.securityVerifiedAt);
    return {
      id: s.id,
      name: s.name,
      a11y: {
        score: s.score,
        target: s.targetScore,
        open: issues.reduce((n, r) => n + Number(r.n), 0),
        critical: impact("critical"),
        serious: impact("serious"),
        lastScanAt: scans.find((x) => x.id === s.lastScanId)?.finishedAt?.getTime() ?? null,
      },
      seo: { score: s.seoScore, high: problems.high.size, medium: problems.medium.size, low: problems.low.size, aiBlocked: ai ? ai.crawlers.some((c) => !c.allowed && c.purpose !== "training") : null },
      security: {
        verified,
        score: verified ? s.securityScore : null,
        open: verified ? sec.reduce((n, r) => n + Number(r.n), 0) : 0,
        critical: verified ? severity("critical") : 0,
        high: verified ? severity("high") : 0,
        certDays: verified && validTo ? Math.floor((validTo - Date.now()) / 86_400_000) : null,
        checkedAt: s.securityCheckedAt?.getTime() ?? null,
      },
    };
  });

  // The latest failure's message, for the System line.
  const [lastFailure] = failedJobs.length
    ? await db.select({ error: jobRuns.error }).from(jobRuns).where(eq(jobRuns.jobId, failedJobs[0]!.id)).orderBy(desc(jobRuns.startedAt)).limit(1)
    : [];
  const visibilityRun = runs[0];
  const vis = visibilityRun?.metrics as { answered?: number; mentioned?: number } | null | undefined;

  const summary: DashboardSummary = {
    product: { id: product.id, name: product.name, intel: product.intelStatus, intelUpdatedAt: product.intelUpdatedAt?.getTime() ?? null },
    marketing: {
      moves: { total: [...moves.values()].reduce((a, b) => a + b, 0), done: (moves.get("done") ?? 0) + (moves.get("skipped") ?? 0), open: moves.get("open") ?? 0 },
      inbox: { review: (inbox.get("drafted") ?? 0) + (inbox.get("failed") ?? 0), working: (inbox.get("new") ?? 0) + (inbox.get("drafting") ?? 0), posted30: Number(posted30[0]?.n ?? 0) },
      content: { drafts: pieces.get("draft") ?? 0, writing: pieces.get("drafting") ?? 0, posted30: Number(piecesPosted30[0]?.n ?? 0) },
      ads: { running: campaigns.get("running") ?? 0, total: [...campaigns.values()].reduce((a, b) => a + b, 0) },
      roadmap: { todo: roadmap.get("todo") ?? 0, doing: roadmap.get("doing") ?? 0 },
      web: web && sessions !== null ? { source: web, sessions, previous: sessionsBefore, keyEvents: keyEvents ?? 0 } : null,
      mrr,
      signups30,
    },
    sites: siteStatus,
    search: { connected: searchConnected, ...search },
    visibility: visibilityRun && vis?.answered ? { mentioned: vis.mentioned ?? 0, answered: vis.answered, at: visibilityRun.at.getTime() } : null,
    system: {
      hasKey,
      spent,
      budget,
      running: Number(running[0]?.n ?? 0),
      failed: {
        count: failedJobs.length,
        latest: failedJobs[0] ? { label: QUEUE_LABELS[failedJobs[0].queue] ?? failedJobs[0].queue, error: lastFailure?.error ?? null, at: failedJobs[0].at.getTime() } : null,
      },
      connectionErrors: conns.filter((c) => c.status === "error").map((c) => ({ kind: c.kind, error: c.lastError })),
    },
    attention: [],
  };
  summary.attention = attentionFor(summary, adSuggestion[0] ?? null).filter((a) => !(opts.demo && a.title === "Add an AI key"));
  return summary;
}

/** What needs the owner, most urgent first: broken things, then risks, then work waiting. */
function attentionFor(s: DashboardSummary, ad: { title: string; why: string; campaignId: string; campaignName: string; verdict: string } | null): Attention[] {
  const out: Attention[] = [];
  const add = (a: Attention) => out.push(a);
  const site = (href: string, id: string) => `${href}?site=${id}`;

  if (!s.system.hasKey) add({ module: "system", tone: "bad", title: "Add an AI key", detail: "Intel, scoring, drafts and fixes need a Claude or OpenAI key.", href: "/settings" });
  if (s.system.budget > 0 && s.system.spent >= s.system.budget)
    add({ module: "system", tone: "bad", title: "AI budget reached", detail: `$${s.system.spent.toFixed(2)} of $${s.system.budget} this month; AI work is paused until you raise it.`, href: "/settings" });
  for (const c of s.system.connectionErrors)
    add({ module: "marketing", tone: "bad", title: `${CONNECTION_LABEL[c.kind] ?? c.kind} isn't connecting`, detail: c.error ?? "The last sync failed.", href: "/settings?tab=products" });
  if (s.product.intel === "failed") add({ module: "marketing", tone: "bad", title: "Intel failed", detail: "Scoring, drafts and plans use it. Try building it again.", href: "/intel" });

  for (const x of s.sites) {
    if (x.security.critical + x.security.high > 0)
      add({
        module: "security",
        tone: "bad",
        title: `${plural(x.security.critical + x.security.high, "serious security finding")} on ${x.name}`,
        detail: [x.security.critical && `${x.security.critical} critical`, x.security.high && `${x.security.high} high`].filter(Boolean).join(", ") + ".",
        href: site("/security/findings", x.id),
      });
    if (x.security.certDays !== null && x.security.certDays < 14)
      add({
        module: "security",
        tone: "bad",
        title: x.security.certDays < 0 ? `${x.name}'s certificate has expired` : `${x.name}'s certificate expires in ${plural(x.security.certDays, "day")}`,
        detail: "Browsers will warn visitors. Renew it with your host.",
        href: site("/security", x.id),
      });
    if (x.a11y.critical > 0)
      add({ module: "accessibility", tone: "bad", title: `${plural(x.a11y.critical, "critical accessibility issue")} on ${x.name}`, detail: "These block some people from using the site.", href: site("/accessibility/issues", x.id) });
    if (x.a11y.lastScanAt === null) add({ module: "accessibility", tone: "warn", title: `Scan ${x.name}`, detail: "It hasn't been checked yet.", href: site("/accessibility", x.id) });
    if (x.seo.high > 0) add({ module: "seo", tone: "warn", title: `${plural(x.seo.high, "high-priority search problem")} on ${x.name}`, detail: "From Site health.", href: site("/seo/health", x.id) });
    if (x.seo.aiBlocked) add({ module: "seo", tone: "warn", title: `Some AI search is blocked on ${x.name}`, detail: "robots.txt keeps some AI crawlers out.", href: site("/seo", x.id) });
  }

  if (s.system.failed.count > 0)
    add({
      module: "system",
      tone: "warn",
      title: `${plural(s.system.failed.count, "background job")} failed this week`,
      detail: s.system.failed.latest ? `Latest: ${s.system.failed.latest.label}${s.system.failed.latest.error ? `: ${s.system.failed.latest.error}` : ""}` : "",
      href: "/system",
    });
  if (s.system.budget > 0 && s.system.spent < s.system.budget && s.system.spent >= 0.8 * s.system.budget)
    add({ module: "system", tone: "warn", title: "AI budget nearly used", detail: `$${s.system.spent.toFixed(2)} of $${s.system.budget} this month.`, href: "/settings" });
  if (s.product.intel === "none") add({ module: "marketing", tone: "warn", title: "Build intel", detail: "Startica needs to know the product before it can find conversations or plan.", href: "/intel" });
  if (ad) add({ module: "marketing", tone: ad.verdict === "stop" ? "bad" : "warn", title: `${ad.title} in ${ad.campaignName}`, detail: ad.why, href: `/ads/${ad.campaignId}/results` });
  if (s.marketing.inbox.review > 0)
    add({ module: "marketing", tone: "warn", title: `${plural(s.marketing.inbox.review, "reply", "replies")} to review`, detail: "Drafted and waiting in the Inbox.", href: "/inbox" });
  if (s.marketing.moves.open > 0) add({ module: "marketing", tone: "warn", title: `${plural(s.marketing.moves.open, "move")} left today`, detail: "On Today.", href: "/today" });

  // Broken things first; otherwise the order above.
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "bad" ? -1 : 1));
}
