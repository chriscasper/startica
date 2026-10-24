import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { a11yFixPlans, a11yIssueGroups, jobs, sites } from "@startica/db/schema";
import { seedDemo } from "../demo/seed.ts";

// The AI answers with fixed outputs; tests check what's sent and what's stored.
const ai = vi.hoisted(() => ({ next: [] as unknown[], calls: [] as { content: unknown; minOutputTokens?: number }[] }));
vi.mock("../ai/client.ts", () => ({
  runStructured: vi.fn(async (_ctx: unknown, req: { messages: { content: unknown }[]; minOutputTokens?: number }) => {
    ai.calls.push({ content: req.messages[0]!.content, minOutputTokens: req.minOutputTokens });
    return ai.next.shift();
  }),
  taskModel: async () => ({ model: "claude-sonnet-5-5", effort: "medium", maxTokens: 4000 }),
}));
const { deleteFixPlan, fixPlanMarkdown, ownPlan, PLAN_MAX_ISSUES, requestFixPlan, retryFixPlan, runFixPlan } = await import("./fix-plan.ts");

let workspaceId = "";
let site: typeof sites.$inferSelect;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-a11y-plan-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  ({ workspaceId } = await seedDemo());
  site = (await getDb().select().from(sites))[0]!;
});
afterAll(() => closeDatabase());

const openGroups = async () =>
  getDb()
    .select()
    .from(a11yIssueGroups)
    .where(and(eq(a11yIssueGroups.siteId, site.id), eq(a11yIssueGroups.status, "open"), eq(a11yIssueGroups.kind, "violation")));

describe("fix plans", () => {
  it("only takes open issues on the site, up to the limit", async () => {
    await expect(requestFixPlan(workspaceId, site.id, [])).rejects.toThrow(/at least one/);
    const tooMany = Array.from({ length: PLAN_MAX_ISSUES + 1 }, () => crypto.randomUUID());
    await expect(requestFixPlan(workspaceId, site.id, tooMany)).rejects.toThrow(/up to/);
    await expect(requestFixPlan(workspaceId, site.id, [crypto.randomUUID()])).rejects.toThrow(/aren't open/);
  });

  it("sends every picked issue numbered, stores one plan and covers issues the AI left out", async () => {
    const [a, b, c] = await openGroups();
    expect(c).toBeDefined();
    const planId = await requestFixPlan(workspaceId, site.id, [a!.id, b!.id, c!.id], "We use plain HTML");
    expect((await getDb().select().from(jobs)).some((j) => j.queue === "a11y_fix_plan")).toBe(true);
    await getDb().delete(jobs);
    ai.next.push({
      summary: "Fix the shared header, then the rest.",
      tasks: [{ title: "Fix the header", issues: [1, 2, 9], where: "the shared header", change: "Name the logo link.", html: "<header>…</header>" }],
      done_when: ["The rules pass"],
    });
    await runFixPlan({ workspaceId }, { workspaceId, planId });
    const call = ai.calls.at(-1)!;
    expect(call.content).toContain('<issue n="3">');
    expect(call.content).toContain(`Rule: ${c!.ruleId}`);
    expect(call.content).toContain("The developer adds: We use plain HTML");
    expect(call.minOutputTokens).toBeGreaterThan(2000);

    const row = await ownPlan(workspaceId, planId);
    expect(row.status).toBe("ready");
    // Issue 9 doesn't exist and is dropped; issue 3 gets a fix of its own.
    expect(row.plan!.tasks.map((t) => t.groupIds)).toEqual([[a!.id, b!.id], [c!.id]]);
    expect(row.plan!.tasks[1]!.change).toContain(`\`${c!.ruleId}\``);

    const md = fixPlanMarkdown(row.plan!, site);
    expect(md).toContain(`# Fix accessibility issues on ${site.startUrl}`);
    expect(md).toContain("1. **Fix the header** (issues 1, 2). Where: the shared header");
    expect(md).toContain("   ```html\n   <header>…</header>\n   ```");
    expect(md).toContain("## Done when\n\n- The rules pass");
    expect(md).toContain("Notes: We use plain HTML");
    expect(md).not.toMatch(/compliant/i);
  });

  it("reads plans written in the earlier format as tasks", async () => {
    const { readPlan } = await import("./fix-plan.ts");
    const old = { summary: "S", fixes: [{ title: "T", groupIds: ["g"], where: "w", explanation: "Why.", html: "<b>", steps: ["Do it."], confidence: "high" }], verify: ["Check"], issues: [], guidance: null, model: "m", createdAt: "2026-10-19" };
    const plan = readPlan(old as never)!;
    expect(plan.tasks).toEqual([{ title: "T", groupIds: ["g"], where: "w", change: "Why. Do it.", html: "<b>" }]);
    expect(plan.doneWhen).toEqual(["Check"]);
    expect(fixPlanMarkdown(plan, site)).toContain("1. **T**. Where: w\n   Why. Do it.");
  });

  it("writes again with new guidance, records failures, and deletes", async () => {
    const [a] = await openGroups();
    const planId = await requestFixPlan(workspaceId, site.id, [a!.id]);
    await expect(retryFixPlan(workspaceId, planId)).rejects.toThrow(/Already/);
    await getDb().delete(jobs);
    await retryFixPlan(workspaceId, planId, "It's a React app");
    expect((await ownPlan(workspaceId, planId)).guidance).toBe("It's a React app");
    ai.next.push(Promise.reject(new Error("Monthly AI budget reached")));
    await expect(runFixPlan({ workspaceId }, { workspaceId, planId })).rejects.toThrow(/budget/);
    expect(await ownPlan(workspaceId, planId)).toMatchObject({ status: "failed", error: "Monthly AI budget reached" });
    await deleteFixPlan(workspaceId, planId);
    expect(await getDb().select().from(a11yFixPlans).where(eq(a11yFixPlans.id, planId))).toHaveLength(0);
  });
});
