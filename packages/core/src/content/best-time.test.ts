import { describe, expect, it } from "vitest";
import { bestWindows, computeBestTimes, describeHint, hintFor, MIN_CONVERSATIONS, MIN_POSTS, nextGoodTime, type BestTime } from "./best-time.ts";

// Local times throughout: the rules read the computer's own clock. 2026-10-19 is a Monday.
const at = (day: number, hour: number) => new Date(2026, 9, 19 + day, hour, 15);

describe("best time to post", () => {
  it("says there isn't enough data below the minimum sample", () => {
    const posts = Array.from({ length: MIN_POSTS - 1 }, (_, i) => ({ channel: "bluesky", at: at(i, 9), engagement: 10 }));
    const times = computeBestTimes({ posts, activity: [] });
    const hint = hintFor(times, "bluesky");
    expect(hint).toMatchObject({ enough: false, source: "engagement", sample: MIN_POSTS - 1, need: MIN_POSTS });
    expect(describeHint(hint)).toBe(`Not enough data yet: ${MIN_POSTS - 1} of ${MIN_POSTS} measured posts on Bluesky.`);
    expect(nextGoodTime(hint, at(0, 8))).toBeNull();
    // A channel nobody has posted on: no hint at all, said plainly.
    expect(hintFor(times, "linkedin")).toBeNull();
    expect(describeHint(null)).toMatch(/^Not enough data yet/);
  });

  it("finds the hours and days the owner's posts did best", () => {
    // Morning posts on Tuesday and Wednesday did well; evening posts on other days didn't.
    const posts = [
      ...[1, 2, 8, 9].flatMap((d) => [{ channel: "bluesky", at: at(d, 9), engagement: 40 }, { channel: "bluesky", at: at(d, 10), engagement: 30 }]),
      ...[0, 3, 4, 5].map((d) => ({ channel: "bluesky", at: at(d, 20), engagement: 2 })),
    ];
    const hint = hintFor(computeBestTimes({ posts, activity: [] }), "bluesky")!;
    expect(hint).toMatchObject({ enough: true, source: "engagement", sample: 12 });
    if (!hint.enough) throw new Error("expected a hint");
    expect(hint.hours).toContain(9);
    expect(hint.hours).not.toContain(20);
    expect(hint.days).toEqual([2, 3]); // Tuesday, Wednesday
    expect(describeHint(hint)).toMatch(/^Your Bluesky posts did best around .*09:00.* on Tue and Wed \(from 12 posts\)\.$/);
  });

  it("falls back to when the channel's watched communities are busiest", () => {
    const activity = Array.from({ length: MIN_CONVERSATIONS + 10 }, (_, i) => ({ channel: "reddit", community: "ecology", label: "r/ecology", at: at(i % 5, i % 4 === 0 ? 7 : 14) }));
    const times = computeBestTimes({ posts: [{ channel: "reddit", at: at(0, 3), engagement: 1 }], activity });
    expect(hintFor(times, "reddit")).toMatchObject({ enough: true, source: "activity", hours: [7, 14] });
    // The community's own hint, by name (case-insensitive).
    expect(hintFor(times, "reddit", "Ecology")).toMatchObject({ key: "reddit:ecology", label: "r/ecology", enough: true });
    // A community with too few conversations uses the channel's hint.
    expect(hintFor(times, "reddit", "AskAcademia")).toMatchObject({ key: "reddit", source: "activity" });
  });

  it("doesn't call a flat day a pattern", () => {
    const flat = Array.from({ length: 48 }, (_, i) => ({ at: at(i % 7, i % 24), weight: 1 }));
    expect(bestWindows(flat, "activity")).toBeNull();
  });

  it("picks the next good hour on a good day, with time to look the post over", () => {
    const hint: BestTime = { key: "x", label: "X", enough: true, source: "engagement", sample: 10, hours: [9, 17], days: [2, 4] };
    // Monday 08:00 → Tuesday 09:00.
    expect(nextGoodTime(hint, new Date(2026, 9, 19, 8, 0))).toEqual(new Date(2026, 9, 20, 9));
    // Tuesday 08:45: 09:00 is too soon (30 minutes' lead), so 17:00.
    expect(nextGoodTime(hint, new Date(2026, 9, 20, 8, 45))).toEqual(new Date(2026, 9, 20, 17));
    // Any day when no day stands out.
    expect(nextGoodTime({ ...hint, days: [] }, new Date(2026, 9, 19, 18, 0))).toEqual(new Date(2026, 9, 20, 9));
  });
});
