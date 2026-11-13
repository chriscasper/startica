import { and, eq, gte, sum } from "drizzle-orm";
import type { z } from "zod";
import { getSetting, setSetting } from "@startica/db/bootstrap";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { aiBatches, aiModels, aiRuns } from "@startica/db/schema";
import { hasSecretNamed, readSecretByName } from "@startica/db/secrets";
import { anthropicAnswer, anthropicBatchCancel, anthropicBatchResults, anthropicBatchState, anthropicBatchSubmit, anthropicChat, anthropicResearch, anthropicStructured } from "./anthropic.ts";
import { AiError, type AiMessage, type Answer, type BatchItemResult, type BatchRequest, type CallRequest, type CallResult, type ChatOptions, type ResearchOptions } from "./errors.ts";
import { DEFAULT_MODELS, isProvider, PROVIDERS, providerOf, type AiProvider, type AiTask, type ModelConfig } from "./models.ts";
import { openaiAnswer, openaiBatchCancel, openaiBatchResults, openaiBatchState, openaiBatchSubmit, openaiChat, openaiImage, openaiResearch, openaiStructured } from "./openai.ts";
import { BATCH_PRICE_FACTOR, emptyUsage, estimateCostUsd, type TokenUsage } from "./pricing.ts";

export { AiError, type AiImage, type AiMessage, type AiPart, type Answer, type BatchItemResult } from "./errors.ts";
export type { AiProvider, AiTask, ModelConfig } from "./models.ts";

export type AiContext = {
  workspaceId: string;
  jobRunId?: string;
  /** Aborted when the user stops the job; cuts off an AI call in flight. */
  signal?: AbortSignal;
};

/** Names of the settings and secrets the app stores (Settings → General → AI). */
export const ANTHROPIC_KEY_SECRET = PROVIDERS.anthropic.secret;
export const OPENAI_KEY_SECRET = PROVIDERS.openai.secret;
export const BUDGET_SETTING = "ai_monthly_budget_usd";
export const PROVIDER_SETTING = "ai_provider";
const DEFAULT_BUDGET_USD = 50;

type BaseRequest = {
  task: AiTask;
  promptVersion: string;
  // Stable instructions go here; they're cached by both providers.
  system: string;
  messages: AiMessage[];
  /** A long answer (a fix plan for many issues): raises the task's output budget to at least this. */
  minOutputTokens?: number;
  /** Runs the task on this model instead of the workspace's (AI visibility asking both providers). */
  modelConfig?: ModelConfig;
};

export type StructuredRequest<S extends z.ZodType> = BaseRequest & { schema: S };
export type ResearchRequest = BaseRequest & ResearchOptions;
export type ChatRequest<S extends z.ZodType> = BaseRequest &
  Omit<ChatOptions, "tool"> & {
    /** A tool the model calls to hand back a revision; its input is checked against `schema`. */
    tool?: { name: string; description: string; schema: S };
  };
/** A chat reply. `proposal` is the tool's input when the model called it and it matched the schema; `proposalError` says why it didn't. */
export type ChatResult<T> = { text: string; proposal: T | null; proposalError: string | null; citations: { url: string; title: string }[]; searches: string[]; model: string };

/** The API key saved in Settings (encrypted) for a provider. */
export async function aiApiKey(provider: AiProvider): Promise<string | null> {
  return readSecretByName(PROVIDERS[provider].secret);
}

/** Whether a key is saved for a provider, without decrypting it (for pages and checks). */
export async function hasAiApiKey(provider: AiProvider): Promise<boolean> {
  return hasSecretNamed(PROVIDERS[provider].secret);
}

/**
 * The provider picked at setup or in Settings → General → AI. Before one is picked, the one
 * with a saved key (Claude first), else Claude.
 */
export async function activeProvider(): Promise<AiProvider> {
  const saved = await getSetting<string>(PROVIDER_SETTING);
  if (isProvider(saved)) return saved;
  if (await hasAiApiKey("anthropic")) return "anthropic";
  if (await hasAiApiKey("openai")) return "openai";
  return "anthropic";
}

/**
 * Whether the active provider has a key, i.e. AI features can run. Checks that one is saved
 * without decrypting it, so pages still render when a key can't be read (the AI call then
 * says to save it again).
 */
export async function hasAiKey(): Promise<boolean> {
  return hasAiApiKey(await activeProvider());
}

/**
 * Makes `provider` the default: saves the choice and moves every task still on the
 * other provider's models to this provider's defaults. Tasks already on this
 * provider keep their settings, so switching back and forth doesn't lose edits.
 */
export async function setActiveProvider(workspaceId: string, provider: AiProvider): Promise<void> {
  await setSetting(PROVIDER_SETTING, provider);
  const rows = await getDb().select().from(aiModels).where(eq(aiModels.workspaceId, workspaceId));
  for (const row of rows) {
    // Pictures are OpenAI's whichever provider writes the text.
    if (row.task === "image" || providerOf(row.model) === provider) continue;
    const next = DEFAULT_MODELS[provider][row.task as AiTask];
    if (!next) continue;
    await getDb().update(aiModels).set({ model: next.model, effort: next.effort, maxTokens: next.maxTokens }).where(eq(aiModels.id, row.id));
  }
}

async function loadModelConfig(ctx: AiContext, task: AiTask): Promise<ModelConfig> {
  const [row] = await getDb()
    .select({ model: aiModels.model, effort: aiModels.effort, maxTokens: aiModels.maxTokens })
    .from(aiModels)
    .where(and(eq(aiModels.workspaceId, ctx.workspaceId), eq(aiModels.task, task)));
  return row ?? DEFAULT_MODELS[await activeProvider()][task];
}

/** The model a task runs on in this workspace (Settings → General → AI → Advanced, or the provider's default). */
export function taskModel(ctx: AiContext, task: AiTask): Promise<ModelConfig> {
  return loadModelConfig(ctx, task);
}

export function startOfMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function monthToDateSpendUsd(workspaceId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sum(aiRuns.costUsd) })
    .from(aiRuns)
    .where(and(eq(aiRuns.workspaceId, workspaceId), gte(aiRuns.createdAt, startOfMonth())));
  return Number(row?.total ?? 0);
}

/** Monthly cap from Settings, else $50. */
export async function monthlyBudgetUsd(): Promise<number> {
  const value = Number((await getSetting<number>(BUDGET_SETTING)) ?? DEFAULT_BUDGET_USD);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_BUDGET_USD;
}

type RunLog = {
  task: AiTask | string;
  model: string;
  promptVersion: string;
  status: "ok" | "error" | "refused" | "blocked";
  usage?: TokenUsage;
  latencyMs?: number;
  error?: string;
  /** A request in a batch: billed at half price. */
  batchId?: string;
};

async function logRun(ctx: AiContext, log: RunLog): Promise<void> {
  const usage = log.usage ?? emptyUsage();
  await getDb()
    .insert(aiRuns)
    .values({
      workspaceId: ctx.workspaceId,
      jobRunId: ctx.jobRunId ?? null,
      task: log.task,
      model: log.model,
      promptVersion: log.promptVersion,
      status: log.status,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      costUsd: estimateCostUsd(log.model, usage) * (log.batchId ? BATCH_PRICE_FACTOR : 1),
      latencyMs: log.latencyMs ?? null,
      error: log.error ?? null,
      batchId: log.batchId ?? null,
    });
}

/**
 * Every call goes through here: routes the task to its model (and so its
 * provider), enforces the monthly budget, and logs the attempt to ai_runs,
 * whatever the outcome.
 */
/** The task's model (with the request's output floor), after the budget guard and the key check; logs and throws when either stops it. */
async function prepare(ctx: AiContext, req: Pick<BaseRequest, "task" | "promptVersion" | "minOutputTokens" | "modelConfig">): Promise<{ config: ModelConfig; provider: AiProvider; key: string }> {
  const loaded = req.modelConfig ?? (await loadModelConfig(ctx, req.task));
  // OpenAI's budget includes reasoning, hence twice as much (like the defaults in models.ts).
  const floor = (req.minOutputTokens ?? 0) * (providerOf(loaded.model) === "openai" ? 2 : 1);
  const config = floor > loaded.maxTokens ? { ...loaded, maxTokens: floor } : loaded;
  const base = { task: req.task, model: config.model, promptVersion: req.promptVersion };

  const spent = await monthToDateSpendUsd(ctx.workspaceId);
  const budget = await monthlyBudgetUsd();
  if (spent >= budget) {
    const message = `Monthly AI budget reached ($${spent.toFixed(2)} of $${budget.toFixed(2)})`;
    await logRun(ctx, { ...base, status: "blocked", error: message });
    throw new AiError(message, "blocked");
  }

  const provider = providerOf(config.model);
  const key = provider ? await aiApiKey(provider) : null;
  if (!provider || !key) {
    const message = provider
      ? `No ${PROVIDERS[provider].keyLabel}: add one in Settings → General → AI (the ${req.task} task uses ${config.model})`
      : `Unknown model ${config.model} for the ${req.task} task: pick one in Settings → General → AI`;
    await logRun(ctx, { ...base, status: "error", error: message });
    throw new AiError(message, "config");
  }
  return { config, provider, key };
}

async function call<T>(
  ctx: AiContext,
  req: BaseRequest,
  run: (provider: AiProvider, key: string, request: CallRequest) => Promise<CallResult<T>>,
): Promise<T> {
  const { config, provider, key } = await prepare(ctx, req);
  const base = { task: req.task, model: config.model, promptVersion: req.promptVersion };

  ctx.signal?.throwIfAborted();
  const started = Date.now();
  try {
    const result = await run(provider, key, { task: req.task, config, system: req.system, messages: req.messages, signal: ctx.signal });
    await logRun(ctx, { ...base, model: result.model, usage: result.usage, latencyMs: Date.now() - started, status: "ok" });
    return result.value;
  } catch (error) {
    const e = AiError.wrap(error);
    await logRun(ctx, {
      ...base,
      model: e.model ?? config.model,
      usage: e.usage,
      latencyMs: Date.now() - started,
      status: e.kind === "refused" ? "refused" : "error",
      error: ctx.signal?.aborted ? "Stopped by you" : e.message,
    });
    throw e.kind === "api" ? error : e;
  }
}

/** Returns schema-validated data for the database (structured outputs at either provider). */
export async function runStructured<S extends z.ZodType>(ctx: AiContext, req: StructuredRequest<S>): Promise<z.infer<S>> {
  return call(ctx, req, (provider, key, request) =>
    provider === "openai" ? openaiStructured(key, { ...request, schema: req.schema }) : anthropicStructured(key, { ...request, schema: req.schema }),
  );
}

/** Returns prose (research notes) written with the provider's web search tools. */
export async function runResearch(ctx: AiContext, req: ResearchRequest): Promise<string> {
  const options = { maxSearches: req.maxSearches, maxFetches: req.maxFetches };
  return call(ctx, req, (provider, key, request) =>
    provider === "openai" ? openaiResearch(key, { ...request, ...options }) : anthropicResearch(key, { ...request, ...options }),
  );
}

/** An answer to a question, written the way an AI assistant would with web search, with its citations and searches. */
export async function runAnswer(ctx: AiContext, req: BaseRequest & { maxSearches?: number }): Promise<Answer> {
  return call(ctx, req, (provider, key, request) =>
    provider === "openai" ? openaiAnswer(key, { ...request, maxSearches: req.maxSearches }) : anthropicAnswer(key, { ...request, maxSearches: req.maxSearches }),
  );
}

/**
 * A chat turn, streamed through `onText`, with optional web search and an optional tool for a
 * structured revision. Prose for the owner to read, plus data they choose to apply.
 */
export async function runChat<S extends z.ZodType>(ctx: AiContext, req: ChatRequest<S>): Promise<ChatResult<z.infer<S>>> {
  const options = { webSearch: req.webSearch, maxSearches: req.maxSearches, tool: req.tool, onText: req.onText };
  const reply = await call(ctx, req, (provider, key, request) => (provider === "openai" ? openaiChat(key, { ...request, ...options }) : anthropicChat(key, { ...request, ...options })));
  let proposal: z.infer<S> | null = null;
  let proposalError: string | null = null;
  if (req.tool && reply.toolInput != null) {
    const parsed = req.tool.schema.safeParse(reply.toolInput);
    if (parsed.success) proposal = parsed.data;
    else proposalError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  return { text: reply.text, proposal, proposalError, citations: reply.citations, searches: reply.searches, model: reply.model };
}

/** A picture (Ads AD2): OpenAI only, so the image task needs an OpenAI key whatever the default provider. */
export async function runImage(ctx: AiContext, req: BaseRequest & { size: string }): Promise<Buffer> {
  return call(ctx, req, (provider, key, request) => {
    if (provider !== "openai") throw new AiError("Pictures are drawn by OpenAI's image models: pick one for the image task in Settings → General → AI", "config");
    return openaiImage(key, { ...request, size: req.size });
  });
}

// --- Batches (ARCHITECTURE.md 5.2) -------------------------------------------------------------

export const BATCH_POLL_QUEUE = "ai_batch_poll";
/** Waits between checks on a batch: a minute at first, then up to ten. */
export const batchPollDelaySeconds = (polls: number) => [60, 60, 120, 120, 300][polls] ?? 600;

export type BatchSubmitRequest = {
  task: AiTask;
  promptVersion: string;
  /** What the results are for; its handler stores them (`BATCH_PURPOSES` in jobs/batches.ts). */
  purpose: (typeof aiBatches.$inferSelect)["purpose"];
  /** Each request with what its result is for (`ref`, e.g. the opportunity). */
  requests: (BatchRequest & { ref: Record<string, string> })[];
  schema: z.ZodType;
};

/**
 * Sends structured requests through the task's provider's batch API at about half the price,
 * after the same budget guard and key check as a single call, and queues the job that waits for
 * the results. Nothing is logged to ai_runs until the results come back (`collectBatch`).
 */
export async function submitBatch(ctx: AiContext, req: BatchSubmitRequest): Promise<string> {
  if (req.requests.length === 0) throw new Error("A batch needs at least one request");
  const { config, provider, key } = await prepare(ctx, req);
  ctx.signal?.throwIfAborted();
  const request = { task: req.task, config, requests: req.requests, schema: req.schema, signal: ctx.signal };
  let externalId: string;
  let inputFileId: string | null = null;
  try {
    if (provider === "openai") ({ id: externalId, inputFileId } = await openaiBatchSubmit(key, request));
    else externalId = await anthropicBatchSubmit(key, request);
  } catch (error) {
    const e = AiError.wrap(error, { model: config.model });
    await logRun(ctx, { task: req.task, model: config.model, promptVersion: req.promptVersion, status: "error", error: `Couldn't send the batch: ${e.message}` });
    throw e;
  }
  const [row] = await getDb()
    .insert(aiBatches)
    .values({
      workspaceId: ctx.workspaceId,
      provider,
      externalId,
      inputFileId,
      purpose: req.purpose,
      task: req.task,
      model: config.model,
      promptVersion: req.promptVersion,
      items: req.requests.map((r) => ({ customId: r.customId, ref: r.ref })),
    })
    .returning({ id: aiBatches.id });
  await enqueue(ctx.workspaceId, BATCH_POLL_QUEUE, { batchId: row!.id }, { runAfter: new Date(Date.now() + batchPollDelaySeconds(0) * 1000) });
  return row!.id;
}

export type CollectedBatch = { ended: false } | { ended: true; failed?: string; results: (BatchItemResult & { ref: Record<string, string> })[] };

/**
 * Checks a batch; once it has ended, reads its results, logs one ai_runs row per request (half
 * price, the wait as latency) and marks the batch ended. Requests with no result (expired,
 * cancelled) come back as failed so their handler can retry them another way.
 */
export async function collectBatch(ctx: AiContext, batch: typeof aiBatches.$inferSelect, schema: z.ZodType): Promise<CollectedBatch> {
  const provider = batch.provider;
  const key = await aiApiKey(provider);
  if (!key) throw new AiError(`No ${PROVIDERS[provider].keyLabel} to read the batch's results: add it again in Settings → General → AI`, "config");
  const state = provider === "openai" ? await openaiBatchState(key, batch.externalId, ctx.signal) : await anthropicBatchState(key, batch.externalId, ctx.signal);
  if (!state.ended) {
    await getDb().update(aiBatches).set({ polls: batch.polls + 1 }).where(eq(aiBatches.id, batch.id));
    return { ended: false };
  }
  const expect = { schema, task: batch.task, config: { maxTokens: (await loadModelConfig(ctx, batch.task as AiTask)).maxTokens } };
  const results = state.failed
    ? []
    : provider === "openai"
      ? await openaiBatchResults(key, batch.externalId, expect, ctx.signal)
      : await anthropicBatchResults(key, batch.externalId, expect, ctx.signal);
  const byId = new Map(results.map((r) => [r.customId, r]));
  const latencyMs = Date.now() - batch.submittedAt.getTime();
  const out: (BatchItemResult & { ref: Record<string, string> })[] = [];
  let cost = 0;
  for (const item of batch.items) {
    const result: BatchItemResult = byId.get(item.customId) ?? { customId: item.customId, ok: false, error: state.failed ?? "No result: the batch ended before this request ran", kind: "expired" };
    out.push({ ...result, ref: item.ref });
    if (!result.usage && !result.ok && result.kind === "expired") continue; // never ran, never billed
    const usage = result.usage ?? emptyUsage();
    const model = result.model ?? batch.model;
    cost += estimateCostUsd(model, usage) * BATCH_PRICE_FACTOR;
    await logRun(ctx, {
      task: batch.task,
      model,
      promptVersion: batch.promptVersion,
      status: result.ok ? "ok" : result.kind === "refused" ? "refused" : "error",
      usage,
      latencyMs,
      error: result.ok ? undefined : result.error,
      batchId: batch.id,
    });
  }
  await getDb()
    .update(aiBatches)
    .set({
      status: state.failed ? "failed" : "ended",
      error: state.failed ?? null,
      succeeded: out.filter((r) => r.ok).length,
      errored: out.filter((r) => !r.ok).length,
      costUsd: cost,
      polls: batch.polls + 1,
      endedAt: new Date(),
    })
    .where(eq(aiBatches.id, batch.id));
  return { ended: true, failed: state.failed, results: out };
}

/** Cancels a batch at the provider (Stop); requests that already ran are billed there but not stored. */
export async function cancelBatch(workspaceId: string, batchId: string): Promise<void> {
  const [batch] = await getDb()
    .select()
    .from(aiBatches)
    .where(and(eq(aiBatches.id, batchId), eq(aiBatches.workspaceId, workspaceId)));
  if (!batch || batch.status !== "submitted") return;
  const key = await aiApiKey(batch.provider);
  let error: string | null = "Stopped by you";
  if (key) {
    try {
      if (batch.provider === "openai") await openaiBatchCancel(key, batch.externalId);
      else await anthropicBatchCancel(key, batch.externalId);
    } catch (e) {
      error = `Stopped by you; the provider didn't confirm the cancel (${e instanceof Error ? e.message : String(e)})`;
    }
  }
  await getDb().update(aiBatches).set({ status: "cancelled", error, endedAt: new Date() }).where(eq(aiBatches.id, batch.id));
}
