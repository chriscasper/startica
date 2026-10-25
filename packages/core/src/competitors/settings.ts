import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getSetting, setSetting } from "@startica/db/bootstrap";
import { getDb } from "@startica/db/client";
import { briefPeriods, competitorAccounts, competitorPeople, competitors, type BriefPeriod } from "@startica/db/schema";
import { taskModel } from "../ai/client.ts";
import { estimateCostUsd, type TokenUsage } from "../ai/pricing.ts";

/**
 * How the competitor watch runs for a product (ARCHITECTURE.md section 3, "Competitor watch";
 * Intel → Following → Briefs): which period briefs are written, how often followed links are read
 * and briefed, and how often researched competitors are researched again. Owner decisions
 * 2026-10-24: every period on, read daily, research again only when switched on (monthly, quarterly or every
 * 6 months), each with its estimated cost.
 */

export const CHECK_EVERY = { "6h": 6, "1d": 24, "2d": 48, "1w": 168 } as const;
export type CheckEvery = keyof typeof CHECK_EVERY;
export const CHECK_LABEL: Record<CheckEvery, string> = { "6h": "Every 6 hours", "1d": "Every day", "2d": "Every 2 days", "1w": "Every week" };

export const RESEARCH_EVERY = { "1m": 30, "3m": 91, "6m": 182, never: null } as const;
export type ResearchEvery = keyof typeof RESEARCH_EVERY;
export const RESEARCH_LABEL: Record<ResearchEvery, string> = { "1m": "Every month", "3m": "Every quarter", "6m": "Every 6 months", never: "Only when I click" };

export const PERIOD_LABEL: Record<BriefPeriod, string> = { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" };

export const watchSettings = z.object({
  periods: z.array(z.enum(briefPeriods)).default([...briefPeriods]),
  checkEvery: z.enum(Object.keys(CHECK_EVERY) as [CheckEvery, ...CheckEvery[]]).default("1d"),
  researchEvery: z.enum(Object.keys(RESEARCH_EVERY) as [ResearchEvery, ...ResearchEvery[]]).default("never"),
});
export type WatchSettings = z.infer<typeof watchSettings>;

const key = (productId: string) => `competitor_watch:${productId}`;
const checkedKey = (productId: string) => `competitor_checked:${productId}`;

export async function loadWatchSettings(productId: string): Promise<WatchSettings> {
  const parsed = watchSettings.safeParse((await getSetting<unknown>(key(productId))) ?? {});
  return parsed.success ? parsed.data : watchSettings.parse({});
}

export async function saveWatchSettings(productId: string, input: z.input<typeof watchSettings>): Promise<WatchSettings> {
  const v = watchSettings.parse(input);
  // Shortest period first, the way they're shown.
  const value = { ...v, periods: briefPeriods.filter((p) => v.periods.includes(p)) };
  await setSetting(key(productId), value);
  return value;
}

/** When the scheduled read last ran for the product. */
export async function lastChecked(productId: string): Promise<Date | null> {
  const at = await getSetting<string>(checkedKey(productId));
  return at ? new Date(at) : null;
}

export async function markChecked(productId: string, at: Date): Promise<void> {
  await setSetting(checkedKey(productId), at.toISOString());
}

/** Whether the scheduled read is due (the schedule runs hourly; half an hour early counts). */
export function checkDue(every: CheckEvery, last: Date | null, now: Date): boolean {
  return !last || now.getTime() - last.getTime() >= (CHECK_EVERY[every] - 0.5) * 3_600_000;
}

/** When a researched competitor is due to be researched again, or null when it isn't on a schedule. */
export function researchDueAt(every: ResearchEvery, profiledAt: Date | null): Date | null {
  const days = RESEARCH_EVERY[every];
  if (days === null || !profiledAt) return null;
  return new Date(profiledAt.getTime() + days * 86_400_000);
}

// --- Cost estimates -------------------------------------------------------------------------------

/** One in-depth research run, measured on both providers (docs: Costs). */
export const RESEARCH_RUN_USD = { low: 0.3, high: 0.8 };

// Rough token counts per call, for the estimate.
const usage = (inputTokens: number, outputTokens: number, webSearchRequests = 0): TokenUsage => ({ inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, webSearchRequests });
const LINK_BRIEF = usage(4_000, 600);
const PERSON_BRIEF = usage(3_000, 500);
const SEARCH_NOTES = usage(12_000, 1_500, 3);
const RELEVANCE_BATCH = usage(5_000, 1_200);
const PERIOD_BRIEF = usage(12_000, 1_500);
/** Posts scored a month per followed account (a guess; quiet accounts score fewer). */
const POSTS_PER_ACCOUNT_MONTH = 20;
const DAYS_PER_MONTH = 30.4;

export type WatchEstimate = {
  /** What's followed now. */
  counts: { links: number; searchLinks: number; people: number; researched: number };
  /** Per part, in US dollars a month, at most (briefs are only rewritten when something new arrived). */
  lines: { label: string; usd: number }[];
  monthlyUsd: number;
  /** One re-research run for every researched competitor, low to high. */
  researchRun: { low: number; high: number; competitors: number };
};

/** Updates of each period's brief in a month at most: after reads with something new, plus the final version. */
export function periodUpdatesPerMonth(period: BriefPeriod, checksPerMonth: number): number {
  switch (period) {
    case "day":
      return Math.min(checksPerMonth, 4 * DAYS_PER_MONTH) + DAYS_PER_MONTH;
    case "week":
      return Math.min(checksPerMonth, DAYS_PER_MONTH) + DAYS_PER_MONTH / 7;
    case "month":
      return Math.min(checksPerMonth, DAYS_PER_MONTH / 7) + 1;
    case "year":
      return Math.min(checksPerMonth, 1) + 1 / 12;
  }
}

/** What the watch costs a month at these settings, from what the product follows now. */
export async function watchEstimate(workspaceId: string, productId: string, settings: WatchSettings): Promise<WatchEstimate> {
  const db = getDb();
  const [accounts, people, researched] = await Promise.all([
    db
      .select({ channel: competitorAccounts.channel, n: sql<number>`count(*)` })
      .from(competitorAccounts)
      .where(and(eq(competitorAccounts.productId, productId), isNotNull(competitorAccounts.competitorId), inArray(competitorAccounts.channel, ["bluesky", "mastodon", "reddit", "hackernews", "rss", "page", "search"])))
      .groupBy(competitorAccounts.channel),
    db.select({ n: sql<number>`count(*)` }).from(competitorPeople).where(and(eq(competitorPeople.productId, productId), eq(competitorPeople.status, "following"))),
    db.select({ n: sql<number>`count(*)` }).from(competitors).where(and(eq(competitors.productId, productId), isNotNull(competitors.profiledAt))),
  ]);
  const searchLinks = Number(accounts.find((a) => a.channel === "search")?.n ?? 0);
  const links = accounts.reduce((n, a) => n + Number(a.n), 0) - searchLinks;
  const counts = { links, searchLinks, people: Number(people[0]?.n ?? 0), researched: Number(researched[0]?.n ?? 0) };

  const ctx = { workspaceId };
  const [draft, score, research] = await Promise.all([taskModel(ctx, "draft"), taskModel(ctx, "score"), taskModel(ctx, "research")]);
  const cost = (model: string, u: TokenUsage) => estimateCostUsd(model, u);
  const checks = (DAYS_PER_MONTH * 24) / CHECK_EVERY[settings.checkEvery];
  // Link and person briefs are rewritten at most once a day; web-search links at most once a week.
  const briefsPerMonth = Math.min(checks, DAYS_PER_MONTH);
  const lines = [
    { label: `Link briefs (${counts.links} links)`, usd: counts.links * briefsPerMonth * cost(draft.model, LINK_BRIEF) },
    { label: `Web-search briefs (${counts.searchLinks} LinkedIn or X links, weekly)`, usd: counts.searchLinks * (DAYS_PER_MONTH / 7) * (cost(research.model, SEARCH_NOTES) + cost(draft.model, LINK_BRIEF)) },
    { label: `People briefs (${counts.people} followed)`, usd: counts.people * briefsPerMonth * cost(draft.model, PERSON_BRIEF) },
    { label: "Relevance of new posts", usd: Math.ceil(((counts.links + counts.searchLinks) * POSTS_PER_ACCOUNT_MONTH) / 25) * cost(score.model, RELEVANCE_BATCH) },
    ...settings.periods.map((p) => ({ label: `${PERIOD_LABEL[p]} briefs`, usd: periodUpdatesPerMonth(p, checks) * cost(draft.model, PERIOD_BRIEF) })),
  ];
  const days = RESEARCH_EVERY[settings.researchEvery];
  const researchRun = { low: counts.researched * RESEARCH_RUN_USD.low, high: counts.researched * RESEARCH_RUN_USD.high, competitors: counts.researched };
  if (days !== null && counts.researched > 0) lines.push({ label: `Research again (${counts.researched} competitors, ${RESEARCH_LABEL[settings.researchEvery].toLowerCase()})`, usd: (researchRun.high * DAYS_PER_MONTH) / days });
  // Nothing followed means nothing to brief.
  const active = counts.links + counts.searchLinks + counts.people > 0;
  const shown = lines.filter((l) => l.usd > 0 && (active || l.label.startsWith("Research again")));
  return { counts, lines: shown, monthlyUsd: shown.reduce((n, l) => n + l.usd, 0), researchRun };
}

/** "$0.42", "under $0.01". */
export const usd = (n: number) => (n > 0 && n < 0.01 ? "under $0.01" : `$${n < 10 ? n.toFixed(2) : Math.round(n)}`);
