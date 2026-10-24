import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { contentPieces, conversations, dailyMoves, opportunities, products } from "@startica/db/schema";
import type { AiContext } from "../ai/client.ts";
import { channelLabel } from "../channels/labels.ts";
import { ensureTodayMoves, localDay } from "../growth/moves.ts";
import { calendarMove, pieceHref, replyHref } from "./calendar-moves.ts";

/**
 * The content calendar (ARCHITECTURE.md, Content Studio): planned times on Content Studio pieces
 * (`content_pieces.planned_at`) and on drafted Inbox replies (`opportunities.planned_at`), a
 * reminder job, and the desktop notification it sends. Planning never posts anything: the
 * reminder opens the item, and the owner presses Post… and then the site's own button.
 */

export { pieceHref, replyHref } from "./calendar-moves.ts";

export type CalendarItem = {
  kind: "piece" | "reply";
  id: string;
  plannedAt: Date;
  channel: string;
  /** The community a reply goes to (r/…, a forum, a hashtag); null for pieces. */
  community: string | null;
  title: string;
  status: string;
  posted: boolean;
  planId: string | null;
  planWhy: string | null;
  href: string;
};

/** Everything planned between `from` and `to` (pieces and replies, posted ones too), earliest first. */
export async function calendarItems(productId: string, from: Date, to: Date): Promise<CalendarItem[]> {
  const db = getDb();
  const [pieces, replies] = await Promise.all([
    db
      .select()
      .from(contentPieces)
      .where(and(eq(contentPieces.productId, productId), gte(contentPieces.plannedAt, from), lt(contentPieces.plannedAt, to))),
    db
      .select({ o: opportunities, c: { channel: conversations.channel, community: conversations.community, title: conversations.title, threadTitle: conversations.threadTitle } })
      .from(opportunities)
      .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
      .where(
        and(
          eq(opportunities.productId, productId),
          inArray(opportunities.status, ["drafting", "drafted", "posted", "failed"]),
          gte(opportunities.plannedAt, from),
          lt(opportunities.plannedAt, to),
        ),
      ),
  ]);
  return [
    ...pieces.map((p) => ({
      kind: "piece" as const,
      id: p.id,
      plannedAt: p.plannedAt!,
      channel: p.channel,
      community: null,
      title: p.title || p.topic,
      status: p.status,
      posted: p.status === "posted",
      planId: p.planId,
      planWhy: p.planWhy,
      href: pieceHref(p.id),
    })),
    ...replies.map(({ o, c }) => ({
      kind: "reply" as const,
      id: o.id,
      plannedAt: o.plannedAt!,
      channel: c.channel,
      community: c.community,
      title: `Reply: ${c.title ?? c.threadTitle ?? "a conversation"}`,
      status: o.status,
      posted: o.status === "posted",
      planId: null,
      planWhy: null,
      href: replyHref(o.id),
    })),
  ].sort((a, b) => a.plannedAt.getTime() - b.plannedAt.getTime());
}

// --- Planning ---------------------------------------------------------------------------

/** A planned time from a form: an ISO string, `YYYY-MM-DDTHH:MM` (local, from a datetime-local input) or empty to clear. */
export const plannedInput = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "That isn't a date and time" });
      return z.NEVER;
    }
    return d;
  });

/** Sets (or clears) when a piece is planned; a new time means a new reminder. */
export async function planPiece(workspaceId: string, pieceId: string, at: Date | null): Promise<void> {
  const db = getDb();
  const [piece] = await db.select({ id: contentPieces.id, status: contentPieces.status }).from(contentPieces).where(and(eq(contentPieces.id, pieceId), eq(contentPieces.workspaceId, workspaceId)));
  if (!piece) throw new Error("Not found");
  if (piece.status === "posted" && at) throw new Error("It's posted already");
  await db.update(contentPieces).set({ plannedAt: at, remindedAt: null }).where(eq(contentPieces.id, piece.id));
}

/** Sets (or clears) when a drafted Inbox reply is planned. */
export async function planReply(workspaceId: string, opportunityId: string, at: Date | null): Promise<void> {
  const db = getDb();
  const [opp] = await db.select({ id: opportunities.id, status: opportunities.status }).from(opportunities).where(and(eq(opportunities.id, opportunityId), eq(opportunities.workspaceId, workspaceId)));
  if (!opp) throw new Error("Not found");
  if (at && !["drafting", "drafted", "failed"].includes(opp.status)) throw new Error("Only replies with a draft can be planned");
  await db.update(opportunities).set({ plannedAt: at, remindedAt: null }).where(eq(opportunities.id, opp.id));
}

// --- Reminders --------------------------------------------------------------------------

/** How early a reminder may go out: the job runs every 15 minutes, so a 10:05 post is reminded at 10:00. */
export const REMIND_LEAD_MS = 10 * 60_000;

export type DueItem = { kind: "piece" | "reply"; id: string; productId: string; channel: string; title: string; plannedAt: Date };

/** Planned items due by `now` (plus the lead) that haven't been reminded and aren't posted. */
export async function dueItems(workspaceId: string, now = new Date()): Promise<DueItem[]> {
  const db = getDb();
  const until = new Date(now.getTime() + REMIND_LEAD_MS);
  const [pieces, replies] = await Promise.all([
    db
      .select({ id: contentPieces.id, productId: contentPieces.productId, channel: contentPieces.channel, topic: contentPieces.topic, title: contentPieces.title, plannedAt: contentPieces.plannedAt })
      .from(contentPieces)
      .where(and(eq(contentPieces.workspaceId, workspaceId), isNotNull(contentPieces.plannedAt), lte(contentPieces.plannedAt, until), isNull(contentPieces.remindedAt), ne(contentPieces.status, "posted")))
      .orderBy(asc(contentPieces.plannedAt)),
    db
      .select({ id: opportunities.id, productId: opportunities.productId, channel: conversations.channel, title: conversations.title, threadTitle: conversations.threadTitle, plannedAt: opportunities.plannedAt })
      .from(opportunities)
      .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
      .where(
        and(
          eq(opportunities.workspaceId, workspaceId),
          isNotNull(opportunities.plannedAt),
          lte(opportunities.plannedAt, until),
          isNull(opportunities.remindedAt),
          or(eq(opportunities.status, "drafted"), eq(opportunities.status, "drafting")),
        ),
      )
      .orderBy(asc(opportunities.plannedAt)),
  ]);
  return [
    ...pieces.map((p) => ({ kind: "piece" as const, id: p.id, productId: p.productId, channel: p.channel, title: p.title || p.topic, plannedAt: p.plannedAt! })),
    ...replies.map((r) => ({ kind: "reply" as const, id: r.id, productId: r.productId, channel: r.channel, title: `Reply: ${r.title ?? r.threadTitle ?? "a conversation"}`, plannedAt: r.plannedAt! })),
  ].sort((a, b) => a.plannedAt.getTime() - b.plannedAt.getTime());
}

/** A desktop notification; the Electron process shows it and opens `href` when it's clicked. */
export type DesktopNotification = { title: string; body: string; href: string };

const NOTIFIER = Symbol.for("startica.notifier");
const g = globalThis as unknown as { [NOTIFIER]?: ((n: DesktopNotification) => void) | null };

/** Set at startup in the desktop app (shared through globalThis: Next bundles modules more than once). */
export function setNotifier(notify: ((n: DesktopNotification) => void) | null): void {
  g[NOTIFIER] = notify;
}

/** What a reminder run says: one item opens itself, several open the calendar. */
export function reminderNotification(items: DueItem[], productName: string | null): DesktopNotification | null {
  if (items.length === 0) return null;
  if (items.length === 1) {
    const item = items[0]!;
    return {
      title: `Time to post on ${channelLabel(item.channel)}`,
      body: `${item.title}${productName ? ` (${productName})` : ""}. Click to open it, then press Post… when you're ready.`,
      href: item.kind === "piece" ? pieceHref(item.id) : replyHref(item.id),
    };
  }
  return {
    title: `${items.length} posts are due`,
    body: `${items
      .slice(0, 3)
      .map((i) => i.title)
      .join(" · ")}${items.length > 3 ? " …" : ""}. Click to open the calendar.`,
    href: "/content/calendar",
  };
}

export const calendarRemindPayload = z.object({ workspaceId: z.guid() });

/**
 * calendar_remind (every 15 minutes): marks due items reminded (once each), adds them to Today
 * (kind `calendar`) and sends one desktop notification. Never posts anything.
 */
export async function runCalendarRemind(_ctx: AiContext, payload: z.infer<typeof calendarRemindPayload>, now = new Date()) {
  const db = getDb();
  const due = await dueItems(payload.workspaceId, now);
  if (due.length === 0) return { due: 0 };
  // Mark first, so a crash after this can't send the same reminder twice.
  const pieceIds = due.filter((d) => d.kind === "piece").map((d) => d.id);
  const replyIds = due.filter((d) => d.kind === "reply").map((d) => d.id);
  if (pieceIds.length) await db.update(contentPieces).set({ remindedAt: now }).where(inArray(contentPieces.id, pieceIds));
  if (replyIds.length) await db.update(opportunities).set({ remindedAt: now }).where(inArray(opportunities.id, replyIds));

  const day = localDay(now);
  for (const productId of new Set(due.map((d) => d.productId))) {
    const existing = await ensureTodayMoves(payload.workspaceId, productId);
    const refs = new Set(existing.filter((m) => m.kind === "calendar").map((m) => m.refId));
    const fresh = due.filter((d) => d.productId === productId).map(calendarMove).filter((m) => !refs.has(m.refId));
    if (fresh.length) {
      const rank = existing.reduce((n, m) => Math.max(n, m.rank), 0);
      await db.insert(dailyMoves).values(fresh.map((m, i) => ({ ...m, workspaceId: payload.workspaceId, productId, day, rank: rank + i + 1, source: "system" as const })));
    }
  }

  const productIds = [...new Set(due.map((d) => d.productId))];
  const names = await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, productIds));
  const notification = reminderNotification(due, productIds.length === 1 ? (names[0]?.name ?? null) : null);
  if (notification) g[NOTIFIER]?.(notification);
  return { due: due.length, notified: Boolean(notification && g[NOTIFIER]) };
}
