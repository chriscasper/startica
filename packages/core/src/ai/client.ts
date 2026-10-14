import { and, eq, gte, sum } from "drizzle-orm";
import type { z } from "zod";
import { getSetting, setSetting } from "@startica/db/bootstrap";
import { getDb } from "@startica/db/client";
import { aiModels, aiRuns } from "@startica/db/schema";
import { readSecretByName } from "@startica/db/secrets";
import { anthropicAnswer, anthropicResearch, anthropicStructured } from "./anthropic.ts";
import { AiError, type AiMessage, type Answer, type CallRequest, type CallResult, type ResearchOptions } from "./errors.ts";
import { DEFAULT_MODELS, isProvider, PROVIDERS, providerOf, type AiProvider, type AiTask, type ModelConfig } from "./models.ts";
import { openaiAnswer, openaiImage, openaiResearch, openaiStructured } from "./openai.ts";
import { emptyUsage, estimateCostUsd, type TokenUsage } from "./pricing.ts";

export { AiError, type AiImage, type AiMessage, type AiPart, type Answer } from "./errors.ts";
export type { AiProvider, AiTask } from "./models.ts";

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
};

export type StructuredRequest<S extends z.ZodType> = BaseRequest & { schema: S };
export type ResearchRequest = BaseRequest & ResearchOptions;

/** The API key saved in Settings (encrypted) for a provider. */
export async function aiApiKey(provider: AiProvider): Promise<string | null> {
  return readSecretByName(PROVIDERS[provider].secret);
}

/**
 * The provider picked at setup or in Settings → General → AI. Before one is picked, the one
 * with a saved key (Claude first), else Claude.
 */
export async function activeProvider(): Promise<AiProvider> {
  const saved = await getSetting<string>(PROVIDER_SETTING);
  if (isProvider(saved)) return saved;
  if (await aiApiKey("anthropic")) return "anthropic";
  if (await aiApiKey("openai")) return "openai";
  return "anthropic";
}

/** Whether the active provider has a key, i.e. AI features can run. */
export async function hasAiKey(): Promise<boolean> {
  return Boolean(await aiApiKey(await activeProvider()));
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
  task: AiTask;
  model: string;
  promptVersion: string;
  status: "ok" | "error" | "refused" | "blocked";
  usage?: TokenUsage;
  latencyMs?: number;
  error?: string;
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
      costUsd: estimateCostUsd(log.model, usage),
      latencyMs: log.latencyMs ?? null,
      error: log.error ?? null,
    });
}

/**
 * Every call goes through here: routes the task to its model (and so its
 * provider), enforces the monthly budget, and logs the attempt to ai_runs,
 * whatever the outcome.
 */
async function call<T>(
  ctx: AiContext,
  req: BaseRequest,
  run: (provider: AiProvider, key: string, request: CallRequest) => Promise<CallResult<T>>,
): Promise<T> {
  const config = await loadModelConfig(ctx, req.task);
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

/** A picture (Ads AD2): OpenAI only, so the image task needs an OpenAI key whatever the default provider. */
export async function runImage(ctx: AiContext, req: BaseRequest & { size: string }): Promise<Buffer> {
  return call(ctx, req, (provider, key, request) => {
    if (provider !== "openai") throw new AiError("Pictures are drawn by OpenAI's image models: pick one for the image task in Settings → General → AI", "config");
    return openaiImage(key, { ...request, size: req.size });
  });
}
