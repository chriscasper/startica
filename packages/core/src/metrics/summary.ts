import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { analyticsSummaries, connections, products, type AnalyticsSummaryBody } from "@startica/db/schema";
import { hasAiKey, runStructured, taskModel, type AiContext } from "../ai/client.ts";
import { loadProductContext } from "../distribution/context.ts";
import { jobByPayload } from "../jobs/cancel.ts";
import { loadAnalyticsReport, type AnalyticsReport, type Pair } from "./report.ts";

/**
 * The weekly analytics read-out (ARCHITECTURE.md section 8.2): every Monday after the morning
 * sync, and on request, the AI reads the last 7 full days next to the 7 before (with the last
 * 30 days for context) and writes what worked, what to watch and what to try next. The numbers
 * come from report.ts; the AI only interprets them and is told not to invent any.
 */

export const SUMMARY_PROMPT_VERSION = "analytics-summary@1";

export const SUMMARY_SYSTEM = `You are a growth advisor reading a small product's weekly analytics for its founder. You get the product, then the numbers: the last 7 full days next to the 7 days before, and the last 30 days for context, from web analytics, Stripe, the product's own database and what the founder posted through Startica.

Write for a busy founder: plain words, specific numbers, no hype, no filler.
- headline: one sentence, the single most important thing about this week.
- summary: two to four sentences on how the week went and why, naming the sources and pages behind the change.
- wins: up to three things that worked, each one sentence with its number.
- concerns: up to three things to watch, each one sentence with its number. Empty when nothing stands out.
- tryNext: one to three concrete things to do this week, each a short imperative title and one sentence on why, tied to the numbers (for example, a community that sent visits that converted, a landing page that loses people, a channel that grew).

Rules: use only the numbers given; never invent figures, causes you can't see or tools the founder doesn't have. Small numbers are noisy: with under about 50 visits or 5 conversions, say the change may be chance. If a source isn't connected, don't speculate about it; you may suggest connecting it once. Never suggest buying followers, fake reviews, spam or posting without disclosure.`;

export const summaryOutput = z.object({
  headline: z.string(),
  summary: z.string(),
  wins: z.array(z.string()).max(3),
  concerns: z.array(z.string()).max(3),
  tryNext: z.array(z.object({ title: z.string(), why: z.string() })).min(1).max(3),
});

export const analyticsSummaryPayload = z.object({ workspaceId: z.guid(), productId: z.guid().optional() });

const n = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${x.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pair = (p: Pair, f = n) => (p.before == null ? f(p.now) : `${f(p.now)} (before: ${f(p.before)})`);
const pct = (x: number | null) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** The numbers, as text for the prompt. */
export function reportText(week: AnalyticsReport, month: AnalyticsReport): string {
  const lines: string[] = [`Period: ${week.current.start} to ${week.current.end}, compared with ${week.previous.start} to ${week.previous.end}.`];
  const t = week.traffic;
  if (t.has) {
    lines.push(
      `\n<traffic source="${week.webLabel}">`,
      `Visits: ${pair(t.sessions)}. Average daily visitors: ${pair(t.avgDailyUsers)}.`,
      t.engagedRate ? `Engaged visits: ${pct(t.engagedRate.now)} (before: ${pct(t.engagedRate.before)}).` : "",
      `Key events: ${pair(week.conversions.keyEvents)}; per visit ${pct(week.conversions.rate.now)} (before: ${pct(week.conversions.rate.before)}).`,
      `By channel: ${t.channels.map((c) => `${c.group} ${n(c.sessions)}${c.before != null ? ` (before ${n(c.before)})` : ""}, ${n(c.keyEvents)} key events`).join("; ") || "none"}.`,
      `Top sources: ${t.channels.flatMap((c) => c.sources).sort((a, b) => b.sessions - a.sessions).slice(0, 8).map((s) => `${s.label} ${n(s.sessions)}${s.before != null ? ` (before ${n(s.before)})` : ""}`).join("; ") || "none"}.`,
      `Top landing pages: ${t.landing.slice(0, 6).map((l) => `${l.key} ${n(l.sessions)} visits, ${n(l.keyEvents ?? 0)} key events, ${l.sessions ? Math.round(((l.engaged ?? 0) / l.sessions) * 100) : 0}% engaged`).join("; ") || "none"}.`,
      `Key events by name: ${week.conversions.events.slice(0, 6).map((e) => `${e.key} ${n(e.count)}`).join("; ") || "none"}.`,
      `Devices: ${t.devices.map((d) => `${d.label} ${n(d.sessions)}`).join("; ") || "unknown"}. Top countries: ${t.countries.slice(0, 5).map((c) => `${c.label} ${n(c.sessions)}`).join("; ") || "unknown"}.`,
      `Last 30 days: ${n(month.traffic.sessions.now)} visits${month.traffic.sessions.before != null ? ` (30 days before: ${n(month.traffic.sessions.before)})` : ""}, ${n(month.conversions.keyEvents.now)} key events.`,
      `</traffic>`,
    );
  } else lines.push("\nWeb analytics: not connected.");
  if (week.conversions.signups) lines.push(`\nSignups (product database): ${pair(week.conversions.signups)}; last 30 days ${n(month.conversions.signups?.now ?? 0)}.`);
  if (week.product.activeUsers.has) lines.push(`Active users (product database, latest): ${pair(week.product.activeUsers)}.`);
  for (const m of week.product.other) lines.push(`${m.metric} (product database): ${pair(m)}.`);
  const r = week.revenue;
  if (r.has) {
    lines.push(
      `\n<revenue source="Stripe">`,
      `MRR: ${pair(r.mrr, usd)}. Active subscriptions: ${pair(r.activeSubs)}${r.trials ? `, of which trials ${n(r.trials.now)}` : ""}.`,
      `New subscriptions: ${pair(r.newSubs)}. Cancellations: ${pair(r.cancellations)}.`,
      r.mrrNew && r.mrrChurned ? `MRR from new subscriptions ${usd(r.mrrNew.now)}, lost to ended ones ${usd(r.mrrChurned.now)}.` : "",
      r.revenue ? `Revenue paid: ${pair(r.revenue, usd)}.` : "",
      `</revenue>`,
    );
  } else lines.push("\nStripe: not connected.");
  const s = week.startica;
  lines.push(
    `\n<posted_through_startica>`,
    s.posts.length
      ? `${s.posts.length} posts and replies this week, ${s.posts.filter((p) => p.mentionsProduct).length} linking the product; ${n(s.fromPosts.visits)} visits and ${n(s.fromPosts.keyEvents)} key events through their links.`
      : "Nothing posted this week.",
    ...s.places.slice(0, 6).map((p) => `- ${p.where}: ${p.posts} posts, ${n(p.replies)} replies received, ${n(p.visits)} visits, ${n(p.keyEvents)} key events${p.removed ? `, ${p.removed} removed` : ""}`),
    month.startica.places.length ? `Last 30 days by place: ${month.startica.places.slice(0, 6).map((p) => `${p.where} ${p.posts} posts, ${n(p.visits)} visits, ${n(p.keyEvents)} key events`).join("; ")}.` : "",
    ...(s.ads ?? []).map((a) => `Ad campaign ${a.name} (${a.platform}): ${usd(a.spend)} spent, ${n(a.visits)} visits, ${n(a.results)} key events.`),
    `</posted_through_startica>`,
  );
  if (week.highlights.length) lines.push(`\nStartica's own notes: ${week.highlights.map((h) => h.text).join(" ")}`);
  return lines.filter(Boolean).join("\n");
}

/** Products with at least one working source of numbers. */
async function measuredProducts(workspaceId: string, productId?: string) {
  const rows = await getDb()
    .selectDistinct({ id: products.id })
    .from(products)
    .innerJoin(connections, eq(connections.productId, products.id))
    .where(
      and(
        eq(products.workspaceId, workspaceId),
        productId ? eq(products.id, productId) : undefined,
        eq(connections.status, "ok"),
        inArray(connections.kind, ["ga4", "umami", "stripe", "product_db"]),
      ),
    );
  return rows.map((r) => r.id);
}

export async function requestAnalyticsSummary(workspaceId: string, productId: string): Promise<void> {
  if (await jobByPayload(workspaceId, ["analytics_summary"], "productId", productId)) throw new Error("Already writing the summary");
  if (!(await hasAiKey())) throw new Error("Add an AI key in Settings first");
  if ((await measuredProducts(workspaceId, productId)).length === 0) throw new Error("Connect web analytics, Stripe or the product database first");
  await enqueue(workspaceId, "analytics_summary", { productId });
}

export async function latestAnalyticsSummaries(productId: string, limit = 6) {
  return getDb().select().from(analyticsSummaries).where(eq(analyticsSummaries.productId, productId)).orderBy(desc(analyticsSummaries.createdAt)).limit(limit);
}

/** The latest summary that worked, for Today and the roadmap re-plan. */
export async function latestReadySummary(productId: string) {
  const [row] = await getDb()
    .select()
    .from(analyticsSummaries)
    .where(and(eq(analyticsSummaries.productId, productId), eq(analyticsSummaries.status, "ready")))
    .orderBy(desc(analyticsSummaries.createdAt))
    .limit(1);
  return row?.body ? { ...row, body: row.body } : null;
}

export async function runAnalyticsSummary(ctx: AiContext, payload: z.infer<typeof analyticsSummaryPayload>) {
  const db = getDb();
  const scheduled = !payload.productId;
  if (!(await hasAiKey())) {
    if (scheduled) return { skipped: "no AI key" };
    throw new Error("Add an AI key in Settings first");
  }
  // The last 7 full days: today is still filling in.
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
  const results: Record<string, string> = {};
  for (const productId of await measuredProducts(payload.workspaceId, payload.productId)) {
    ctx.signal?.throwIfAborted();
    const week = await loadAnalyticsReport(productId, 7, yesterday);
    if (scheduled) {
      // Once a week: the Monday run skips a week someone already summarized.
      const [done] = await db
        .select({ id: analyticsSummaries.id })
        .from(analyticsSummaries)
        .where(and(eq(analyticsSummaries.productId, productId), eq(analyticsSummaries.periodEnd, week.current.end), eq(analyticsSummaries.status, "ready")));
      if (done) {
        results[productId] = "already summarized";
        continue;
      }
    }
    const period = { periodStart: week.current.start, periodEnd: week.current.end };
    try {
      const [product, month] = await Promise.all([loadProductContext(productId), loadAnalyticsReport(productId, 30, yesterday)]);
      const out = await runStructured(ctx, {
        task: "draft",
        promptVersion: SUMMARY_PROMPT_VERSION,
        system: SUMMARY_SYSTEM,
        messages: [{ role: "user", content: `<product>\n${product.text}\n</product>\n\n<numbers>\n${reportText(week, month)}\n</numbers>` }],
        schema: summaryOutput,
      });
      const body: AnalyticsSummaryBody = {
        headline: out.headline.trim(),
        summary: out.summary.trim(),
        wins: out.wins.map((w) => w.trim()).filter(Boolean),
        concerns: out.concerns.map((c) => c.trim()).filter(Boolean),
        tryNext: out.tryNext.map((x) => ({ title: x.title.trim(), why: x.why.trim() })).filter((x) => x.title),
      };
      await db.insert(analyticsSummaries).values({ workspaceId: payload.workspaceId, productId, ...period, body, model: (await taskModel(ctx, "draft")).model });
      results[productId] = "ready";
    } catch (err) {
      const message = ctx.signal?.aborted ? "Stopped by you" : err instanceof Error ? err.message : String(err);
      await db.insert(analyticsSummaries).values({ workspaceId: payload.workspaceId, productId, ...period, status: "failed", error: message });
      if (!scheduled || ctx.signal?.aborted) throw err;
      results[productId] = `failed: ${message}`;
    }
  }
  return results;
}
