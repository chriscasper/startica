import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { dailyMoves } from "@startica/db/schema";
import { newReplyCount } from "./replies.ts";
import { listeningSpikes } from "./trends.ts";

type Candidate = { kind: "listening" | "replies"; title: string; why: string; href: string; refId: string };

const SPIKE_QUIET_DAYS = 7;

/**
 * Today's moves from listening (ARCHITECTURE.md 8.1): new replies to the owner's posts
 * (kind `replies`), and the strongest listening spike (kind `listening`). A spike's move
 * is offered once: its `refId` names the keyword or community, and it isn't offered again
 * for 7 days after it was (whatever was done with it).
 */
export async function listeningCandidates(productId: string, today: string, now = new Date()): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const replies = await newReplyCount(productId);
  if (replies.count > 0) {
    out.push({
      kind: "replies",
      title: replies.count === 1 ? "Answer a new reply to your post" : `Answer ${replies.count} new replies to your posts`,
      why: "People answered something you posted. A reply from you keeps the conversation going while it's fresh.",
      href: "/inbox?tab=replies",
      refId: `replies:${replies.newestId}`,
    });
  }

  const spikes = await listeningSpikes(productId, now);
  if (spikes.length) {
    const since = new Date(now.getTime() - SPIKE_QUIET_DAYS * 86400_000).toLocaleDateString("en-CA");
    const recent = await getDb()
      .select({ refId: dailyMoves.refId })
      .from(dailyMoves)
      .where(and(eq(dailyMoves.productId, productId), eq(dailyMoves.kind, "listening"), gte(dailyMoves.day, since), lt(dailyMoves.day, today)));
    const offered = new Set(recent.map((r) => r.refId));
    const spike = spikes.find((s) => !offered.has(s.key));
    if (spike) {
      const what = spike.kind === "keyword" ? `“${spike.label}”` : spike.label;
      const when = spike.window === "week" ? "this week" : spike.offset === 0 ? "today" : "yesterday";
      out.push({
        kind: "listening",
        title: `Conversations about ${what} jumped ${when}`,
        why: `${spike.count} ${spike.window === "week" ? "in 7 days" : "in a day"}, against a usual ${spike.baseline} ${spike.window === "week" ? "a week" : "a day"}. Worth a look while they're live.`,
        href: "/inbox?tab=trends",
        refId: spike.key,
      });
    }
  }
  return out;
}
