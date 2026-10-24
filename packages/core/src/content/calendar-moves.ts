import { and, asc, eq, gte, isNull, lt, ne } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { contentPieces, conversations, opportunities } from "@startica/db/schema";
import { channelLabel } from "../channels/labels.ts";

/**
 * The content calendar's links and Today moves (kind `calendar`), kept free of other imports so
 * growth/moves.ts can use them without a cycle.
 */

/** Where a planned item opens: the calendar with the item in focus, where Post… is. */
export const pieceHref = (pieceId: string) => `/content/calendar?focus=piece:${pieceId}`;
export const replyHref = (opportunityId: string) => `/content/calendar?focus=reply:${opportunityId}`;

const clock = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

type CalendarMove = { kind: "calendar"; title: string; why: string; href: string; refId: string };

/** A Today move for one planned item. */
export function calendarMove(item: { kind: "piece" | "reply"; id: string; channel: string; title: string; plannedAt: Date }): CalendarMove {
  return {
    kind: "calendar",
    title: `Post “${short(item.title)}” on ${channelLabel(item.channel)} at ${clock(item.plannedAt)}`,
    why: item.kind === "piece" ? "Planned on your content calendar. Post… opens it; you press the site's button." : "A reply you planned to post today. Post… opens the thread; you press the site's button.",
    href: item.kind === "piece" ? pieceHref(item.id) : replyHref(item.id),
    refId: `${item.kind === "piece" ? "piece" : "opp"}:${item.id}`,
  };
}

/** Today's planned, unposted pieces and replies as Today moves, earliest first (at most `limit`). */
export async function calendarCandidates(productId: string, now = new Date(), limit = 2): Promise<CalendarMove[]> {
  const db = getDb();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const [pieces, replies] = await Promise.all([
    db
      .select({ id: contentPieces.id, channel: contentPieces.channel, topic: contentPieces.topic, title: contentPieces.title, plannedAt: contentPieces.plannedAt })
      .from(contentPieces)
      .where(and(eq(contentPieces.productId, productId), ne(contentPieces.status, "posted"), gte(contentPieces.plannedAt, start), lt(contentPieces.plannedAt, end)))
      .orderBy(asc(contentPieces.plannedAt))
      .limit(limit),
    db
      .select({ id: opportunities.id, channel: conversations.channel, title: conversations.title, threadTitle: conversations.threadTitle, plannedAt: opportunities.plannedAt })
      .from(opportunities)
      .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
      .where(and(eq(opportunities.productId, productId), eq(opportunities.status, "drafted"), gte(opportunities.plannedAt, start), lt(opportunities.plannedAt, end), isNull(opportunities.dismissReason)))
      .orderBy(asc(opportunities.plannedAt))
      .limit(limit),
  ]);
  return [
    ...pieces.map((p) => ({ kind: "piece" as const, id: p.id, channel: p.channel, title: p.title || p.topic, plannedAt: p.plannedAt! })),
    ...replies.map((r) => ({ kind: "reply" as const, id: r.id, channel: r.channel, title: `Reply: ${r.title ?? r.threadTitle ?? "a conversation"}`, plannedAt: r.plannedAt! })),
  ]
    .sort((a, b) => a.plannedAt.getTime() - b.plannedAt.getTime())
    .slice(0, limit)
    .map(calendarMove);
}
