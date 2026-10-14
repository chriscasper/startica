import { and, asc, desc, eq, gte, inArray, lte, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { adCampaigns, adGroups, ads, adSpend, dailyMoves, metricsSnapshots, roadmapItems, type AdCopy } from "@startica/db/schema";
import { webSource } from "../metrics/web.ts";
import type { AdCampaign } from "./campaigns.ts";

/**
 * Ad results (ARCHITECTURE.md section 8.6, AD3) and what to do next (AD4). Visits and key events
 * come from GA4 or Umami by utm_content (each ad's id, see checks.ts adUrl); spend is
 * entered by hand from the ad manager. Suggestions are rules, not AI: stop, keep, scale or
 * rewrite each ad, with the numbers behind them.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const localDay = (d: Date) => d.toLocaleDateString("en-CA");
const parseDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
/** Days from a to b, both included. */
export const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400_000) + 1;
export const addDays = (day: string, n: number) => {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return localDay(d);
};

// --- Spend -------------------------------------------------------------------------------

export const spendInput = z
  .object({
    ad_id: z.string().trim().default(""),
    start_day: z.string().regex(DAY, "Pick the first day"),
    end_day: z.string().regex(DAY, "Pick the last day"),
    amount: z.coerce.number({ error: "Enter what you spent" }).min(0, "Spend can't be negative").max(10_000_000),
    clicks: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).optional()),
    impressions: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).optional()),
  })
  .refine((v) => v.end_day >= v.start_day, { message: "The last day comes after the first", path: ["end_day"] })
  .refine((v) => v.end_day <= localDay(new Date()), { message: "Spend can't be in the future", path: ["end_day"] });

async function adInCampaign(campaignId: string, adId: string): Promise<string | null> {
  if (!adId) return null;
  const [row] = await getDb()
    .select({ id: ads.id })
    .from(ads)
    .innerJoin(adGroups, eq(adGroups.id, ads.groupId))
    .where(and(eq(ads.id, adId), eq(adGroups.campaignId, campaignId)));
  if (!row) throw new Error("That ad isn't in this campaign");
  return row.id;
}

export async function addSpend(campaign: AdCampaign, input: z.infer<typeof spendInput>): Promise<void> {
  await getDb()
    .insert(adSpend)
    .values({
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      adId: await adInCampaign(campaign.id, input.ad_id),
      startDay: input.start_day,
      endDay: input.end_day,
      amount: input.amount,
      clicks: input.clicks ?? null,
      impressions: input.impressions ?? null,
    });
}

export async function deleteSpend(workspaceId: string, spendId: string): Promise<void> {
  await getDb()
    .delete(adSpend)
    .where(and(eq(adSpend.id, spendId), eq(adSpend.workspaceId, workspaceId)));
}

export async function setTargetCost(campaign: AdCampaign, value: number | null): Promise<void> {
  await getDb().update(adCampaigns).set({ targetCost: value }).where(eq(adCampaigns.id, campaign.id));
}

// --- Results -----------------------------------------------------------------------------

export type Totals = { spend: number; visits: number; results: number; clicks: number | null; impressions: number | null };
export type AdResult = Totals & { adId: string; label: string; group: string; copy: AdCopy; cpa: number | null; costPerVisit: number | null };
export type Window = { from: string; to: string };

const empty = (): Totals => ({ spend: 0, visits: 0, results: 0, clicks: null, impressions: null });

/** The part of a spend entry inside the window, by days (spend is spread evenly over its days). */
export function spendInWindow(entry: { startDay: string; endDay: string; amount: number; clicks: number | null; impressions: number | null }, w: Window) {
  const from = entry.startDay > w.from ? entry.startDay : w.from;
  const to = entry.endDay < w.to ? entry.endDay : w.to;
  if (from > to) return null;
  const share = daysBetween(from, to) / daysBetween(entry.startDay, entry.endDay);
  return {
    amount: entry.amount * share,
    clicks: entry.clicks == null ? null : Math.round(entry.clicks * share),
    impressions: entry.impressions == null ? null : Math.round(entry.impressions * share),
  };
}

const addNullable = (a: number | null, b: number | null) => (b == null ? a : (a ?? 0) + b);

export type CampaignResults = {
  window: Window;
  source: "ga4" | "umami" | null;
  ads: AdResult[];
  /** Spend entered for the whole campaign, not one ad. */
  unassignedSpend: number;
  total: Totals & { cpa: number | null };
};

/** Each ad's visits, results and spend in a window of local days (inclusive). */
export async function campaignResults(campaign: AdCampaign, window: Window): Promise<CampaignResults> {
  const db = getDb();
  const groups = await db.select().from(adGroups).where(eq(adGroups.campaignId, campaign.id)).orderBy(asc(adGroups.position));
  const adRows = groups.length
    ? await db
        .select()
        .from(ads)
        .where(inArray(ads.groupId, groups.map((g) => g.id)))
        .orderBy(asc(ads.createdAt))
    : [];
  const source = await webSource(campaign.productId);
  const metrics =
    source && adRows.length
      ? await db
          .select({ metric: metricsSnapshots.metric, dimension: metricsSnapshots.dimension, value: metricsSnapshots.value })
          .from(metricsSnapshots)
          .where(
            and(
              eq(metricsSnapshots.productId, campaign.productId),
              eq(metricsSnapshots.source, source),
              inArray(metricsSnapshots.metric, ["sessions", "key_events"]),
              inArray(
                metricsSnapshots.dimension,
                adRows.map((a) => `utm_content:${a.id}`),
              ),
              gte(metricsSnapshots.day, window.from),
              lte(metricsSnapshots.day, window.to),
            ),
          )
      : [];
  const spend = await db.select().from(adSpend).where(eq(adSpend.campaignId, campaign.id));

  const byAd = new Map<string, Totals>(adRows.map((a) => [a.id, empty()]));
  for (const m of metrics) {
    const t = byAd.get(m.dimension.slice("utm_content:".length));
    if (!t) continue;
    if (m.metric === "sessions") t.visits += Number(m.value);
    else t.results += Number(m.value);
  }
  let unassignedSpend = 0;
  const total = empty();
  for (const s of spend) {
    const part = spendInWindow(s, window);
    if (!part) continue;
    total.spend += part.amount;
    total.clicks = addNullable(total.clicks, part.clicks);
    total.impressions = addNullable(total.impressions, part.impressions);
    const t = s.adId ? byAd.get(s.adId) : null;
    if (!t) {
      unassignedSpend += part.amount;
      continue;
    }
    t.spend += part.amount;
    t.clicks = addNullable(t.clicks, part.clicks);
    t.impressions = addNullable(t.impressions, part.impressions);
  }
  const results: AdResult[] = adRows.map((a) => {
    const t = byAd.get(a.id)!;
    const group = groups.find((g) => g.id === a.groupId)!;
    const n = adRows.filter((x) => x.groupId === a.groupId).indexOf(a) + 1;
    total.visits += t.visits;
    total.results += t.results;
    return {
      ...t,
      adId: a.id,
      label: `${group.name}: ad ${n}`,
      group: group.name,
      copy: a.copy,
      cpa: t.spend > 0 && t.results > 0 ? t.spend / t.results : null,
      costPerVisit: t.spend > 0 && t.visits > 0 ? t.spend / t.visits : null,
    };
  });
  return { window, source, ads: results, unassignedSpend, total: { ...total, cpa: total.spend > 0 && total.results > 0 ? total.spend / total.results : null } };
}

/** The window since the first spend entered (or the last 30 days), up to today. */
export async function campaignWindow(campaign: AdCampaign, today = localDay(new Date())): Promise<Window> {
  const [first] = await getDb().select({ day: adSpend.startDay }).from(adSpend).where(eq(adSpend.campaignId, campaign.id)).orderBy(asc(adSpend.startDay)).limit(1);
  const from = first?.day ?? addDays(today, -29);
  return { from: from < addDays(today, -365) ? addDays(today, -365) : from, to: today };
}

export async function listSpend(campaignId: string) {
  return getDb().select().from(adSpend).where(eq(adSpend.campaignId, campaignId)).orderBy(desc(adSpend.startDay), desc(adSpend.createdAt));
}

// --- Suggestions (AD4) ---------------------------------------------------------------------

export type Verdict = "scale" | "keep" | "rewrite" | "stop" | "wait";
export type Suggestion = { adId: string; label: string; verdict: Verdict; title: string; why: string; guidance?: string };

/** Click-through rates below half of these suggest the ad isn't catching attention (rough industry medians). */
const CTR_MEDIAN: Record<AdCampaign["platform"], number> = { google: 0.03, meta: 0.009, reddit: 0.004 };

// In the ad account's currency (whatever the founder entered), so no symbol, as on the plan.
const money = (n: number) => (n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString("en-US"));

/** The cost per result the campaign aims for: the founder's, else the median of ads that have results. */
export function targetFor(campaign: Pick<AdCampaign, "targetCost">, results: AdResult[]): { value: number | null; set: boolean } {
  if (campaign.targetCost && campaign.targetCost > 0) return { value: campaign.targetCost, set: true };
  const cpas = results
    .map((r) => r.cpa)
    .filter((c): c is number => c != null)
    .sort((a, b) => a - b);
  if (cpas.length < 2) return { value: null, set: false };
  const mid = Math.floor(cpas.length / 2);
  return { value: cpas.length % 2 ? cpas[mid]! : (cpas[mid - 1]! + cpas[mid]!) / 2, set: false };
}

/**
 * One suggestion per ad. An ad is judged only after it has spent enough to tell: the
 * target cost per result or half its share of the test budget, whichever is more, at least 20.
 */
export function suggest(campaign: Pick<AdCampaign, "platform" | "targetCost" | "testBudget">, results: AdResult[]): Suggestion[] {
  const target = targetFor(campaign, results).value;
  const share = campaign.testBudget && results.length ? campaign.testBudget / results.length / 2 : 0;
  const enough = Math.max(20, target ?? 0, share);
  return results.map((r) => {
    const base = { adId: r.adId, label: r.label };
    if (r.spend < enough)
      return { ...base, verdict: "wait", title: `Keep ${r.label} running`, why: `${money(r.spend)} spent so far; it needs about ${money(enough)} before the numbers mean much.` };
    const ctr = r.clicks != null && r.impressions ? r.clicks / r.impressions : null;
    const lowCtr = ctr != null && ctr < CTR_MEDIAN[campaign.platform] / 2;
    const arrival = r.clicks ? r.visits / r.clicks : null;
    const landing = arrival != null && arrival < 0.5 ? ` Only ${Math.round(arrival * 100)}% of clicks arrived as visits: check the landing page loads quickly and the link keeps its utm tags.` : "";
    if (r.results === 0) {
      if (r.spend >= 2 * enough)
        return { ...base, verdict: "stop", title: `Stop ${r.label}`, why: `${money(r.spend)} spent, ${r.visits} visits and no results.${landing}` };
      return {
        ...base,
        verdict: "rewrite",
        title: `Rewrite ${r.label}`,
        why: `${money(r.spend)} spent and no results yet${lowCtr ? `, and few people click (${(ctr! * 100).toFixed(2)}% of views)` : ""}.${landing}`,
        guidance: lowCtr ? "Few people click this ad. Lead with the most specific benefit and a concrete detail; make the headline stand out from the others." : "People visit but don't sign up. Make the promise match the landing page exactly and set clearer expectations.",
      };
    }
    const cpa = r.cpa!;
    if (target == null) return { ...base, verdict: "keep", title: `Keep ${r.label}`, why: `${r.results} results at ${money(cpa)} each. Set a target cost per result to get stop and scale suggestions.` };
    if (cpa <= target * 0.8) return { ...base, verdict: "scale", title: `Scale ${r.label}`, why: `${money(cpa)} per result, under the ${money(target)} target. Raise its budget by 20–30% and watch that the cost holds.` };
    if (cpa <= target * 1.2) return { ...base, verdict: "keep", title: `Keep ${r.label}`, why: `${money(cpa)} per result, close to the ${money(target)} target.` };
    if (cpa > target * 2) return { ...base, verdict: "stop", title: `Stop ${r.label}`, why: `${money(cpa)} per result, more than twice the ${money(target)} target.${landing}` };
    return {
      ...base,
      verdict: "rewrite",
      title: `Rewrite ${r.label}`,
      why: `${money(cpa)} per result, above the ${money(target)} target${lowCtr ? `; few people click (${(ctr! * 100).toFixed(2)}%)` : ""}.${landing}`,
      guidance: lowCtr ? "Few people click this ad. Lead with the most specific benefit and make the headline stand out." : "It brings results, but each one costs too much. Make the promise more specific so the people who click are the ones who sign up.",
    };
  });
}

/** The weekly read-out: the last 7 days against the 7 before, in plain sentences. */
export function readOut(week: CampaignResults, before: CampaignResults, suggestions: Suggestion[]): string[] {
  const lines: string[] = [];
  const w = week.total;
  const b = before.total;
  if (w.spend === 0 && w.visits === 0) return ["No spend or visits in the last 7 days. Enter spend from the ad manager to see results."];
  lines.push(`Last 7 days: ${money(w.spend)} spent, ${w.visits} visits, ${w.results} results${w.cpa != null ? ` at ${money(w.cpa)} each` : ""}.`);
  if (b.spend > 0 || b.results > 0) {
    if (w.cpa != null && b.cpa != null) {
      const change = (w.cpa - b.cpa) / b.cpa;
      lines.push(Math.abs(change) < 0.1 ? `Cost per result held steady (${money(b.cpa)} the week before).` : `Cost per result ${change < 0 ? "fell" : "rose"} ${Math.round(Math.abs(change) * 100)}% from ${money(b.cpa)}.`);
    } else lines.push(`The week before: ${money(b.spend)} spent, ${b.results} results.`);
  }
  const best = week.ads.filter((a) => a.cpa != null).sort((a, b) => a.cpa! - b.cpa!)[0];
  if (best) lines.push(`Best ad: ${best.label}, ${money(best.cpa!)} per result.`);
  const act = suggestions.filter((s) => s.verdict === "stop" || s.verdict === "scale" || s.verdict === "rewrite");
  if (act.length) lines.push(`To do: ${act.map((s) => s.title.replace(/^\w/, (c) => c.toLowerCase())).join("; ")}.`);
  if (week.unassignedSpend > 0) lines.push(`${money(week.unassignedSpend)} was entered for the whole campaign, so it isn't in the per-ad costs.`);
  return lines;
}

/** Results and suggestions for a campaign, as the Results screen and Today use them. */
export async function campaignReview(campaign: AdCampaign, today = localDay(new Date())) {
  const window = await campaignWindow(campaign, today);
  const all = await campaignResults(campaign, window);
  const week = await campaignResults(campaign, { from: addDays(today, -6), to: today });
  const before = await campaignResults(campaign, { from: addDays(today, -13), to: addDays(today, -7) });
  const suggestions = suggest(campaign, all.ads);
  return { all, week, before, suggestions, target: targetFor(campaign, all.ads), readOut: readOut(week, before, suggestions) };
}

/** The most pressing ad suggestion across the product's running campaigns, for Today. */
export async function topAdSuggestions(productId: string, limit = 2): Promise<(Suggestion & { campaignId: string; campaignName: string })[]> {
  const running = await getDb()
    .select()
    .from(adCampaigns)
    .where(and(eq(adCampaigns.productId, productId), inArray(adCampaigns.status, ["handed_off", "running"])));
  const rank: Record<Verdict, number> = { stop: 0, scale: 1, rewrite: 2, keep: 9, wait: 9 };
  const out: (Suggestion & { campaignId: string; campaignName: string })[] = [];
  for (const c of running) {
    const window = await campaignWindow(c);
    const { ads: results } = await campaignResults(c, window);
    for (const s of suggest(c, results)) if (rank[s.verdict] < 9) out.push({ ...s, campaignId: c.id, campaignName: c.name });
  }
  return out.sort((a, b) => rank[a.verdict] - rank[b.verdict]).slice(0, limit);
}

/** Puts a suggestion on the Roadmap (deduped by title). */
export async function suggestionToRoadmap(campaign: AdCampaign, s: Suggestion): Promise<string> {
  const db = getDb();
  const title = `${s.title} (${campaign.name})`;
  const [existing] = await db
    .select({ id: roadmapItems.id })
    .from(roadmapItems)
    .where(and(eq(roadmapItems.productId, campaign.productId), eq(roadmapItems.title, title)));
  if (existing) throw new Error("Already on the Roadmap");
  const [row] = await db
    .insert(roadmapItems)
    .values({
      workspaceId: campaign.workspaceId,
      productId: campaign.productId,
      stage: "revenue",
      title,
      why: s.why,
      playbook: "paid-conversion",
      successMetric: campaign.successMetric ?? "Cost per result at or under the target",
      nextStep: s.verdict === "stop" ? "Pause the ad in the ad manager" : s.verdict === "scale" ? "Raise the ad set's budget by 20–30%" : "Rewrite the ad in Startica and swap it in",
      priority: s.verdict === "stop" ? 1 : 2,
      source: "owner",
    })
    .returning({ id: roadmapItems.id });
  return row!.id;
}

/** Puts a suggestion on today's list (the same refId Today's own ad move uses, so it isn't added twice). */
export async function suggestionToToday(campaign: AdCampaign, s: Suggestion): Promise<void> {
  const db = getDb();
  const day = localDay(new Date());
  const refId = `${s.adId}:${s.verdict}`;
  const [existing] = await db
    .select({ id: dailyMoves.id })
    .from(dailyMoves)
    .where(and(eq(dailyMoves.productId, campaign.productId), eq(dailyMoves.day, day), eq(dailyMoves.refId, refId)));
  if (existing) throw new Error("Already on Today");
  const [last] = await db
    .select({ rank: max(dailyMoves.rank) })
    .from(dailyMoves)
    .where(and(eq(dailyMoves.productId, campaign.productId), eq(dailyMoves.day, day)));
  await db.insert(dailyMoves).values({
    workspaceId: campaign.workspaceId,
    productId: campaign.productId,
    day,
    rank: (last?.rank ?? 0) + 1,
    kind: "ads",
    title: `${s.title} in ${campaign.name}`,
    why: s.why,
    href: `/ads/${campaign.id}/results`,
    refId,
    source: "owner",
  });
}
