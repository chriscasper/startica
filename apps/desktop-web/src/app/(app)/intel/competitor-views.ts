import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { hasAiKey } from "@startica/core/ai/client";
import { BENCHMARK_LABEL } from "@startica/core/benchmarks/sources";
import { loadActivity, type ActivityItem } from "@startica/core/competitors/activity";
import { briefById, latestBriefs, nextResearch, pastBriefs, periodTitle, type BriefRow } from "@startica/core/competitors/briefs";
import { LINK_HOW, LINK_LABEL, linkChannel } from "@startica/core/competitors/people";
import { CHECK_LABEL, lastChecked, loadWatchSettings, PERIOD_LABEL, RESEARCH_LABEL, RESEARCH_RUN_USD, researchDueAt, usd, watchEstimate } from "@startica/core/competitors/settings";
import * as schema from "@startica/db/schema";
import { db } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import type { AccountView, ActivityView, BriefView, LinkView, PersonView, WatchSettingsView } from "./competitor-ui";

/** View shapes for the competitor watch (the competitor page and Intel → Following). */

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null);
const dayTime = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const linkView = (l: schema.PersonLink): LinkView => ({ kind: l.kind, label: LINK_LABEL[l.kind], url: l.url, how: LINK_HOW[linkChannel(l)] });

export const accountView = (a: typeof schema.competitorAccounts.$inferSelect): AccountView => ({
  id: a.id,
  channel: a.channel,
  label: BENCHMARK_LABEL[a.channel],
  handle: a.channel === "rss" ? a.handle.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : a.handle,
  url: a.url,
  status: a.status,
  lastError: a.lastError,
  checked: day(a.lastCheckedAt),
  brief: a.brief,
  briefed: day(a.briefedAt),
});

export const activityView = (i: ActivityItem): ActivityView => ({
  id: i.id,
  competitorId: i.competitorId,
  competitor: i.competitor,
  who: i.person ? `${i.person}${i.role ? `, ${i.role}` : ""}` : (i.competitor ?? ""),
  channel: BENCHMARK_LABEL[i.channel as schema.BenchmarkChannel] ?? i.channel,
  url: i.url,
  title: i.title,
  text: i.text,
  when: day(i.postedAt),
  engagement: i.engagement,
  seen: i.seen,
  kind: i.kind,
  relevance: i.relevance,
  relevanceWhy: i.relevanceWhy,
});

/** Why AI buttons are disabled, or undefined when they can run. */
export async function aiBlocked(): Promise<string | undefined> {
  if (desktopApp().demo) return "AI research is off in the demo";
  if (!(await hasAiKey())) return "Add an AI key in Settings → General → AI";
  return undefined;
}

/** A competitor's people with their accounts, and the company's own followed accounts. */
export async function peopleAndAccounts(competitorId: string): Promise<{ people: PersonView[]; company: AccountView[] }> {
  const d = await db();
  const [people, accounts] = await Promise.all([
    d.select().from(schema.competitorPeople).where(eq(schema.competitorPeople.competitorId, competitorId)).orderBy(asc(schema.competitorPeople.createdAt)),
    d
      .select()
      .from(schema.competitorAccounts)
      .where(and(eq(schema.competitorAccounts.competitorId, competitorId), inArray(schema.competitorAccounts.channel, ["bluesky", "mastodon", "reddit", "hackernews", "rss", "page", "search"])))
      .orderBy(asc(schema.competitorAccounts.createdAt)),
  ]);
  return {
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      why: p.why,
      status: p.status,
      source: p.source,
      links: p.links.map(linkView),
      accounts: accounts.filter((a) => a.personId === p.id).map(accountView),
      brief: p.status === "following" ? p.brief : null,
    })),
    company: accounts.filter((a) => !a.personId).map(accountView),
  };
}

export async function activityViews(productId: string, competitorId?: string, limit = 60, relevantOnly = false): Promise<ActivityView[]> {
  return (await loadActivity(productId, { competitorId, limit, relevantOnly })).map(activityView);
}

export const briefView = (row: BriefRow): BriefView => ({
  id: row.id,
  period: row.period,
  title: periodTitle(row.period, row.periodStart, row.since),
  status: row.status,
  error: row.error,
  updated: dayTime(row.until > row.createdAt ? row.until : row.createdAt),
  posts: row.posts,
  seen: row.seenAt !== null,
  closed: row.closed,
  digest: row.digest,
});

/** The brief shown on Following (the period asked for, or a past one by id) and the past ones of its period. */
export async function briefsView(productId: string, asked: { period?: string; id?: string }) {
  const settings = await loadWatchSettings(productId);
  const latest = await latestBriefs(productId);
  const picked = asked.id ? await briefById(productId, asked.id) : null;
  const period = picked?.period ?? schema.briefPeriods.find((p) => p === asked.period && settings.periods.includes(p)) ?? settings.periods[0] ?? "week";
  const shown = picked ?? latest[period] ?? null;
  const past = (await pastBriefs(productId, period, 13)).filter((b) => b.id !== shown?.id).slice(0, 12);
  return {
    periods: settings.periods.map((p) => ({ period: p, label: PERIOD_LABEL[p], unread: Boolean(latest[p] && latest[p]!.status === "ready" && !latest[p]!.seenAt) })),
    period,
    brief: shown ? briefView(shown) : null,
    past: past.map((b) => ({ id: b.id, title: periodTitle(b.period, b.periodStart, b.since) })),
  };
}

export async function watchSettingsView(workspaceId: string, productId: string): Promise<WatchSettingsView> {
  const settings = await loadWatchSettings(productId);
  const [estimate, next, checked] = await Promise.all([watchEstimate(workspaceId, productId, settings), nextResearch(productId, settings.researchEvery), lastChecked(productId)]);
  const run = estimate.researchRun;
  return {
    settings,
    checkOptions: Object.entries(CHECK_LABEL).map(([value, label]) => ({ value, label })),
    researchOptions: Object.entries(RESEARCH_LABEL).map(([value, label]) => ({ value, label })),
    periodOptions: schema.briefPeriods.map((p) => ({ value: p, label: PERIOD_LABEL[p] })),
    lines: estimate.lines.map((l) => ({ label: l.label, usd: usd(l.usd) })),
    monthly: usd(estimate.monthlyUsd),
    researchRun: run.competitors ? `${usd(run.low)} to ${usd(run.high)} for ${run.competitors === 1 ? "1 researched competitor" : `${run.competitors} researched competitors`} (about ${usd(RESEARCH_RUN_USD.low)} to ${usd(RESEARCH_RUN_USD.high)} each)` : null,
    nextResearch: next ? `${next.name}, ${next.at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : null,
    lastRead: checked ? dayTime(checked) : null,
  };
}

/** "Next research: Jan 22 (about $0.30 to $0.80)" for a competitor page, or null when it isn't scheduled. */
export async function nextResearchLine(productId: string, profiledAt: Date | null): Promise<string | null> {
  const at = researchDueAt((await loadWatchSettings(productId)).researchEvery, profiledAt);
  if (!at) return null;
  return `Next research ${at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, about ${usd(RESEARCH_RUN_USD.low)} to ${usd(RESEARCH_RUN_USD.high)}`;
}
