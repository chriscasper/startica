import { priceOf } from "./models.ts";

// Prices per model live in models.ts. Both providers bill cache writes at 1.25x input.
const CACHE_WRITE_MULTIPLIER = 1.25;

// Web search is billed per search on top of tokens ($10 per 1,000 at both providers);
// Claude's web fetch is tokens only.
const WEB_SEARCH_USD_PER_REQUEST = 10 / 1000;

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearchRequests?: number;
};

export function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearchRequests: 0 };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    webSearchRequests: (a.webSearchRequests ?? 0) + (b.webSearchRequests ?? 0),
  };
}

export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const searches = (usage.webSearchRequests ?? 0) * WEB_SEARCH_USD_PER_REQUEST;
  const price = priceOf(model);
  if (!price) return searches;
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    searches +
    usage.inputTokens * perToken(price.input) +
    usage.cacheWriteTokens * perToken(price.input * CACHE_WRITE_MULTIPLIER) +
    usage.cacheReadTokens * perToken(price.cacheRead) +
    usage.outputTokens * perToken(price.output)
  );
}
