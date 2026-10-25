import type { z } from "zod";
import type { AiContext } from "../ai/client.ts";
import { competitorDigestPayload, runCompetitorDigest } from "../competitors/briefs.ts";
import { competitorResearchPayload, runCompetitorResearch } from "../competitors/research.ts";
import {
  draftPayload,
  engagementPayload,
  listenScanPayload,
  runDraftGenerate,
  runEngagementSync,
  runListenScan,
  runOpportunityScore,
  scorePayload,
} from "../distribution/jobs.ts";
import {
  contentGeneratePayload,
  contentTopicsPayload,
  runContentGenerate,
  runContentTopics,
  runVoiceImport,
  runVoiceProfileBuild,
  voiceImportPayload,
  voiceProfilePayload,
} from "../content/jobs.ts";
import { creativeIdeasPayload, creativePayload, runCreativeIdeas, runCreativeImage, runCreativeRender } from "../ads/creative-jobs.ts";
import { calendarRemindPayload, runCalendarRemind } from "../content/calendar.ts";
import { contentImagePayload, runContentImageDraw, runContentImageRender } from "../content/image-jobs.ts";
import { contentPlanPayload, runContentPlan } from "../content/plan.ts";
import { adCopyPayload, adPlanPayload, runAdCopy, runAdPlan } from "../ads/jobs.ts";
import { promptsSuggestPayload, runPromptsSuggest, runVisibility, visibilityRunPayload } from "../visibility/jobs.ts";
import { draftPayload as opportunityDraftPayload, runOpportunityDraft } from "../opportunities/drafts.ts";
import { agentCheckPayload, runAgentCheck } from "../agents/run.ts";
import { offsiteCheckPayload, runOffsiteCheck } from "../offsite/check.ts";
import { pageCheckPayload, runPageCheck, runSiteScan, siteScanPayload } from "../a11y/scan.ts";
import { runScanDue, scanDuePayload } from "../a11y/track.ts";
import { contentPayload, runContentCheck } from "../a11y/documents.ts";
import { altPayload, fixPayload, reviewPayload, runAltReview, runFixSuggest, runReviewAssist, runSummary, summaryPayload } from "../a11y/ai.ts";
import { planPayload, runFixPlan } from "../a11y/fix-plan.ts";
import { auditPayload, runAudit } from "../growth/audits.ts";
import { runSecurityRecheck, securityRecheckPayload } from "../security/findings.ts";
import { monitorPayload, runMonitor } from "../security/monitor.ts";
import { explainPayload, importPayload, runSecurityExplain, runSecurityImport, runSecurityTriage, triagePayload } from "../security/ai.ts";
import { runTrackerSync, trackerSyncPayload } from "../trackers/trackers.ts";
import { chatReplyPayload, runChatReply } from "../chat/jobs.ts";
import { roadmapPlanPayload, runRoadmapPlan } from "../growth/roadmap.ts";
import { intelBuildPayload, runIntelBuild } from "../intel/build.ts";
import { analyticsSummaryPayload, runAnalyticsSummary } from "../metrics/summary.ts";
import { metricsSyncPayload, runMetricsSync } from "../metrics/sync.ts";
import { competitorSyncPayload, runCompetitorSync } from "../benchmarks/accounts.ts";
import { pingPayload, runPing } from "./ping.ts";

type JobDefinition<P extends z.ZodType> = {
  payload: P;
  run: (ctx: AiContext, payload: z.infer<P>) => Promise<unknown>;
  // Seconds a message stays hidden while being processed; must exceed the job's run time.
  visibilityTimeoutSeconds: number;
  // Total tries before the message is archived. Expensive AI jobs get 1 (rerun from the UI).
  maxAttempts: number;
};

export type Job = {
  // Validates the raw queue message against the job's schema, then runs it.
  execute: (ctx: AiContext, message: unknown) => Promise<unknown>;
  visibilityTimeoutSeconds: number;
  maxAttempts: number;
};

function defineJob<P extends z.ZodType>({ payload, run, ...settings }: JobDefinition<P>): Job {
  return { ...settings, execute: (ctx, message) => run(ctx, payload.parse(message)) };
}

// One entry per pgmq queue. Adding a queue also means creating it in a migration
// and adding it to the allow-list in public.enqueue_job.
export const jobs = {
  ping: defineJob({ payload: pingPayload, run: runPing, visibilityTimeoutSeconds: 120, maxAttempts: 3 }),
  intel_build: defineJob({
    payload: intelBuildPayload,
    run: runIntelBuild,
    visibilityTimeoutSeconds: 1800,
    maxAttempts: 1,
  }),
  // Reddit feeds allow ~1 request/minute, so a scan can take 15 minutes.
  listen_scan: defineJob({ payload: listenScanPayload, run: runListenScan, visibilityTimeoutSeconds: 2400, maxAttempts: 1 }),
  opportunity_score: defineJob({
    payload: scorePayload,
    run: runOpportunityScore,
    visibilityTimeoutSeconds: 600,
    maxAttempts: 2,
  }),
  draft_generate: defineJob({ payload: draftPayload, run: runDraftGenerate, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  // Reddit feeds allow ~1 request/minute, one per posted reply or piece.
  engagement_sync: defineJob({
    payload: engagementPayload,
    run: runEngagementSync,
    visibilityTimeoutSeconds: 2400,
    maxAttempts: 1,
  }),
  // A first sync reads the whole history: 16 months of Umami, one day at a time, takes about half an hour.
  metrics_sync: defineJob({ payload: metricsSyncPayload, run: runMetricsSync, visibilityTimeoutSeconds: 2 * 3600, maxAttempts: 1 }),
  // One AI call per product: weekly, or once per click.
  analytics_summary: defineJob({ payload: analyticsSummaryPayload, run: runAnalyticsSummary, visibilityTimeoutSeconds: 900, maxAttempts: 1 }),
  // Opus calls: run once per click or schedule, no silent retries.
  roadmap_plan: defineJob({ payload: roadmapPlanPayload, run: runRoadmapPlan, visibilityTimeoutSeconds: 900, maxAttempts: 1 }),
  audit_run: defineJob({ payload: auditPayload, run: runAudit, visibilityTimeoutSeconds: 1200, maxAttempts: 1 }),
  // Reddit feeds allow ~1 request/minute: a user import takes about 2 minutes.
  voice_import: defineJob({ payload: voiceImportPayload, run: runVoiceImport, visibilityTimeoutSeconds: 600, maxAttempts: 1 }),
  voice_profile_build: defineJob({ payload: voiceProfilePayload, run: runVoiceProfileBuild, visibilityTimeoutSeconds: 600, maxAttempts: 1 }),
  content_generate: defineJob({ payload: contentGeneratePayload, run: runContentGenerate, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  content_topics: defineJob({ payload: contentTopicsPayload, run: runContentTopics, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  // Content calendar: every 15 minutes, reminds once about planned posts that are due (no AI, never posts).
  calendar_remind: defineJob({ payload: calendarRemindPayload, run: runCalendarRemind, visibilityTimeoutSeconds: 120, maxAttempts: 1 }),
  // An AI content plan: one call per click, then one content_generate per slot.
  content_plan: defineJob({ payload: contentPlanPayload, run: runContentPlan, visibilityTimeoutSeconds: 600, maxAttempts: 1 }),
  // Social post images: the picture is an AI call (once per click); rendering is local and may retry once.
  content_image_image: defineJob({ payload: contentImagePayload, run: runContentImageDraw, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  content_image_render: defineJob({ payload: contentImagePayload, run: runContentImageRender, visibilityTimeoutSeconds: 300, maxAttempts: 2 }),
  // A full scan of 5,000 pages takes a few hours; quitting mid-scan resumes it (the lease expires, done pages are skipped).
  site_scan: defineJob({ payload: siteScanPayload, run: runSiteScan, visibilityTimeoutSeconds: 4 * 3600, maxAttempts: 1 }),
  // Its own queue, so Check a page never waits behind a full scan.
  site_page_check: defineJob({ payload: pageCheckPayload, run: runPageCheck, visibilityTimeoutSeconds: 3600, maxAttempts: 1 }),
  // Accessibility AI help (A3), on request: run once per click.
  a11y_fix_suggest: defineJob({ payload: fixPayload, run: runFixSuggest, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  a11y_review_assist: defineJob({ payload: reviewPayload, run: runReviewAssist, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  // Up to 50 images, one call each.
  a11y_alt_review: defineJob({ payload: altPayload, run: runAltReview, visibilityTimeoutSeconds: 1800, maxAttempts: 1 }),
  a11y_summary: defineJob({ payload: summaryPayload, run: runSummary, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  // Up to 25 issues in one call, so a longer answer than a single fix.
  a11y_fix_plan: defineJob({ payload: planPayload, run: runFixPlan, visibilityTimeoutSeconds: 600, maxAttempts: 1 }),
  // After full scans (A5): the site's PDFs and external links, one request a second per host.
  site_content_check: defineJob({ payload: contentPayload, run: runContentCheck, visibilityTimeoutSeconds: 3600, maxAttempts: 1 }),
  // Hourly: queues full scans for sites whose last one is older than their interval.
  site_scan_due: defineJob({ payload: scanDuePayload, run: runScanDue, visibilityTimeoutSeconds: 120, maxAttempts: 1 }),
  // Opens, closes and reopens GitHub/GitLab issues after a scan; at most 10 new issues a run.
  tracker_sync: defineJob({ payload: trackerSyncPayload, run: runTrackerSync, visibilityTimeoutSeconds: 600, maxAttempts: 2 }),
  // Reruns Security's site probes (a TLS handshake, a few GETs, DNS lookups) and refolds the findings.
  security_recheck: defineJob({ payload: securityRecheckPayload, run: runSecurityRecheck, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  // Exposure monitoring (S2): certificate logs, DNS, third-party scripts, vulnerability databases. Daily and after full scans.
  security_monitor: defineJob({ payload: monitorPayload, run: runMonitor, visibilityTimeoutSeconds: 900, maxAttempts: 1 }),
  // Security AI help (S4), on request: explain a finding, read another report, triage a reported problem.
  security_explain: defineJob({ payload: explainPayload, run: runSecurityExplain, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  security_report_import: defineJob({ payload: importPayload, run: runSecurityImport, visibilityTimeoutSeconds: 600, maxAttempts: 1 }),
  security_intake_triage: defineJob({ payload: triagePayload, run: runSecurityTriage, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  // Refine chats: one reply per message, streamed; web search can make it take a minute or two.
  chat_reply: defineJob({ payload: chatReplyPayload, run: runChatReply, visibilityTimeoutSeconds: 600, maxAttempts: 1 }),
  // AI calls: run once per click, no silent retries.
  ad_plan: defineJob({ payload: adPlanPayload, run: runAdPlan, visibilityTimeoutSeconds: 900, maxAttempts: 1 }),
  ad_copy: defineJob({ payload: adCopyPayload, run: runAdCopy, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  // Ads AD2: ideas and pictures are AI calls (once per click); rendering is local and may retry once.
  ad_creative_ideas: defineJob({ payload: creativeIdeasPayload, run: runCreativeIdeas, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  ad_creative_image: defineJob({ payload: creativePayload, run: runCreativeImage, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  ad_creative_render: defineJob({ payload: creativePayload, run: runCreativeRender, visibilityTimeoutSeconds: 300, maxAttempts: 2 }),
  ai_prompts_suggest: defineJob({ payload: promptsSuggestPayload, run: runPromptsSuggest, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  // 100 questions with web search can take half an hour; capped by cost, never retried.
  ai_visibility_run: defineJob({ payload: visibilityRunPayload, run: runVisibility, visibilityTimeoutSeconds: 3600, maxAttempts: 1 }),
  opportunity_draft: defineJob({ payload: opportunityDraftPayload, run: runOpportunityDraft, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  // Plain requests to the site's own pages; runs after each scan and on Check now.
  agent_check: defineJob({ payload: agentCheckPayload, run: runAgentCheck, visibilityTimeoutSeconds: 300, maxAttempts: 1 }),
  // Reads up to 30 pages AI answers cited, politely; after each AI visibility run and on Check now.
  offsite_check: defineJob({ payload: offsiteCheckPayload, run: runOffsiteCheck, visibilityTimeoutSeconds: 900, maxAttempts: 1 }),
  // Competitor benchmarks: public profile numbers, paced (Reddit ~1 request/minute); daily and on Check now.
  competitor_sync: defineJob({ payload: competitorSyncPayload, run: (ctx, p) => runCompetitorSync(ctx, p), visibilityTimeoutSeconds: 1800, maxAttempts: 1 }),
  // Competitor watch: web research on one competitor (the Research button or its schedule), never retried; and the briefs.
  competitor_research: defineJob({ payload: competitorResearchPayload, run: runCompetitorResearch, visibilityTimeoutSeconds: 1800, maxAttempts: 1 }),
  competitor_digest: defineJob({ payload: competitorDigestPayload, run: (ctx, p) => runCompetitorDigest(ctx, p), visibilityTimeoutSeconds: 1800, maxAttempts: 1 }),
} satisfies Record<string, Job>;

export type QueueName = keyof typeof jobs;
export const queueNames = Object.keys(jobs) as QueueName[];
