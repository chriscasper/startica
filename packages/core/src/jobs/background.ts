import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { adCampaigns, adCreatives, jobRuns, jobs, products, siteScans, sites } from "@startica/db/schema";
import { runningJobs } from "./cancel.ts";
import { SCHEDULES } from "./runner.ts";

/**
 * Everything waiting or running in the background, in words: what it is, why it's
 * running, how far along it is, where to see it and how to stop it. Read from the job
 * queue, like activity.ts. Shown by the header's status indicator and the System page.
 */

/** What each queue does, in words. */
export const QUEUE_LABELS: Record<string, string> = {
  ping: "Test job",
  intel_build: "Building intel",
  listen_scan: "Finding conversations",
  opportunity_score: "Scoring conversations",
  draft_generate: "Drafting replies",
  engagement_sync: "Checking engagement",
  metrics_sync: "Syncing analytics",
  roadmap_plan: "Planning the roadmap",
  audit_run: "Running an audit",
  voice_import: "Importing voice samples",
  voice_profile_build: "Building a voice",
  content_generate: "Writing content",
  content_topics: "Suggesting topics",
  site_scan: "Accessibility scan",
  site_page_check: "Accessibility page check",
  a11y_fix_suggest: "Suggesting an accessibility fix",
  a11y_review_assist: "Helping with a manual review",
  a11y_alt_review: "Reviewing alt text",
  a11y_summary: "Summarizing accessibility",
  site_content_check: "Checking documents and content",
  site_scan_due: "Looking for sites due a rescan",
  tracker_sync: "Syncing issues",
  security_recheck: "Security check",
  security_monitor: "Exposure monitoring",
  security_explain: "Explaining a security finding",
  security_report_import: "Importing a security report",
  security_intake_triage: "Triaging a security report",
  ad_plan: "Planning an ad campaign",
  ad_copy: "Rewriting an ad",
  ad_creative_ideas: "Suggesting creative ideas",
  ad_creative_image: "Drawing an ad picture",
  ad_creative_render: "Rendering ad sizes",
  ai_prompts_suggest: "Suggesting AI visibility questions",
  ai_visibility_run: "Asking AI assistants",
  opportunity_draft: "Drafting a fix",
  agent_check: "Checking agent readiness",
  offsite_check: "Reading pages AI answers cite",
};

/** Why a job of this queue runs, when it wasn't started by its schedule. */
const REASONS: Record<string, string> = {
  ping: "You ran a test job from the System page.",
  intel_build: "You asked for intel on the product: its audience, competitors and keywords.",
  listen_scan: "You started a scan for conversations about your product.",
  opportunity_score: "A scan found new conversations; each is scored to see whether it's worth a reply.",
  draft_generate: "Conversations scored high enough to be worth a reply.",
  engagement_sync: "Checking replies and votes on what you posted.",
  metrics_sync: "You connected or synced an analytics source.",
  roadmap_plan: "You asked for a new roadmap.",
  audit_run: "You started an audit.",
  voice_import: "You added writing samples for a voice.",
  voice_profile_build: "You asked for a voice to be built from its samples.",
  content_generate: "You asked for a piece of content.",
  content_topics: "You asked for topic ideas.",
  site_scan: "A full check of the site, started by you or by its rescan interval.",
  site_page_check: "You asked to recheck some pages.",
  a11y_fix_suggest: "You asked AI for a fix.",
  a11y_review_assist: "You asked AI to help with a manual check.",
  a11y_alt_review: "You asked AI to review the site's alt text.",
  a11y_summary: "You asked for a summary of the site's accessibility.",
  site_content_check: "You started a check of the site's documents and content.",
  tracker_sync: "A scan finished, and your issue tracker is set to follow it.",
  security_recheck: "You started a security check.",
  security_monitor: "You asked to check the site's exposure now.",
  security_explain: "You asked AI to explain a finding.",
  security_report_import: "You pasted a security report to import.",
  security_intake_triage: "A security report arrived and is being triaged.",
  ad_plan: "You asked for an ad plan.",
  ad_copy: "You asked for an ad to be rewritten.",
  ad_creative_ideas: "You asked for creative ideas.",
  ad_creative_image: "You asked for a picture to be drawn (this costs money).",
  ad_creative_render: "A creative changed, so every size is rendered again.",
  ai_prompts_suggest: "You asked for questions to track.",
  ai_visibility_run: "You asked AI assistants your questions (this costs money).",
  opportunity_draft: "You asked for a fix to be drafted.",
  agent_check: "You started an agent readiness check.",
  offsite_check: "You asked to read the pages AI answers cite.",
};

/** Where to see each queue's work. */
const PAGES: Record<string, string> = {
  ping: "/system",
  intel_build: "/intel",
  listen_scan: "/inbox",
  opportunity_score: "/inbox?tab=working",
  draft_generate: "/inbox?tab=working",
  engagement_sync: "/analytics",
  metrics_sync: "/analytics",
  roadmap_plan: "/roadmap",
  audit_run: "/roadmap",
  voice_import: "/content",
  voice_profile_build: "/content",
  content_generate: "/content",
  content_topics: "/content",
  site_scan: "/accessibility",
  site_page_check: "/accessibility",
  a11y_fix_suggest: "/accessibility/issues",
  a11y_review_assist: "/accessibility/review",
  a11y_alt_review: "/accessibility/images",
  a11y_summary: "/accessibility/reports",
  site_content_check: "/accessibility/content",
  site_scan_due: "/accessibility",
  tracker_sync: "/accessibility/issues",
  security_recheck: "/security",
  security_monitor: "/security/monitoring",
  security_explain: "/security/findings",
  security_report_import: "/security/findings",
  security_intake_triage: "/security/disclosure",
  ai_prompts_suggest: "/seo/ai",
  ai_visibility_run: "/seo/ai",
  opportunity_draft: "/seo/opportunities",
  agent_check: "/seo/agents",
  offsite_check: "/seo/offsite",
};

// Queues that run as many small jobs at once; they're shown as one line.
const GROUPED = new Set(["opportunity_score", "draft_generate", "ad_creative_render"]);

export type BackgroundTask = {
  /** The first job's id; stable while the task runs. */
  id: string;
  queue: string;
  label: string;
  /** What it's for: a product, site or campaign name, when the job names one. */
  subject: string | null;
  why: string;
  status: "running" | "waiting" | "stopping";
  /** When the running attempt started, else when it was queued (ms). */
  since: number;
  /** What the job last reported about itself. */
  progress: { channel?: string; pagesDone?: number; pagesTotal?: number } | null;
  /** How many jobs this line covers (grouped queues), and how many items they hold. */
  count: number;
  items: number | null;
  href: string | null;
  /** What Stop stops: the jobs, or a site scan (which also marks the scan cancelled). */
  stop: { jobIds: string[] } | { siteScan: string };
};

const str = (v: unknown) => (typeof v === "string" ? v : null);

/** A job the scheduler enqueued: a scheduled queue with nothing in its payload but the workspace. */
function scheduledAs(queue: string, payload: Record<string, unknown>) {
  if (Object.keys(payload).some((k) => k !== "workspaceId")) return null;
  return SCHEDULES.find((s) => s.queue === queue) ?? null;
}

export async function backgroundTasks(workspaceId: string): Promise<BackgroundTask[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.workspaceId, workspaceId), inArray(jobs.status, ["queued", "running"])))
    // rowid breaks ties: jobs queued in the same millisecond keep the order they were queued in.
    .orderBy(desc(jobs.createdAt), desc(sql`${jobs}.rowid`))
    .limit(200);
  if (rows.length === 0) return [];

  const running = rows.filter((r) => r.status === "running").map((r) => r.id);
  const runs = running.length
    ? await db
        .select({ jobId: jobRuns.jobId, startedAt: jobRuns.startedAt, result: jobRuns.result })
        .from(jobRuns)
        .where(and(inArray(jobRuns.jobId, running), eq(jobRuns.status, "running")))
        .orderBy(desc(jobRuns.startedAt))
    : [];
  const runOf = (jobId: string) => runs.find((r) => r.jobId === jobId);

  // Names for what the jobs are about, looked up in one go per table.
  const ids = (key: string) => [...new Set(rows.map((r) => str(r.payload[key])).filter((v): v is string => Boolean(v)))];
  const [productRows, scanRows, creativeRows] = await Promise.all([
    ids("productId").length ? db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, ids("productId"))) : [],
    ids("scanId").length ? db.select({ id: siteScans.id, siteId: siteScans.siteId }).from(siteScans).where(inArray(siteScans.id, ids("scanId"))) : [],
    ids("creativeId").length ? db.select({ id: adCreatives.id, campaignId: adCreatives.campaignId }).from(adCreatives).where(inArray(adCreatives.id, ids("creativeId"))) : [],
  ]);
  const siteIds = [...new Set([...ids("siteId"), ...scanRows.map((s) => s.siteId)])];
  const campaignIds = [...new Set([...ids("campaignId"), ...creativeRows.map((c) => c.campaignId)])];
  const [siteRows, campaignRows] = await Promise.all([
    siteIds.length ? db.select({ id: sites.id, name: sites.name }).from(sites).where(inArray(sites.id, siteIds)) : [],
    campaignIds.length ? db.select({ id: adCampaigns.id, name: adCampaigns.name }).from(adCampaigns).where(inArray(adCampaigns.id, campaignIds)) : [],
  ]);
  const name = (list: { id: string; name: string }[], id: string | null) => (id ? (list.find((x) => x.id === id)?.name ?? null) : null);

  const tasks: BackgroundTask[] = [];
  const groups = new Map<string, BackgroundTask>();
  // Oldest first, so the line that has been going longest leads.
  for (const job of [...rows].reverse()) {
    const p = job.payload;
    const scanSite = scanRows.find((s) => s.id === str(p.scanId))?.siteId ?? null;
    const campaignId = str(p.campaignId) ?? creativeRows.find((c) => c.id === str(p.creativeId))?.campaignId ?? null;
    const subject = name(productRows, str(p.productId)) ?? name(siteRows, str(p.siteId) ?? scanSite) ?? name(campaignRows, campaignId);
    const run = runOf(job.id);
    const stopping = runningJobs().get(job.id)?.signal.aborted ?? false;
    const status = stopping ? "stopping" : job.status === "running" ? "running" : "waiting";
    const since = (run?.startedAt ?? job.createdAt).getTime();
    const items = Array.isArray(p.opportunityIds) ? p.opportunityIds.length : null;

    const group = GROUPED.has(job.queue) ? groups.get(job.queue) : undefined;
    if (group) {
      group.count += 1;
      if (items !== null) group.items = (group.items ?? 0) + items;
      if (status === "running" && group.status === "waiting") Object.assign(group, { status, since });
      if ("jobIds" in group.stop) group.stop.jobIds.push(job.id);
      continue;
    }

    const schedule = scheduledAs(job.queue, p);
    const why = schedule
      ? `Scheduled: runs ${schedule.when} while Startica is open.`
      : job.queue === "metrics_sync" && !p.connectionId && !p.productId
        ? "Syncing every connected analytics source."
        : (REASONS[job.queue] ?? "Started by Startica.");
    const page = PAGES[job.queue];
    const href =
      job.queue.startsWith("ad_") && campaignId
        ? `/ads/${campaignId}${job.queue.startsWith("ad_creative") ? "/creatives" : ""}`
        : job.queue.startsWith("ad_")
          ? "/ads"
          : (job.queue === "site_scan" || job.queue === "site_page_check") && scanSite
            ? `/accessibility?site=${scanSite}`
            : (page ?? null);
    const progress = (run?.result as { progress?: BackgroundTask["progress"] } | null)?.progress ?? null;
    const task: BackgroundTask = {
      id: job.id,
      queue: job.queue,
      label: QUEUE_LABELS[job.queue] ?? job.queue,
      subject,
      why,
      status,
      since,
      progress: progress && (progress.channel || progress.pagesTotal) ? { channel: progress.channel, pagesDone: progress.pagesDone, pagesTotal: progress.pagesTotal } : null,
      count: 1,
      items,
      href,
      stop: str(p.scanId) && (job.queue === "site_scan" || job.queue === "site_page_check") ? { siteScan: str(p.scanId)! } : { jobIds: [job.id] },
    };
    tasks.push(task);
    if (GROUPED.has(job.queue)) groups.set(job.queue, task);
  }
  // Running work first, then what's waiting, each oldest first.
  const rank = { running: 0, stopping: 1, waiting: 2 } as const;
  return tasks.sort((a, b) => rank[a.status] - rank[b.status]);
}
