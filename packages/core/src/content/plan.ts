import { and, desc, eq, gte, inArray, isNotNull, lte, ne, sum } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { aiRuns, contentChannels, contentPieces, contentPlans, contentSnapshots, engagementSnapshots, publications, voiceProfiles, type ContentPlanItem } from "@startica/db/schema";
import { hasAiKey, runStructured, taskModel, type AiContext } from "../ai/client.ts";
import { estimateCostUsd } from "../ai/pricing.ts";
import { channelLabel } from "../channels/labels.ts";
import { loadProductContext } from "../distribution/context.ts";
import { localDay } from "../growth/moves.ts";
import { jobByPayload } from "../jobs/cancel.ts";
import { latestReadySummary } from "../metrics/summary.ts";
import { describeHint, engagementOf, hintFor, loadBestTimes, nextGoodTime, type BestTimes } from "./best-time.ts";
import { deletePieceImages } from "./images.ts";
import { CHANNEL_NORMS } from "./prompts.ts";

/**
 * AI content plan (ARCHITECTURE.md, Content Studio): one `content_plan` job fills the next one or
 * two weeks with planned Content Studio pieces, grounded in Intel, the latest weekly analytics
 * read-out, what worked and the best-time hints. Each slot becomes a piece (`plan_id`,
 * `plan_why`, `planned_at`) that `content_generate` writes in the product's voice. Plan again
 * replaces only the plan's unposted pieces. Nothing is ever posted for the owner.
 */

export const CONTENT_PLAN_PROMPT_VERSION = "content-plan@1";
/** Channels a plan can use: everything Content Studio writes for except "other". */
export const planChannels = contentChannels.filter((c) => c !== "other");
export type PlanChannel = (typeof planChannels)[number];

export const planInput = z.object({
  weeks: z.coerce.number().int().min(1).max(2),
  channels: z.array(z.enum(planChannels as [PlanChannel, ...PlanChannel[]])).min(1, "Pick at least one channel"),
  postsPerWeek: z.coerce.number().int().min(1, "At least one post a week").max(14, "At most 14 posts a week"),
  guidance: z.string().trim().max(1000).default(""),
});
export type PlanInput = z.infer<typeof planInput>;

export const contentPlanPayload = z.object({ workspaceId: z.guid(), productId: z.guid(), planId: z.guid(), replace: z.boolean().optional() });

/** Local days from `start` to `end`, inclusive (YYYY-MM-DD). */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  for (let i = 0; i < 31; i++) {
    const day = localDay(new Date(y, m - 1, d + i));
    if (day > end) break;
    out.push(day);
  }
  return out;
}

/** The range a new plan covers: from tomorrow, one or two weeks. */
export function planRange(weeks: number, now = new Date()): { startDay: string; endDay: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7 * weeks);
  return { startDay: localDay(start), endDay: localDay(end) };
}

/** How many pieces a plan writes: posts per week over the range, less the posted ones it keeps. */
export function slotCount(postsPerWeek: number, startDay: string, endDay: string, kept = 0): number {
  return Math.max(0, Math.round((postsPerWeek * daysBetween(startDay, endDay).length) / 7) - kept);
}

/** Plan again: the plan's posted pieces stay, everything else it made is replaced. */
export function splitForReplan<P extends { status: string }>(pieces: P[]): { keep: P[]; replace: P[] } {
  return { keep: pieces.filter((p) => p.status === "posted"), replace: pieces.filter((p) => p.status !== "posted") };
}

// Rough token counts for the estimate: the plan call, then one content_generate per piece.
const PLAN_USAGE = { inputTokens: 7000, outputTokens: 2500, cacheReadTokens: 0, cacheWriteTokens: 0 };
const PIECE_USAGE = { inputTokens: 3000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** What a plan costs before it runs (the plan, and writing each piece), on the `draft` task's model. */
export async function planEstimate(ctx: AiContext, pieces: number): Promise<{ model: string; usd: number }> {
  const { model } = await taskModel(ctx, "draft");
  return { model, usd: estimateCostUsd(model, PLAN_USAGE) + pieces * estimateCostUsd(model, PIECE_USAGE) };
}

/** Starts a plan: a `working` row and a job. */
export async function requestContentPlan(workspaceId: string, productId: string, input: PlanInput, now = new Date()): Promise<string> {
  if (!(await hasAiKey())) throw new Error("Add an AI key in Settings first");
  if (await jobByPayload(workspaceId, ["content_plan"], "productId", productId)) throw new Error("A plan is already being written");
  const range = planRange(input.weeks, now);
  const [plan] = await getDb()
    .insert(contentPlans)
    .values({ workspaceId, productId, ...range, channels: input.channels, postsPerWeek: input.postsPerWeek, guidance: input.guidance || null, status: "working" })
    .returning({ id: contentPlans.id });
  await enqueue(workspaceId, "content_plan", { productId, planId: plan!.id });
  return plan!.id;
}

/** Plan again: same range and settings; only the plan's unposted pieces are replaced. */
export async function replanContentPlan(workspaceId: string, planId: string): Promise<void> {
  const [plan] = await getDb().select().from(contentPlans).where(and(eq(contentPlans.id, planId), eq(contentPlans.workspaceId, workspaceId)));
  if (!plan) throw new Error("Not found");
  if (!(await hasAiKey())) throw new Error("Add an AI key in Settings first");
  if (await jobByPayload(workspaceId, ["content_plan"], "productId", plan.productId)) throw new Error("A plan is already being written");
  await getDb().update(contentPlans).set({ status: "working", error: null }).where(eq(contentPlans.id, plan.id));
  await enqueue(workspaceId, "content_plan", { productId: plan.productId, planId: plan.id, replace: true });
}

export async function listContentPlans(productId: string, limit = 5) {
  return getDb().select().from(contentPlans).where(eq(contentPlans.productId, productId)).orderBy(desc(contentPlans.createdAt)).limit(limit);
}

// --- The prompt -----------------------------------------------------------------------------

export const CONTENT_PLAN_SYSTEM = `You plan a small founder's content calendar: which posts go out on which channel on which day, and at what time. Each slot becomes a draft another writer turns into the finished post in the founder's voice, and the founder reviews and posts every one by hand.

Rules:
- Spread posts across the days and channels you're given; no more than one post per channel per day unless asked, and leave days without posts if the count is low.
- Each topic is specific and useful to the audience on its own (a lesson, a how-to, a finding, a question that starts a real discussion), never a bare product announcement. Mix angles across the plan; don't repeat a topic that's already planned or posted.
- Ground topics in the product information, the conversations the audience is having, the weekly analytics read-out and what worked before. Never invent numbers, features, customers or events.
- Times: use the best-time hints where they exist (pick one of the hours given, on a good day when possible); otherwise pick a sensible local time for the channel, or leave time empty.
- Email goes out as an email campaign (format "campaign"); other channels use post, thread, article or newsletter as fits the channel.
- "why" is one sentence for the founder: why this topic on this channel at this time.
- Follow the founder's guidance where it doesn't break these rules.`;

const formats = ["post", "thread", "article", "newsletter", "campaign"] as const;
export const planOutput = z.object({
  summary: z.string().describe("Two or three sentences: the idea behind this plan."),
  items: z.array(
    z.object({
      day: z.string().describe("YYYY-MM-DD, one of the days given"),
      time: z.string().describe("HH:MM in 24-hour local time, or an empty string"),
      channel: z.enum(planChannels as [PlanChannel, ...PlanChannel[]]),
      format: z.enum(formats),
      topic: z.string().describe("What the piece is about, one specific sentence"),
      why: z.string(),
    }),
  ),
});
export type PlanOutput = z.infer<typeof planOutput>;

/**
 * Checks the AI's slots against the plan: days in range, allowed channels, a format that fits
 * the channel, a valid time (or the next good time that day, else 10:00), and the slot count.
 */
export function normalizePlan(
  out: PlanOutput,
  plan: { startDay: string; endDay: string; channels: string[] },
  slots: number,
  times: BestTimes,
): (Omit<ContentPlanItem, "pieceId"> & { plannedAt: Date })[] {
  const days = new Set(daysBetween(plan.startDay, plan.endDay));
  const result: (Omit<ContentPlanItem, "pieceId"> & { plannedAt: Date })[] = [];
  for (const item of out.items) {
    if (result.length >= slots) break;
    if (!days.has(item.day) || !plan.channels.includes(item.channel) || !item.topic.trim()) continue;
    const format = item.channel === "email" ? "campaign" : item.format === "campaign" ? "post" : item.format;
    const [y, m, d] = item.day.split("-").map(Number) as [number, number, number];
    const hm = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(item.time.trim());
    let plannedAt: Date;
    let time: string | null;
    if (hm) {
      plannedAt = new Date(y, m - 1, d, Number(hm[1]), Number(hm[2]));
      time = `${hm[1]!.padStart(2, "0")}:${hm[2]}`;
    } else {
      const good = nextGoodTime(hintFor(times, item.channel), new Date(y, m - 1, d), 0);
      plannedAt = good && localDay(good) === item.day ? good : new Date(y, m - 1, d, 10);
      time = null;
    }
    result.push({ day: item.day, time, channel: item.channel, format, topic: item.topic.trim(), why: item.why.trim(), plannedAt });
  }
  return result;
}

async function topPosted(productId: string) {
  const db = getDb();
  const since = new Date(Date.now() - 90 * 86400_000);
  const [pieces, pubs] = await Promise.all([
    db
      .select({ id: contentPieces.id, channel: contentPieces.channel, topic: contentPieces.topic, title: contentPieces.title })
      .from(contentPieces)
      .where(and(eq(contentPieces.productId, productId), eq(contentPieces.status, "posted"), gte(contentPieces.postedAt, since))),
    db
      .select({ id: publications.id, channel: publications.channel, community: publications.community, body: publications.body })
      .from(publications)
      .where(and(eq(publications.productId, productId), gte(publications.postedAt, since))),
  ]);
  const [pieceSnaps, pubSnaps] = await Promise.all([
    pieces.length ? db.select().from(contentSnapshots).where(inArray(contentSnapshots.pieceId, pieces.map((p) => p.id))).orderBy(desc(contentSnapshots.capturedAt)) : [],
    pubs.length ? db.select().from(engagementSnapshots).where(inArray(engagementSnapshots.publicationId, pubs.map((p) => p.id))).orderBy(desc(engagementSnapshots.capturedAt)) : [],
  ]);
  const pieceScore = (id: string) => {
    const s = pieceSnaps.find((x) => x.pieceId === id);
    return s ? engagementOf(s) : null;
  };
  const pubScore = (id: string) => {
    const s = pubSnaps.find((x) => x.publicationId === id);
    return s ? engagementOf(s) : null;
  };
  const best = [
    ...pieces.map((p) => ({ line: `${channelLabel(p.channel)} post: ${p.title || p.topic}`, score: pieceScore(p.id) })),
    ...pubs.map((p) => ({ line: `Reply on ${channelLabel(p.channel)}${p.community ? ` (${p.community})` : ""}: ${p.body.slice(0, 140).replace(/\s+/g, " ")}`, score: pubScore(p.id) })),
  ]
    .filter((x): x is { line: string; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return best.map((b) => `- ${b.line} (engagement ${b.score})`);
}

/** content_plan: the AI proposes slots; each becomes a piece that content_generate writes. */
export async function runContentPlan(ctx: AiContext, payload: z.infer<typeof contentPlanPayload>) {
  const db = getDb();
  const [plan] = await db.select().from(contentPlans).where(eq(contentPlans.id, payload.planId));
  if (!plan) return { skipped: "plan deleted" };
  try {
    // Plan again: posted pieces stay, the rest of this plan's pieces go.
    const existing = await db.select({ id: contentPieces.id, status: contentPieces.status, channel: contentPieces.channel, topic: contentPieces.topic, plannedAt: contentPieces.plannedAt }).from(contentPieces).where(eq(contentPieces.planId, plan.id));
    const { keep, replace } = splitForReplan(existing);
    if (payload.replace && replace.length) {
      await deletePieceImages(replace.map((p) => p.id));
      await db.delete(contentPieces).where(inArray(contentPieces.id, replace.map((p) => p.id)));
    }
    const kept = payload.replace ? keep : existing;
    const slots = slotCount(plan.postsPerWeek, plan.startDay, plan.endDay, kept.length);
    if (slots === 0) {
      await db.update(contentPlans).set({ status: "ready", error: null }).where(eq(contentPlans.id, plan.id));
      return { pieces: 0 };
    }

    const product = await loadProductContext(plan.productId);
    const [d1y, d1m, d1d] = plan.endDay.split("-").map(Number) as [number, number, number];
    const rangeStart = new Date(`${plan.startDay}T00:00:00`);
    const rangeEnd = new Date(d1y, d1m - 1, d1d + 1);
    const [summary, times, best, planned, [voice]] = await Promise.all([
      latestReadySummary(plan.productId),
      loadBestTimes(plan.productId),
      topPosted(plan.productId),
      db
        .select({ channel: contentPieces.channel, topic: contentPieces.topic, plannedAt: contentPieces.plannedAt, planId: contentPieces.planId })
        .from(contentPieces)
        .where(and(eq(contentPieces.productId, plan.productId), isNotNull(contentPieces.plannedAt), gte(contentPieces.plannedAt, rangeStart), lte(contentPieces.plannedAt, rangeEnd))),
      db
        .select({ id: voiceProfiles.id })
        .from(voiceProfiles)
        .where(and(eq(voiceProfiles.productId, plan.productId), eq(voiceProfiles.status, "ready")))
        .orderBy(desc(voiceProfiles.createdAt))
        .limit(1),
    ]);
    const recentTopics = await db
      .select({ channel: contentPieces.channel, topic: contentPieces.topic })
      .from(contentPieces)
      .where(and(eq(contentPieces.productId, plan.productId), ne(contentPieces.status, "failed")))
      .orderBy(desc(contentPieces.createdAt))
      .limit(30);

    const days = daysBetween(plan.startDay, plan.endDay).map((d) => `${d} (${new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })})`);
    const out = await runStructured(ctx, {
      task: "draft",
      promptVersion: CONTENT_PLAN_PROMPT_VERSION,
      system: `${CONTENT_PLAN_SYSTEM}\n\n<product>\n${product.text}\n</product>`,
      messages: [
        {
          role: "user",
          content: [
            `<range>\n${days.join("\n")}\n</range>`,
            `<slots>Plan exactly ${slots} posts across these channels: ${plan.channels.map((c) => channelLabel(c)).join(", ")}.</slots>`,
            `<channels>\n${plan.channels.map((c) => `${c}: ${CHANNEL_NORMS[c] ?? CHANNEL_NORMS.other}\nBest time: ${describeHint(hintFor(times, c))}`).join("\n\n")}\n</channels>`,
            summary?.body
              ? `<analytics_read_out week="${summary.periodStart} to ${summary.periodEnd}">\n${summary.body.headline}\n${summary.body.summary}\nTry next: ${summary.body.tryNext.map((t) => t.title).join("; ")}\n</analytics_read_out>`
              : "<analytics_read_out>(none yet)</analytics_read_out>",
            `<what_worked>\n${best.join("\n") || "(nothing measured yet)"}\n</what_worked>`,
            `<already_planned>\n${
              [...planned.filter((p) => p.planId !== plan.id), ...kept.filter((k) => k.plannedAt)]
                .map((p) => `- ${p.plannedAt ? localDay(p.plannedAt) : "?"} ${channelLabel(p.channel)}: ${p.topic}`)
                .join("\n") || "(nothing)"
            }\n</already_planned>`,
            `<recent_topics>\n${recentTopics.map((t) => `- ${channelLabel(t.channel)}: ${t.topic}`).join("\n") || "(none)"}\n</recent_topics>`,
            plan.guidance ? `<owner_guidance>${plan.guidance}</owner_guidance>` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      schema: planOutput,
    });

    const items = normalizePlan(out, plan, slots, times);
    if (items.length === 0) throw new Error("The plan came back without usable slots; try again");
    const pieces = await db
      .insert(contentPieces)
      .values(
        items.map((i) => ({
          workspaceId: plan.workspaceId,
          productId: plan.productId,
          voiceProfileId: voice?.id ?? null,
          channel: i.channel as PlanChannel,
          format: i.format as (typeof formats)[number],
          topic: i.topic,
          status: "drafting" as const,
          plannedAt: i.plannedAt,
          planId: plan.id,
          planWhy: i.why,
        })),
      )
      .returning({ id: contentPieces.id });
    for (const p of pieces) await enqueue(plan.workspaceId, "content_generate", { pieceId: p.id });

    const keptItems = payload.replace ? plan.items.filter((i) => i.pieceId && keep.some((k) => k.id === i.pieceId)) : plan.items;
    const cost = await planSpend(ctx);
    await db
      .update(contentPlans)
      .set({
        status: "ready",
        error: null,
        summary: out.summary,
        items: [...keptItems, ...items.map(({ plannedAt: _, ...i }, n) => ({ ...i, pieceId: pieces[n]?.id ?? null }))],
        model: (await taskModel(ctx, "draft")).model,
        costUsd: plan.costUsd + cost,
      })
      .where(eq(contentPlans.id, plan.id));
    return { pieces: pieces.length, costUsd: cost };
  } catch (error) {
    const cost = await planSpend(ctx).catch(() => 0);
    await db
      .update(contentPlans)
      .set({ status: "failed", error: ctx.signal?.aborted ? "Stopped by you" : error instanceof Error ? error.message : String(error), costUsd: plan.costUsd + cost })
      .where(eq(contentPlans.id, plan.id));
    throw error;
  }
}

async function planSpend(ctx: AiContext): Promise<number> {
  if (!ctx.jobRunId) return 0;
  const [row] = await getDb().select({ total: sum(aiRuns.costUsd) }).from(aiRuns).where(eq(aiRuns.jobRunId, ctx.jobRunId));
  return Number(row?.total ?? 0);
}
