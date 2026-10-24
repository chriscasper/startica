import { describe, expect, it } from "vitest";
import { findMentions, matchKeywords } from "./matching.ts";
import { buildTrends, dayList, detectSpike, type TrendRow } from "./trends.ts";

describe("keyword and mention matching", () => {
  it("matches keyword phrases on word boundaries, ignoring case, spacing and a plural", () => {
    const text = "Looking for a Field  Notes app that works offline. Offline note-taking matters; fieldnotes.example is not it.";
    expect(matchKeywords(text, ["field notes app", "offline note taking", "notes", "transect data collection"])).toEqual(["field notes app", "offline note taking", "notes"]);
    expect(matchKeywords("best field notes apps?", ["field notes app"])).toEqual(["field notes app"]);
    expect(matchKeywords("a fieldwork tablets thread", ["fieldwork tablet"])).toEqual(["fieldwork tablet"]);
    expect(matchKeywords("myfield notes app", ["field notes app"])).toEqual([]);
  });

  it("finds the product and competitors by name, not inside other words", () => {
    const m = { product: "Fieldnote", competitors: [{ id: "c1", name: "TerraJot" }, { id: "c2", name: "Logbook Pro" }, { id: "c3", name: "Quadrat" }] };
    expect(findMentions("Switched from terrajot to Fieldnote last month. logbook pro was fine too.", m)).toEqual({ product: true, competitorIds: ["c1", "c2"] });
    expect(findMentions("My fieldnotes are a mess; quadrats in ecology are squares.", m)).toEqual({ product: false, competitorIds: [] });
    expect(findMentions("(Quadrat) vs Fieldnote's export", m)).toEqual({ product: true, competitorIds: ["c3"] });
  });
});

describe("spike detection", () => {
  const quiet = (n: number, v = 1) => Array.from({ length: n }, () => v);

  it("flags a day with at least 5 and 3× the 14-day average", () => {
    expect(detectSpike([...quiet(14), 6])).toMatchObject({ window: "day", offset: 0, count: 6, baseline: 1, ratio: 6 });
    // Yesterday counts too (today is still filling up).
    expect(detectSpike([...quiet(14), 7, 0])).toMatchObject({ window: "day", offset: 1, count: 7 });
    expect(detectSpike([...quiet(14), 4])).toBeNull(); // under the minimum
    expect(detectSpike([...quiet(14, 2), 5])).toBeNull(); // only 2.5× a busy baseline
    expect(detectSpike([...quiet(14, 2), 6])).toMatchObject({ ratio: 3 });
  });

  it("treats a quiet baseline as at least one a day", () => {
    expect(detectSpike([...quiet(14, 0), 5])).toMatchObject({ count: 5, baseline: 0, ratio: 5 });
    expect(detectSpike([...quiet(14, 0), 3])).toBeNull();
  });

  it("needs 14 days of history, so a new product doesn't spike on everything", () => {
    expect(detectSpike([...quiet(14, 0), 9], 10)).toBeNull();
  });

  it("flags a week with at least 10 and 2× the weekly average of the 3 weeks before", () => {
    const steady = Array.from({ length: 21 }, (_, i) => i % 2); // 10 in 3 weeks
    const busyWeek = [...steady, 2, 2, 2, 2, 2, 1, 1];
    expect(detectSpike(busyWeek)).toMatchObject({ window: "week", count: 12 });
    expect(detectSpike([...quiet(21, 1), ...quiet(7, 2)])).toMatchObject({ window: "week", count: 14, baseline: 7, ratio: 2 });
    expect(detectSpike([...quiet(21, 1), ...quiet(7, 1.5)])).toBeNull();
    expect(detectSpike(busyWeek, 20)).toBeNull(); // not enough history for a week
  });
});

describe("listening trends", () => {
  const today = "2026-10-21";
  const days = dayList(today, 40);
  const row = (day: string, extra: Partial<TrendRow> = {}): TrendRow => ({ day, channel: "reddit", community: "ecology", matchedKeywords: ["field notes app"], mentions: { product: false, competitorIds: [] }, sentiment: "neutral", ...extra });

  it("counts per day, keyword and community, and finds a keyword spike", () => {
    const rows: TrendRow[] = [];
    for (const d of days.slice(0, -1)) rows.push(row(d));
    for (let i = 0; i < 6; i++) rows.push(row(today, { matchedKeywords: ["offline note taking"], channel: "hackernews", community: "Hacker News", sentiment: i < 3 ? "negative" : null, mentions: { product: i === 0, competitorIds: i < 4 ? ["c1"] : [] } }));
    const t = buildTrends(rows, { today, range: 30, historyDays: 40, productName: "Fieldnote", competitors: [{ id: "c1", name: "TerraJot" }, { id: "c2", name: "Quadrat" }] });
    expect(t.days).toHaveLength(30);
    expect(t.days.at(-1)).toBe(today);
    expect(t.total.total).toBe(29 + 6);
    expect(t.total.counts.at(-1)).toBe(6);
    expect(t.keywords.map((k) => [k.label, k.total])).toEqual([["field notes app", 29], ["offline note taking", 6]]);
    expect(t.communities.map((c) => c.label)).toEqual(["r/ecology", "Hacker News"]);
    expect(t.spikes.map((s) => [s.kind, s.label, s.window, s.day])).toEqual([
      ["keyword", "offline note taking", "day", today],
      ["community", "Hacker News", "day", today],
    ]);
    expect(t.sentiment).toEqual({ counts: { positive: 0, neutral: 29, negative: 3, mixed: 0 }, scored: 32, unscored: 3 });
    expect(t.shareOfVoice).toEqual([
      { id: null, name: "Fieldnote", mentions: 1, share: 0.2 },
      { id: "c1", name: "TerraJot", mentions: 4, share: 0.8 },
      { id: "c2", name: "Quadrat", mentions: 0, share: 0 },
    ]);
  });

  it("leaves conversations from before the range out", () => {
    const old = days[2]!; // 37 days ago
    const t = buildTrends([row(old, { sentiment: "positive" })], { today, range: 30, historyDays: 40, productName: "Fieldnote", competitors: [] });
    expect(t.total.total).toBe(0);
    expect(t.sentiment.scored).toBe(0);
    expect(t.keywords).toEqual([]);
  });
});
