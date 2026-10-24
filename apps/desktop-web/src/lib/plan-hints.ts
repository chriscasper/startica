import "server-only";
import { describeHint, hintFor, nextGoodTime, type BestTimes } from "@startica/core/content/best-time";
import type { PlanHint } from "@/components/app/plan-time";

/** The best-time hint for a post on `channel` (in `community`), with the next good time from now. Reads the clock. */
export function planHint(times: BestTimes, channel: string, community?: string | null, now = new Date()): PlanHint {
  const hint = hintFor(times, channel, community);
  return { text: describeHint(hint), next: nextGoodTime(hint, now)?.getTime() ?? null };
}
