import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { aiRuns, contentPieces, contentPlans, jobs, products } from "@startica/db/schema";

// The plan comes from runStructured; tests hand back fixed slots and log what a call costs.
const ai = vi.hoisted(() => ({ calls: [] as { system: string; content: string }[], items: [] as unknown[] }));
vi.mock("../ai/client.ts", async (original) => ({
  ...(await original<typeof import("../ai/client.ts")>()),
  hasAiKey: vi.fn(async () => true),
  runStructured: vi.fn(async (ctx: { workspaceId: string; jobRunId?: string }, req: { system: string; messages: { content: string }[] }) => {
    ai.calls.push({ system: req.system, content: req.messages[0]!.content });
    await getDb().insert(aiRuns).values({ workspaceId: ctx.workspaceId, jobRunId: ctx.jobRunId ?? null, task: "draft", model: "claude-sonnet-5-5", promptVersion: "content-plan@1", status: "ok", costUsd: 0.04 });
    return { summary: "Teach first, then show the app.", items: ai.items };
  }),
}));
const { normalizePlan, planRange, replanContentPlan, requestContentPlan, runContentPlan, slotCount, splitForReplan, daysBetween } = await import("./plan.ts");

let workspaceId = "";
let productId = "";
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-plan-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote", oneLiner: "Offline field notes" }).returning())[0]!.id;
});
afterAll(() => closeDatabase());

const noTimes = { channels: {}, communities: {} };

describe("content plan rules", () => {
  it("covers tomorrow onwards, with posts per week over the range", () => {
    const now = new Date(2026, 9, 21, 15);
    expect(planRange(1, now)).toEqual({ startDay: "2026-10-22", endDay: "2026-10-28" });
    expect(planRange(2, now).endDay).toBe("2026-11-04");
    expect(daysBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(slotCount(5, "2026-10-22", "2026-10-28")).toBe(5);
    expect(slotCount(3, "2026-10-22", "2026-11-04", 2)).toBe(4);
  });

  it("plan again keeps only posted pieces", () => {
    const { keep, replace } = splitForReplan([{ id: "a", status: "posted" }, { id: "b", status: "draft" }, { id: "c", status: "failed" }, { id: "d", status: "drafting" }]);
    expect(keep.map((p) => p.id)).toEqual(["a"]);
    expect(replace.map((p) => p.id)).toEqual(["b", "c", "d"]);
  });

  it("drops slots outside the plan and fixes formats and times", () => {
    const plan = { startDay: "2026-10-22", endDay: "2026-10-28", channels: ["bluesky", "email"] };
    const items = normalizePlan(
      {
        summary: "",
        items: [
          { day: "2026-10-22", time: "9:30", channel: "bluesky", format: "campaign", topic: "Three field-note templates", why: "Morning" },
          { day: "2026-10-23", time: "", channel: "email", format: "post", topic: "Welcome series", why: "Signups" },
          { day: "2026-11-01", time: "10:00", channel: "bluesky", format: "post", topic: "Out of range", why: "" },
          { day: "2026-10-24", time: "10:00", channel: "reddit", format: "post", topic: "Not a plan channel", why: "" },
          { day: "2026-10-25", time: "25:00", channel: "bluesky", format: "thread", topic: "Bad time", why: "" },
          { day: "2026-10-26", time: "08:00", channel: "bluesky", format: "post", topic: "Over the count", why: "" },
        ],
      },
      plan,
      3,
      noTimes,
    );
    expect(items.map((i) => [i.topic, i.format, i.time])).toEqual([
      ["Three field-note templates", "post", "09:30"],
      ["Welcome series", "campaign", null],
      ["Bad time", "thread", null],
    ]);
    expect(items[0]!.plannedAt).toEqual(new Date(2026, 9, 22, 9, 30));
    expect(items[1]!.plannedAt).toEqual(new Date(2026, 9, 23, 10)); // no hint: 10:00
  });
});

describe("content_plan job", () => {
  it("writes planned pieces, and plan again replaces only the unposted ones", async () => {
    const planId = await requestContentPlan(workspaceId, productId, { weeks: 1, channels: ["bluesky", "linkedin"], postsPerWeek: 3, guidance: "No discounts" });
    const [plan] = await getDb().select().from(contentPlans).where(eq(contentPlans.id, planId));
    const days = daysBetween(plan!.startDay, plan!.endDay);
    ai.items = [
      { day: days[0], time: "09:00", channel: "bluesky", format: "post", topic: "Field notes in the rain", why: "Busy mornings" },
      { day: days[2], time: "12:00", channel: "linkedin", format: "post", topic: "What a season of notes taught us", why: "Lunch reading" },
      { day: days[4], time: "18:00", channel: "bluesky", format: "thread", topic: "Five transect templates", why: "Evening" },
    ];
    await runContentPlan({ workspaceId, jobRunId: undefined }, { workspaceId, productId, planId });
    expect(ai.calls[0]!.content).toContain("<owner_guidance>No discounts</owner_guidance>");
    expect(ai.calls[0]!.content).toContain("Plan exactly 3 posts");
    let pieces = await getDb().select().from(contentPieces).where(eq(contentPieces.planId, planId));
    expect(pieces).toHaveLength(3);
    expect(pieces.every((p) => p.status === "drafting" && p.plannedAt && p.planWhy)).toBe(true);
    const queued = await getDb().select().from(jobs).where(eq(jobs.queue, "content_generate"));
    expect(queued).toHaveLength(3);
    const [ready] = await getDb().select().from(contentPlans).where(eq(contentPlans.id, planId));
    expect(ready).toMatchObject({ status: "ready", summary: "Teach first, then show the app." });
    expect(ready!.items.map((i) => i.pieceId).sort()).toEqual(pieces.map((p) => p.id).sort());

    // One gets posted; plan again keeps it and replaces the other two with two new slots.
    const postedId = pieces[0]!.id;
    await getDb().update(contentPieces).set({ status: "posted" }).where(eq(contentPieces.id, postedId));
    await getDb().delete(jobs);
    await replanContentPlan(workspaceId, planId);
    expect((await getDb().select().from(contentPlans).where(eq(contentPlans.id, planId)))[0]!.status).toBe("working");
    ai.items = [
      { day: days[1], time: "10:00", channel: "linkedin", format: "post", topic: "Why we went offline-first", why: "Story" },
      { day: days[3], time: "09:00", channel: "bluesky", format: "post", topic: "A packing list for field days", why: "Practical" },
      { day: days[5], time: "09:00", channel: "bluesky", format: "post", topic: "Beyond the count", why: "" },
    ];
    await runContentPlan({ workspaceId }, { workspaceId, productId, planId, replace: true });
    expect(ai.calls[1]!.content).toContain("Plan exactly 2 posts");
    pieces = await getDb().select().from(contentPieces).where(eq(contentPieces.planId, planId));
    expect(pieces.map((p) => p.topic).sort()).toEqual(["A packing list for field days", "Field notes in the rain", "Why we went offline-first"]);
    expect(pieces.find((p) => p.id === postedId)?.status).toBe("posted");
    expect((await getDb().select().from(contentPlans).where(eq(contentPlans.id, planId)))[0]!.items).toHaveLength(3);
  });

  it("keeps a failed plan with its error", async () => {
    await getDb().delete(jobs);
    const planId = await requestContentPlan(workspaceId, productId, { weeks: 1, channels: ["mastodon"], postsPerWeek: 2, guidance: "" });
    ai.items = [{ day: "1999-01-01", time: "09:00", channel: "mastodon", format: "post", topic: "Out of range", why: "" }];
    await expect(runContentPlan({ workspaceId }, { workspaceId, productId, planId })).rejects.toThrow("without usable slots");
    expect((await getDb().select().from(contentPlans).where(eq(contentPlans.id, planId)))[0]).toMatchObject({ status: "failed", error: expect.stringContaining("usable slots") });
  });
});
