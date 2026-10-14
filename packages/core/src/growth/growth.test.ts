import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { dailyMoves, opportunities, conversations, products, roadmapItems, roadmapReplans } from "@startica/db/schema";
import { fileKeyCipher, putSecret, setCipher } from "@startica/db/secrets";
import { ANTHROPIC_KEY_SECRET } from "../ai/client.ts";
import { ensureTodayMoves } from "./moves.ts";
import { applyRoadmap } from "./roadmap.ts";

let workspaceId = "";
let productId = "";
const dir = mkdtempSync(join(tmpdir(), "startica-growth-"));

beforeAll(async () => {
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  setCipher(fileKeyCipher(join(dir, "key")));
  workspaceId = (await ensureWorkspace()).id;
  const [p] = await getDb()
    .insert(products)
    .values({
      workspaceId,
      name: "Fieldnote",
      brief: {
        summary: "A note-taking app for field researchers.",
        category: "productivity",
        audience: "field researchers",
        problem: "notes scattered across notebooks and phones",
        value_props: [],
        differentiators: [],
        positioning: "x",
        pricing_notes: "",
        open_questions: ["Free tier for students?"],
      },
    })
    .returning();
  productId = p!.id;
});
afterAll(() => closeDatabase());

const item = (over: Partial<Parameters<typeof applyRoadmap>[2]["items"][number]>) => ({
  id: "",
  action: "add" as const,
  stage: "activation" as const,
  title: "Add starter templates",
  why: "Few new users activate.",
  playbook: "community-cold-start",
  success_metric: "40% week-1 activation",
  next_step: "Pick the three starter templates",
  priority: 1,
  reason: "Activation first.",
  ...over,
});

describe("applyRoadmap", () => {
  it("adds AI items and records the plan", async () => {
    const changes = await applyRoadmap(workspaceId, productId, { summary: "First plan.", items: [item({})] });
    expect(changes).toEqual([{ title: "Add starter templates", change: "added", reason: "Activation first." }]);
    const [row] = await getDb().select().from(roadmapItems).where(eq(roadmapItems.productId, productId));
    expect(row).toMatchObject({ source: "ai", playbook: "community-cold-start", priority: 1, status: "todo" });
    expect(await getDb().select().from(roadmapReplans)).toHaveLength(1);
  });

  it("never updates or drops owner items or done items, and clamps priority", async () => {
    const [owner] = await getDb()
      .insert(roadmapItems)
      .values({ workspaceId, productId, stage: "revenue", title: "Owner idea", source: "owner" })
      .returning();
    const [done] = await getDb()
      .insert(roadmapItems)
      .values({ workspaceId, productId, stage: "acquisition", title: "Done thing", source: "ai", status: "done" })
      .returning();
    const [ai] = await getDb().select().from(roadmapItems).where(eq(roadmapItems.title, "Add starter templates"));

    await applyRoadmap(workspaceId, productId, {
      summary: "Second plan.",
      items: [
        item({ id: owner!.id, action: "drop", title: "Owner idea" }),
        item({ id: done!.id, action: "update", title: "Rewritten done" }),
        item({ id: ai!.id, action: "update", title: "Add starter templates for each field", priority: 9, playbook: "made-up" }),
      ],
    });

    const rows = await getDb().select().from(roadmapItems).where(eq(roadmapItems.productId, productId));
    expect(rows.find((r) => r.id === owner!.id)).toMatchObject({ title: "Owner idea", status: "todo" });
    expect(rows.find((r) => r.id === done!.id)).toMatchObject({ title: "Done thing", status: "done" });
    expect(rows.find((r) => r.id === ai!.id)).toMatchObject({ title: "Add starter templates for each field", priority: 5, playbook: null });
  });
});

describe("Today's moves", () => {
  it("ranks waiting drafts first, then setup gaps and roadmap next steps", async () => {
    await putSecret(ANTHROPIC_KEY_SECRET, "sk-ant-test");
    const [conv] = await getDb()
      .insert(conversations)
      .values({ workspaceId, channel: "reddit", externalId: "t3_x", url: "https://reddit.com/x", body: "?" })
      .returning();
    await getDb().insert(opportunities).values({ workspaceId, productId, conversationId: conv!.id, status: "drafted" });

    const moves = await ensureTodayMoves(workspaceId, productId);
    const titles = moves.map((m) => m.title);
    expect(titles[0]).toBe("Review and post 1 drafted reply");
    expect(titles).toContain("Pick 3–5 communities to watch");
    expect(titles).toContain("Pick the three starter templates"); // the roadmap item's next step
    expect(titles).toContain("Answer the 1 open question in the brief");
    expect(moves.length).toBeLessThanOrEqual(7);
    expect(moves.map((m) => m.rank)).toEqual(moves.map((_, i) => i + 1));
  });

  it("keeps done/skipped and owner moves when refreshed, and doesn't duplicate", async () => {
    const before = await ensureTodayMoves(workspaceId, productId);
    await getDb().update(dailyMoves).set({ status: "done" }).where(eq(dailyMoves.id, before[0]!.id));
    await getDb()
      .insert(dailyMoves)
      .values({ workspaceId, productId, day: before[0]!.day, rank: 99, kind: "custom", title: "Call Alex", source: "owner" });

    const after = await ensureTodayMoves(workspaceId, productId, { refresh: true });
    expect(after.find((m) => m.id === before[0]!.id)?.status).toBe("done");
    expect(after.some((m) => m.title === "Call Alex")).toBe(true);
    expect(after.filter((m) => m.title === before[0]!.title)).toHaveLength(1);
    // Same day, no refresh: returns the stored list unchanged.
    expect((await ensureTodayMoves(workspaceId, productId)).map((m) => m.id)).toEqual(after.map((m) => m.id));
  });
});
