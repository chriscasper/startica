import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { aiPrompts, aiRuns, aiVisibilityAnswers, aiVisibilityRuns, competitors, keywords, promptStages, type AnswerCitation } from "@startica/db/schema";
import { hasAiKey, runAnswer, runStructured, taskModel, type AiContext } from "../ai/client.ts";
import { loadProductContext } from "../distribution/context.ts";
import {
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_SYSTEM,
  analysisOutput,
  analyzed,
  ANSWER_PROMPT_VERSION,
  answerSystem,
  estimatePerQuestion,
  MAX_PROMPTS,
  MAX_SEARCHES,
  namesProduct,
  productNames,
  runMetrics,
  SUGGEST_PROMPT_VERSION,
  type AnalyzedAnswer,
} from "./analysis.ts";
import { queueOffsiteCheck } from "../offsite/check.ts";
import { visibilitySettings } from "./questions.ts";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function competitorNames(productId: string): Promise<string[]> {
  const rows = await getDb().select({ name: competitors.name }).from(competitors).where(eq(competitors.productId, productId)).orderBy(asc(competitors.createdAt));
  return rows.map((r) => r.name);
}

// --- ai_prompts_suggest: questions the audience would ask an AI --------------------------

export const promptsSuggestPayload = z.object({ workspaceId: z.guid(), productId: z.guid(), count: z.number().int().min(5).max(40).default(20) });

const SUGGEST_SYSTEM = `You write the questions a product's potential customers would type into an AI assistant (ChatGPT, Claude, Perplexity, Gemini) when they have the problem the product solves, so the founder can see whether assistants recommend the product.

Rules:
- Write like a real person typing to an assistant: plain, specific, sometimes long. Mix "what's the best…", "how do I…", "X vs Y", "alternatives to <competitor>", and questions that describe a situation.
- Never name the product itself: the point is to see whether the assistant brings it up on its own.
- Cover the audience's main problems and use cases, the competitors people compare, and the different personas.
- topic: 1 to 3 words grouping similar questions (e.g. "offline notes", "alternatives").
- stage: discover (learning about the problem or options), compare (weighing options), decide (ready to choose or switch).
- No duplicates of the existing questions.`;

const suggestOutput = z.object({
  questions: z.array(z.object({ text: z.string(), topic: z.string(), stage: z.enum(promptStages) })),
});

export async function runPromptsSuggest(ctx: AiContext, payload: z.infer<typeof promptsSuggestPayload>) {
  const db = getDb();
  const product = await loadProductContext(payload.productId);
  const [existing, kws, comps] = await Promise.all([
    db.select({ text: aiPrompts.text }).from(aiPrompts).where(eq(aiPrompts.productId, payload.productId)),
    db.select({ keyword: keywords.keyword, intent: keywords.intent }).from(keywords).where(eq(keywords.productId, payload.productId)),
    competitorNames(payload.productId),
  ]);
  const room = MAX_PROMPTS - existing.length;
  if (room <= 0) return { added: 0 };
  const out = await runStructured(ctx, {
    task: "draft",
    promptVersion: SUGGEST_PROMPT_VERSION,
    system: SUGGEST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          `<product>\n${product.text}\n</product>`,
          kws.length ? `<keywords>\n${kws.map((k) => `${k.keyword} (${k.intent})`).join("\n")}\n</keywords>` : "",
          comps.length ? `<competitors>\n${comps.join("\n")}\n</competitors>` : "",
          existing.length ? `<existing_questions>\n${existing.map((e) => e.text).join("\n")}\n</existing_questions>` : "",
          `Write ${Math.min(payload.count, room)} questions.`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: suggestOutput,
  });
  const seen = new Set(existing.map((e) => e.text.trim().toLowerCase()));
  const names = productNames(product.name, product.url);
  const fresh = out.questions
    .map((q) => ({ ...q, text: q.text.trim().slice(0, 500), topic: q.topic.trim().slice(0, 40) }))
    // Same whole-word check as the analysis: a question naming the product would only measure itself.
    .filter((q) => q.text && !seen.has(q.text.toLowerCase()) && !namesProduct(q.text, names))
    .slice(0, room);
  if (fresh.length) await db.insert(aiPrompts).values(fresh.map((q) => ({ workspaceId: product.workspaceId, productId: product.id, ...q, source: "ai" as const })));
  return { added: fresh.length };
}

// --- ai_visibility_run: ask every active question, read every answer --------------------

export const visibilityRunPayload = z.object({
  workspaceId: z.guid(),
  /** A run Startica created when the user clicked Run; absent for the weekly schedule. */
  runId: z.guid().optional(),
});

/** The AI spend of a run so far, from the AI call log. */
async function runSpend(ctx: AiContext, startedAt: Date): Promise<number> {
  const [row] = await getDb()
    .select({ cost: sql<number>`coalesce(sum(${aiRuns.costUsd}), 0)` })
    .from(aiRuns)
    .where(
      ctx.jobRunId
        ? eq(aiRuns.jobRunId, ctx.jobRunId)
        : and(eq(aiRuns.workspaceId, ctx.workspaceId), gte(aiRuns.createdAt, startedAt), inArray(aiRuns.promptVersion, [ANSWER_PROMPT_VERSION, ANALYSIS_PROMPT_VERSION])),
    );
  return Number(row?.cost ?? 0);
}

/** Creates a run for a product (the Run button, or the weekly schedule). */
export async function createRun(workspaceId: string, productId: string, trigger: "manual" | "weekly"): Promise<string> {
  const ctx = { workspaceId };
  const [model, settings, prompts] = await Promise.all([
    taskModel(ctx, "answer"),
    visibilitySettings(productId),
    getDb()
      .select({ id: aiPrompts.id })
      .from(aiPrompts)
      .where(and(eq(aiPrompts.productId, productId), eq(aiPrompts.active, true))),
  ]);
  if (prompts.length === 0) throw new Error("Add some questions first");
  const [row] = await getDb()
    .insert(aiVisibilityRuns)
    .values({ workspaceId, productId, model: model.model, trigger, promptCount: prompts.length, capUsd: settings.capUsd })
    .returning({ id: aiVisibilityRuns.id });
  return row!.id;
}

export async function runVisibility(ctx: AiContext, payload: z.infer<typeof visibilityRunPayload>) {
  if (!payload.runId) return runWeekly(ctx);
  const db = getDb();
  const [run] = await db.select().from(aiVisibilityRuns).where(eq(aiVisibilityRuns.id, payload.runId));
  if (!run || run.status !== "running") return { skipped: "no run to do" };

  const product = await loadProductContext(run.productId);
  const names = productNames(product.name, product.url);
  const comps = await competitorNames(run.productId);
  const prompts = await db
    .select()
    .from(aiPrompts)
    .where(and(eq(aiPrompts.productId, run.productId), eq(aiPrompts.active, true)))
    .orderBy(asc(aiPrompts.createdAt))
    .limit(MAX_PROMPTS);
  const perQuestion = estimatePerQuestion(await taskModel(ctx, "answer"), await taskModel(ctx, "score"));
  const today = new Date().toISOString().slice(0, 10);
  // A run picked up again after Startica quit mid-run: keep its answers and what they cost, ask only the rest.
  const earlier = await db.select().from(aiVisibilityAnswers).where(eq(aiVisibilityAnswers.runId, run.id));
  const asked = new Set(earlier.map((a) => a.promptId));
  const results: (AnalyzedAnswer & { error?: string | null })[] = earlier.map((a) => ({
    mentioned: a.mentioned,
    recommended: a.recommended,
    position: a.position,
    productsNamed: a.productsNamed,
    competitors: a.competitors,
    ownCitations: a.ownCitations,
    description: a.description,
    sentiment: a.sentiment,
    error: a.error,
  }));
  // The cost so far: what earlier passes saved on the run, plus this pass's AI calls.
  const baseCost = ctx.jobRunId ? run.costUsd : 0;
  const spentSoFar = async () => baseCost + (await runSpend(ctx, run.startedAt));
  const total = prompts.length;
  let note: string | null = null;
  let status: "done" | "failed" | "cancelled" = "done";

  for (const prompt of prompts) {
    if (asked.has(prompt.id)) continue;
    if (ctx.signal?.aborted) {
      status = "cancelled";
      note = `Stopped by you after ${results.length} of ${total} questions.`;
      break;
    }
    const spent = await spentSoFar();
    await db.update(aiVisibilityRuns).set({ costUsd: Math.round(spent * 10000) / 10000 }).where(eq(aiVisibilityRuns.id, run.id));
    if (spent + perQuestion > run.capUsd) {
      note = `Stopped at the $${run.capUsd.toFixed(2)} cap after ${results.length} of ${total} questions.`;
      break;
    }
    try {
      const answer = await runAnswer(ctx, {
        task: "answer",
        promptVersion: ANSWER_PROMPT_VERSION,
        system: answerSystem(today),
        messages: [{ role: "user", content: prompt.text }],
        maxSearches: MAX_SEARCHES,
      });
      const citations: AnswerCitation[] = answer.citations.slice(0, 40);
      const out = await runStructured(ctx, {
        task: "score",
        promptVersion: ANALYSIS_PROMPT_VERSION,
        system: ANALYSIS_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              `<product>${names.join(" / ")}${product.url ? ` (${product.url})` : ""}</product>`,
              `<competitors>\n${comps.join("\n") || "(none listed)"}\n</competitors>`,
              `<question>${prompt.text}</question>`,
              `<answer>\n${answer.text.slice(0, 20_000)}\n</answer>`,
            ].join("\n\n"),
          },
        ],
        schema: analysisOutput,
      });
      const a = analyzed(out, { text: answer.text, citations }, { names, url: product.url }, comps);
      results.push(a);
      await db.insert(aiVisibilityAnswers).values({
        workspaceId: run.workspaceId,
        runId: run.id,
        promptId: prompt.id,
        promptText: prompt.text,
        answer: answer.text,
        citations,
        searches: answer.searches,
        ...a,
      });
    } catch (err) {
      if (ctx.signal?.aborted) {
        status = "cancelled";
        note = `Stopped by you after ${results.length} of ${total} questions.`;
        break;
      }
      // One bad answer doesn't end the run; the budget guard or a missing key does.
      const text = message(err);
      results.push({ mentioned: false, recommended: false, position: null, productsNamed: [], competitors: [], ownCitations: [], description: null, sentiment: null, error: text });
      await db.insert(aiVisibilityAnswers).values({ workspaceId: run.workspaceId, runId: run.id, promptId: prompt.id, promptText: prompt.text, error: text });
      if (/budget reached|No .*API key|Unknown model/i.test(text)) {
        status = "failed";
        note = text;
        break;
      }
    }
  }

  const metrics = runMetrics(results, product.name, comps);
  if (status === "done" && metrics.answered === 0 && results.length) {
    status = "failed";
    note ??= results.find((r) => r.error)?.error ?? "No answers";
  }
  await db
    .update(aiVisibilityRuns)
    .set({ status, note, metrics, costUsd: Math.round((await spentSoFar()) * 10000) / 10000, finishedAt: new Date() })
    .where(eq(aiVisibilityRuns.id, run.id));
  // Off-site presence reads the pages these answers cited (section 10.4).
  if (metrics.answered > 0) await queueOffsiteCheck(run.workspaceId, run.productId);
  return { answered: metrics.answered, mentioned: metrics.mentioned, status };
}

/** The weekly schedule: a run for each product that asked for one. */
async function runWeekly(ctx: AiContext) {
  if (!(await hasAiKey())) return { skipped: "no AI key" };
  const db = getDb();
  const products = await db
    .selectDistinct({ productId: aiPrompts.productId })
    .from(aiPrompts)
    .where(and(eq(aiPrompts.workspaceId, ctx.workspaceId), eq(aiPrompts.active, true)));
  let queued = 0;
  for (const { productId } of products) {
    if (!(await visibilitySettings(productId)).weekly) continue;
    const [running] = await db
      .select({ id: aiVisibilityRuns.id })
      .from(aiVisibilityRuns)
      .where(and(eq(aiVisibilityRuns.productId, productId), eq(aiVisibilityRuns.status, "running")));
    if (running) continue;
    const runId = await createRun(ctx.workspaceId, productId, "weekly");
    await enqueue(ctx.workspaceId, "ai_visibility_run", { runId });
    queued++;
  }
  return { queued };
}
