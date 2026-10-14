/**
 * The AI providers and models Startica can call (ARCHITECTURE.md section 5). Which
 * provider a call goes to follows from its model ID, so per-task routing in
 * `ai_models` can mix providers when both keys are saved.
 */
export type AiProvider = "anthropic" | "openai";
export type AiTask = "ping" | "strategy" | "research" | "draft" | "vision" | "score" | "answer" | "image";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type ModelConfig = { model: string; effort: Effort | null; maxTokens: number };

// USD per million tokens (checked 2026-10-09). Both providers bill cache writes at
// 1.25x input (pricing.ts); cacheRead is the cached-input rate.
export type Price = { input: number; output: number; cacheRead: number };
// Image models (Ads AD2) are billed per token too: input is the prompt's text, output the image.
type ModelInfo = { id: string; provider: AiProvider; label: string; price: Price; kind?: "image" };

export const MODELS: ModelInfo[] = [
  { id: "claude-fable-5-1", provider: "anthropic", label: "Claude Fable 5.1", price: { input: 10, output: 50, cacheRead: 0.25 } },
  { id: "claude-opus-5-5", provider: "anthropic", label: "Claude Opus 5.5", price: { input: 4, output: 20, cacheRead: 0.2 } },
  { id: "claude-sonnet-5-5", provider: "anthropic", label: "Claude Sonnet 5.5", price: { input: 2, output: 10, cacheRead: 0.2 } },
  { id: "claude-haiku-5-5", provider: "anthropic", label: "Claude Haiku 5.5", price: { input: 0.1, output: 0.5, cacheRead: 0.01 } },
  { id: "gpt-6-astra", provider: "openai", label: "GPT-6 Astra", price: { input: 10, output: 50, cacheRead: 1 } },
  { id: "gpt-6.1-sol", provider: "openai", label: "GPT-6.1 Sol", price: { input: 2, output: 10, cacheRead: 0.1 } },
  { id: "gpt-6-luna", provider: "openai", label: "GPT-6 Luna", price: { input: 0.1, output: 0.5, cacheRead: 0.01 } },
  // Same token prices (checked 2026-10-13); Sunburst renders more carefully and so uses more output tokens.
  { id: "gpt-image-2.5-flare", provider: "openai", label: "GPT Image 2.5 Flare", price: { input: 5, output: 30, cacheRead: 1.25 }, kind: "image" },
  { id: "gpt-image-2.5-sunburst", provider: "openai", label: "GPT Image 2.5 Sunburst", price: { input: 5, output: 30, cacheRead: 1.25 }, kind: "image" },
];

/** The models a task can use: image models for the image task, text models for the rest. */
export function modelsFor(task: string): ModelInfo[] {
  return MODELS.filter((m) => (task === "image") === (m.kind === "image"));
}

/** Older models still priced so past `ai_runs` keep their cost; not offered in Settings. */
export const RETIRED_PRICES: Record<string, Price> = {
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
};

export const DEFAULT_MODELS: Record<AiProvider, Record<AiTask, ModelConfig>> = {
  anthropic: {
    ping: { model: "claude-haiku-5-5", effort: "low", maxTokens: 256 },
    strategy: { model: "claude-opus-5-5", effort: "high", maxTokens: 16000 },
    research: { model: "claude-opus-5-5", effort: "high", maxTokens: 16000 },
    draft: { model: "claude-sonnet-5-5", effort: "medium", maxTokens: 4000 },
    vision: { model: "claude-sonnet-5-5", effort: "medium", maxTokens: 4000 },
    score: { model: "claude-haiku-5-5", effort: "low", maxTokens: 1024 },
    // AI visibility: answers questions the way an assistant would, with web search.
    answer: { model: "claude-sonnet-5-5", effort: "low", maxTokens: 4000 },
    // Ads AD2 pictures: OpenAI only, so it needs an OpenAI key even with Claude as the default. Effort = image quality.
    image: { model: "gpt-image-2.5-flare", effort: "medium", maxTokens: 4096 },
  },
  // GPT-6.1 Sol for strategy as well: GPT-6 Astra costs 2.5x Opus (like Fable), so it's opt-in.
  // OpenAI's max_output_tokens includes reasoning, hence the larger budgets.
  openai: {
    ping: { model: "gpt-6-luna", effort: "low", maxTokens: 1024 },
    strategy: { model: "gpt-6.1-sol", effort: "high", maxTokens: 32000 },
    research: { model: "gpt-6.1-sol", effort: "high", maxTokens: 32000 },
    draft: { model: "gpt-6.1-sol", effort: "medium", maxTokens: 8000 },
    vision: { model: "gpt-6.1-sol", effort: "medium", maxTokens: 8000 },
    score: { model: "gpt-6-luna", effort: "low", maxTokens: 2048 },
    answer: { model: "gpt-6.1-sol", effort: "low", maxTokens: 8000 },
    image: { model: "gpt-image-2.5-flare", effort: "medium", maxTokens: 4096 },
  },
};

// usageUrl: the provider console's usage page. Account-wide usage needs an admin key, so Startica links there instead of fetching it.
export const PROVIDERS: Record<AiProvider, { label: string; keyLabel: string; keyPrefix: string; keyUrl: string; usageUrl: string; secret: string }> = {
  anthropic: {
    label: "Claude (Anthropic)",
    keyLabel: "Anthropic API key",
    keyPrefix: "sk-ant-",
    keyUrl: "https://platform.claude.com/settings/keys",
    usageUrl: "https://platform.claude.com/usage",
    secret: "anthropic_api_key",
  },
  openai: {
    label: "OpenAI",
    keyLabel: "OpenAI API key",
    keyPrefix: "sk-",
    keyUrl: "https://platform.openai.com/api-keys",
    usageUrl: "https://platform.openai.com/usage",
    secret: "openai_api_key",
  },
};

export const isProvider = (value: unknown): value is AiProvider => value === "anthropic" || value === "openai";

/** The provider that serves a model ID, or null for an unknown model. */
export function providerOf(model: string): AiProvider | null {
  const known = MODELS.find((m) => m.id === model || model.startsWith(`${m.id}-`));
  if (known) return known.provider;
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gpt-")) return "openai";
  return null;
}

/** Price for a model ID; a dated snapshot ID (as OpenAI reports, e.g. gpt-6-luna-2026-09-01) uses its model's price. */
export function priceOf(model: string): Price | null {
  const exact = MODELS.find((m) => m.id === model)?.price ?? RETIRED_PRICES[model];
  return exact ?? MODELS.find((m) => model.startsWith(`${m.id}-`))?.price ?? null;
}

/** "Claude Opus 5.5 ($4 / $20)" for model pickers. */
export function modelLabel(model: string): string {
  const m = MODELS.find((x) => x.id === model);
  return m ? `${m.label} ($${m.price.input} / $${m.price.output})` : model;
}

/** A key for this provider looks right (Anthropic keys also start with sk-, so check them first). */
export function keyLooksValid(provider: AiProvider, key: string): boolean {
  if (provider === "anthropic") return key.startsWith(PROVIDERS.anthropic.keyPrefix);
  return key.startsWith(PROVIDERS.openai.keyPrefix) && !key.startsWith(PROVIDERS.anthropic.keyPrefix);
}
