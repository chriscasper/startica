import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { contentPieces, conversations, dailyMoves, opportunities, products } from "@startica/db/schema";
import { localDay } from "../growth/moves.ts";
import { calendarItems, dueItems, planPiece, planReply, reminderNotification, runCalendarRemind, setNotifier, type DesktopNotification } from "./calendar.ts";

let workspaceId = "";
let productId = "";
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-calendar-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning())[0]!.id;
});
afterAll(() => {
  setNotifier(null);
  closeDatabase();
});

const piece = async (values: Partial<typeof contentPieces.$inferInsert> = {}) =>
  (await getDb().insert(contentPieces).values({ workspaceId, productId, channel: "bluesky", topic: "Field notes without signal", body: "Text", status: "draft", ...values }).returning())[0]!;

async function reply(status: (typeof opportunities.$inferInsert)["status"] = "drafted") {
  const [conv] = await getDb()
    .insert(conversations)
    .values({ workspaceId, channel: "reddit", externalId: crypto.randomUUID(), url: "https://example.com/demo/r/ecology/1", community: "ecology", title: "Offline notes app?" })
    .returning();
  return (await getDb().insert(opportunities).values({ workspaceId, productId, conversationId: conv!.id, status }).returning())[0]!;
}

describe("content calendar", () => {
  it("plans, moves and clears times, and a new time means a new reminder", async () => {
    const p = await piece();
    const at = new Date(Date.now() + 3600_000);
    await planPiece(workspaceId, p.id, at);
    await getDb().update(contentPieces).set({ remindedAt: new Date() }).where(eq(contentPieces.id, p.id));
    const later = new Date(at.getTime() + 3600_000);
    await planPiece(workspaceId, p.id, later);
    const [moved] = await getDb().select().from(contentPieces).where(eq(contentPieces.id, p.id));
    expect(moved).toMatchObject({ plannedAt: later, remindedAt: null });
    const items = await calendarItems(productId, new Date(Date.now() - 86400_000), new Date(Date.now() + 2 * 86400_000));
    expect(items.find((i) => i.id === p.id)).toMatchObject({ kind: "piece", href: `/content/calendar?focus=piece:${p.id}` });
    await planPiece(workspaceId, p.id, null);
    expect((await getDb().select().from(contentPieces).where(eq(contentPieces.id, p.id)))[0]!.plannedAt).toBeNull();
    await expect(planPiece(workspaceId, (await piece({ status: "posted" })).id, at)).rejects.toThrow("posted already");
    await expect(planReply(workspaceId, (await reply("archived")).id, at)).rejects.toThrow("with a draft");
  });

  it("reminds once about due, unposted items, adds them to Today and sends one notification", async () => {
    const now = new Date();
    const due = await piece({ plannedAt: new Date(now.getTime() - 60_000), topic: "Due piece" });
    const soon = await piece({ plannedAt: new Date(now.getTime() + 5 * 60_000), topic: "Due in five minutes" });
    const later = await piece({ plannedAt: new Date(now.getTime() + 3 * 3600_000), topic: "Later" });
    const posted = await piece({ plannedAt: new Date(now.getTime() - 60_000), status: "posted" });
    const opp = await reply();
    await planReply(workspaceId, opp.id, new Date(now.getTime() - 120_000));

    const ids = (await dueItems(workspaceId, now)).map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining([due.id, soon.id, opp.id]));
    expect(ids).not.toContain(later.id);
    expect(ids).not.toContain(posted.id);

    const sent: DesktopNotification[] = [];
    setNotifier((n) => sent.push(n));
    expect(await runCalendarRemind({ workspaceId }, { workspaceId }, now)).toMatchObject({ due: 3, notified: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ title: "3 posts are due", href: "/content/calendar" });
    const moves = await getDb().select().from(dailyMoves).where(eq(dailyMoves.day, localDay(now)));
    expect(moves.filter((m) => m.kind === "calendar").map((m) => m.refId)).toEqual(expect.arrayContaining([`piece:${due.id}`, `piece:${soon.id}`, `opp:${opp.id}`]));
    const calendarMoves = moves.filter((m) => m.kind === "calendar").length;

    // Once only: the next run finds nothing, and doesn't add the moves again.
    expect(await runCalendarRemind({ workspaceId }, { workspaceId }, new Date(now.getTime() + 60_000))).toEqual({ due: 0 });
    expect(sent).toHaveLength(1);
    expect((await getDb().select().from(dailyMoves).where(eq(dailyMoves.day, localDay(now)))).filter((m) => m.kind === "calendar")).toHaveLength(calendarMoves);
  });

  it("opens the item itself when only one is due", () => {
    const n = reminderNotification([{ kind: "reply", id: "abc", productId, channel: "reddit", title: "Reply: Offline notes app?", plannedAt: new Date() }], "Fieldnote");
    expect(n).toMatchObject({ title: "Time to post on Reddit", href: "/content/calendar?focus=reply:abc" });
    expect(n!.body).toContain("press Post…");
    expect(reminderNotification([], null)).toBeNull();
  });
});
