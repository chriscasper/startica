import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "./pricing.ts";

const none = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

describe("estimateCostUsd", () => {
  it("prices input and output per million tokens", () => {
    expect(estimateCostUsd("claude-opus-5-5", { ...none, inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(24);
  });

  it("charges cache writes at 1.25x input and cache reads at the read rate", () => {
    expect(estimateCostUsd("claude-sonnet-5-5", { ...none, cacheWriteTokens: 1_000_000 })).toBeCloseTo(2.5);
    expect(estimateCostUsd("claude-sonnet-5-5", { ...none, cacheReadTokens: 1_000_000 })).toBeCloseTo(0.2);
  });

  it("prices OpenAI models, with cached input at the cached rate", () => {
    expect(estimateCostUsd("gpt-6.1-sol", { ...none, inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(12);
    expect(estimateCostUsd("gpt-6.1-sol", { ...none, cacheReadTokens: 1_000_000 })).toBeCloseTo(0.1);
  });

  it("returns 0 for unknown models instead of guessing", () => {
    expect(estimateCostUsd("some-future-model", { ...none, inputTokens: 1000 })).toBe(0);
  });
});
