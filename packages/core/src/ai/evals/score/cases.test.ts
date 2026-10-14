import { describe, expect, it } from "vitest";
import { labelFromDecision, mergeCases, type ScoreCase } from "./cases.ts";

const c = (id: string, source: ScoreCase["source"], expect: ScoreCase["expect"]): ScoreCase => ({
  id,
  source,
  expect,
  note: "",
  conversation: { channel: "reddit", kind: "post", community: null, title: null, threadTitle: null, body: "" },
});

describe("score eval cases", () => {
  it("labels only decisions the scorer is responsible for", () => {
    expect(labelFromDecision("posted", null)).toBe("reply");
    expect(labelFromDecision("dismissed", "off_topic")).toBe("skip");
    expect(labelFromDecision("dismissed", "already_answered")).toBe("skip");
    expect(labelFromDecision("dismissed", "too_old")).toBeNull();
    expect(labelFromDecision("dismissed", "rules_forbid")).toBeNull();
    expect(labelFromDecision("drafted", null)).toBeNull();
    expect(labelFromDecision("archived", null)).toBeNull();
  });

  it("updates owner cases by id and keeps seed cases first", () => {
    const merged = mergeCases([c("seed-01", "seed", "reply"), c("reddit:t3_a", "owner", "skip")], [c("reddit:t3_a", "owner", "reply"), c("hackernews:1", "owner", "skip")]);
    expect(merged.map((m) => [m.id, m.expect])).toEqual([
      ["seed-01", "reply"],
      ["hackernews:1", "skip"],
      ["reddit:t3_a", "reply"],
    ]);
  });
});
