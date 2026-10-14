import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { aiPrompts, aiRuns, aiVisibilityAnswers, aiVisibilityRuns, competitors, jobRuns, jobs, products } from "@startica/db/schema";
import { analyzed, estimatePerQuestion, type AnalysisOutput, type AnalyzedAnswer, namesProduct, ownCitations, positionOf, productNames, runMetrics } from "./analysis.ts";
import { addQuestion, saveVisibilitySettings, settingsInput, stopRun, visibilitySettings } from "./questions.ts";

// The jobs call the AI through the client; tests answer with fixed answers and analyses.
const ai = vi.hoisted(() => ({
  answers: [] as unknown[],
  analyses: [] as unknown[],
  suggestions: null as unknown,
  costPerCall: 0,
  onAnswer: null as null | (() => void),
}));
vi.mock("../ai/client.ts", async () => {
  const { getDb: db } = await import("@startica/db/client");
  const { aiRuns: runs } = await import("@startica/db/schema");
  const log = async (ctx: { workspaceId: string }, promptVersion: string) =>
    db().insert(runs).values({ workspaceId: ctx.workspaceId, task: "answer", model: "claude-sonnet-5-5", promptVersion, status: "ok", costUsd: ai.costPerCall });
  return {
    hasAiKey: async () => true,
    taskModel: async (_ctx: unknown, task: string) => ({ model: task === "score" ? "claude-haiku-5-5" : "claude-sonnet-5-5", effort: "low", maxTokens: 4000 }),
    runAnswer: vi.fn(async (ctx: { workspaceId: string }, req: { promptVersion: string }) => {
      ai.onAnswer?.();
      await log(ctx, req.promptVersion);
      const next = ai.answers.shift();
      if (next instanceof Error) throw next;
      return next;
    }),
    runStructured: vi.fn(async (_ctx: unknown, req: { promptVersion: string }) =>
      req.promptVersion.startsWith("visibility-questions") ? ai.suggestions : ai.analyses.shift(),
    ),
  };
});
const { createRun, runPromptsSuggest, runVisibility } = await import("./jobs.ts");

const PRODUCT = { names: ["Fieldnote"], url: "https://fieldnote.example" };
let workspaceId = "";
let productId = "";

const answer = (text: string, citations: string[] = []) => ({ text, citations: citations.map((url) => ({ url, title: url })), searches: ["best field notes app"] });
const analysis = (o: Partial<AnalysisOutput> = {}): AnalysisOutput => ({
  products_named: [],
  mentioned: false,
  recommended: false,
  description: "",
  sentiment: "none",
  competitors: [],
  ...o,
});

beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-visibility-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote", url: "https://fieldnote.example", oneLiner: "Offline field notes." }).returning())[0]!.id;
  await getDb().insert(competitors).values([
    { workspaceId, productId, name: "TerraJot" },
    { workspaceId, productId, name: "Quadrat" },
  ]);
});
afterAll(() => closeDatabase());
beforeEach(async () => {
  ai.answers = [];
  ai.analyses = [];
  ai.costPerCall = 0;
  ai.onAnswer = null;
  await getDb().delete(aiVisibilityRuns);
  await getDb().delete(aiPrompts);
  await getDb().delete(aiRuns);
});

describe("reading an answer", () => {
  it("finds the product by name, with or without spaces, and its own pages", () => {
    expect(productNames("Fieldnote", "https://www.fn-app.example")).toEqual(["Fieldnote", "fn-app"]);
    expect(productNames("Fieldnote", "https://www.field-note.example")).toEqual(["Fieldnote"]); // the same name, punctuation aside
    expect(namesProduct("Try Field Note or TerraJot.", ["Fieldnote"])).toBe(true);
    expect(namesProduct("Good field notes apps", ["Fieldnote"])).toBe(false);
    expect(ownCitations([{ url: "https://docs.fieldnote.example/x", title: "" }, { url: "https://other.example", title: "" }], PRODUCT.url)).toEqual(["https://docs.fieldnote.example/x"]);
    expect(positionOf(["TerraJot", "Fieldnote (offline-first)", "Quadrat"], ["Fieldnote"])).toBe(2);
  });

  it("trusts the text over the model on whether it's mentioned, and keeps competitors to the known list", () => {
    const a = analyzed(
      analysis({ products_named: ["TerraJot", "Fieldnote"], mentioned: false, recommended: true, description: "Works offline", sentiment: "positive", competitors: ["terrajot", "Notion"] }),
      { text: "TerraJot is popular. Fieldnote works offline.", citations: [] },
      PRODUCT,
      ["TerraJot", "Quadrat"],
    );
    expect(a).toMatchObject({ mentioned: true, recommended: true, position: 2, competitors: ["TerraJot"], description: "Works offline", sentiment: "positive" });
    const absent = analyzed(analysis({ mentioned: true, recommended: true, description: "x" }), { text: "Use TerraJot.", citations: [] }, PRODUCT, []);
    expect(absent).toMatchObject({ mentioned: false, recommended: false, position: null, description: null, sentiment: null });
  });

  it("totals a run and ranks share of voice", () => {
    const base: Pick<AnalyzedAnswer, "productsNamed" | "ownCitations" | "description" | "sentiment"> = { productsNamed: [], ownCitations: [], description: null, sentiment: null };
    const m = runMetrics(
      [
        { ...base, mentioned: true, recommended: true, position: 1, competitors: ["TerraJot"], ownCitations: ["https://fieldnote.example"] },
        { ...base, mentioned: true, recommended: false, position: 3, competitors: [] },
        { ...base, mentioned: false, recommended: false, position: null, competitors: ["TerraJot", "Quadrat"] },
        { ...base, mentioned: false, recommended: false, position: null, competitors: [], error: "boom" },
      ],
      "Fieldnote",
      ["TerraJot", "Quadrat"],
    );
    expect(m).toMatchObject({ answered: 3, mentioned: 2, recommended: 1, cited: 1, avgPosition: 2 });
    expect(m.brands.map((b) => `${b.name}:${b.answers}`)).toEqual(["Fieldnote:2", "TerraJot:2", "Quadrat:1"]);
  });

  it("estimates a question's cost, searches included", () => {
    const cost = estimatePerQuestion({ model: "claude-sonnet-5-5", effort: "low", maxTokens: 4000 }, { model: "claude-haiku-5-5", effort: "low", maxTokens: 1024 });
    expect(cost).toBeGreaterThan(0.05);
    expect(cost).toBeLessThan(0.1);
  });
});

describe("runs", () => {
  it("asks each active question, stores the answers and the run's totals", async () => {
    await addQuestion(workspaceId, productId, { text: "best offline field notes app", topic: "apps", stage: "discover" });
    await addQuestion(workspaceId, productId, { text: "TerraJot alternatives for ecologists", topic: "alternatives", stage: "compare" });
    await addQuestion(workspaceId, productId, { text: "paused question", topic: "", stage: "discover" });
    await getDb().update(aiPrompts).set({ active: false }).where(eq(aiPrompts.text, "paused question"));
    ai.answers = [answer("Fieldnote and TerraJot both work offline.", ["https://fieldnote.example/offline"]), answer("Try Quadrat.")];
    ai.analyses = [analysis({ products_named: ["Fieldnote", "TerraJot"], mentioned: true, recommended: true, competitors: ["TerraJot"] }), analysis({ products_named: ["Quadrat"], competitors: ["Quadrat"] })];
    ai.costPerCall = 0.01;

    const runId = await createRun(workspaceId, productId, "manual");
    expect(await runVisibility({ workspaceId }, { workspaceId, runId })).toEqual({ answered: 2, mentioned: 1, status: "done" });
    const [run] = await getDb().select().from(aiVisibilityRuns).where(eq(aiVisibilityRuns.id, runId));
    expect(run).toMatchObject({ status: "done", promptCount: 2, note: null, costUsd: 0.02 });
    expect(run!.metrics).toMatchObject({ answered: 2, mentioned: 1, recommended: 1, cited: 1, avgPosition: 1 });
    const answers = await getDb().select().from(aiVisibilityAnswers).where(eq(aiVisibilityAnswers.runId, runId));
    expect(answers.map((a) => a.promptText).sort()).toEqual(["TerraJot alternatives for ecologists", "best offline field notes app"]);
    expect(answers.find((a) => a.mentioned)?.ownCitations).toEqual(["https://fieldnote.example/offline"]);
  });

  it("stops before the cost cap, and keeps what it has", async () => {
    for (const t of ["question one here", "question two here", "question three"]) await addQuestion(workspaceId, productId, { text: t, topic: "", stage: "discover" });
    await saveVisibilitySettings(productId, settingsInput.parse({ cap_usd: "0.1" }));
    ai.costPerCall = 0.05; // the answer's call logs it; with the estimate (~$0.06) the second question would pass the cap
    ai.answers = [answer("Nothing."), answer("Nothing."), answer("Nothing.")];
    ai.analyses = [analysis(), analysis(), analysis()];
    const runId = await createRun(workspaceId, productId, "manual");
    await runVisibility({ workspaceId }, { workspaceId, runId });
    const [run] = await getDb().select().from(aiVisibilityRuns).where(eq(aiVisibilityRuns.id, runId));
    expect(run).toMatchObject({ status: "done", note: "Stopped at the $0.10 cap after 1 of 3 questions." });
    expect(run!.metrics?.answered).toBe(1);
    await saveVisibilitySettings(productId, settingsInput.parse({ cap_usd: "2" }));
  });

  it("stops when asked, and fails clearly when the budget is reached", async () => {
    for (const t of ["question one here", "question two here"]) await addQuestion(workspaceId, productId, { text: t, topic: "", stage: "discover" });
    const controller = new AbortController();
    ai.answers = [answer("A."), answer("B.")];
    ai.analyses = [analysis(), analysis()];
    ai.onAnswer = () => {
      if (ai.answers.length === 2) controller.abort(new Error("Stopped by you")); // during the first question
    };
    const runId = await createRun(workspaceId, productId, "manual");
    await runVisibility({ workspaceId, signal: controller.signal }, { workspaceId, runId });
    expect((await getDb().select().from(aiVisibilityRuns).where(eq(aiVisibilityRuns.id, runId)))[0]).toMatchObject({ status: "cancelled", note: "Stopped by you after 1 of 2 questions." });

    ai.onAnswer = null;
    ai.answers = [new Error("Monthly AI budget reached ($50.00 of $50.00)")];
    const second = await createRun(workspaceId, productId, "manual");
    await runVisibility({ workspaceId }, { workspaceId, runId: second });
    expect((await getDb().select().from(aiVisibilityRuns).where(eq(aiVisibilityRuns.id, second)))[0]).toMatchObject({ status: "failed", note: "Monthly AI budget reached ($50.00 of $50.00)" });

    // A queued run stopped before it started closes right away.
    const third = await createRun(workspaceId, productId, "manual");
    await stopRun(workspaceId, third);
    expect((await getDb().select().from(aiVisibilityRuns).where(eq(aiVisibilityRuns.id, third)))[0]?.status).toBe("cancelled");
  });

  it("picks up a run after Startica quit: asks only the rest, and the cap covers both passes", async () => {
    for (const t of ["question one here", "question two here", "question three"]) await addQuestion(workspaceId, productId, { text: t, topic: "", stage: "discover" });
    const runId = await createRun(workspaceId, productId, "manual");
    const [first] = await getDb().select().from(aiPrompts).where(eq(aiPrompts.text, "question one here"));
    // The first pass answered one question and saved $0.05 on the run before the app quit.
    await getDb().insert(aiVisibilityAnswers).values({ workspaceId, runId, promptId: first!.id, promptText: first!.text, answer: "Fieldnote.", mentioned: true });
    await getDb().update(aiVisibilityRuns).set({ costUsd: 0.05 }).where(eq(aiVisibilityRuns.id, runId));
    const [jobRun] = await getDb().insert(jobRuns).values({ workspaceId, jobId: crypto.randomUUID(), queue: "ai_visibility_run", attempt: 1, payload: {} }).returning();
    ai.answers = [answer("Nothing."), answer("Nothing.")];
    ai.analyses = [analysis(), analysis()];
    await runVisibility({ workspaceId, jobRunId: jobRun!.id }, { workspaceId, runId });
    const answers = await getDb().select().from(aiVisibilityAnswers).where(eq(aiVisibilityAnswers.runId, runId));
    expect(answers.map((a) => a.promptText).sort()).toEqual(["question one here", "question three", "question two here"]);
    const [run] = await getDb().select().from(aiVisibilityRuns).where(eq(aiVisibilityRuns.id, runId));
    expect(run!.metrics).toMatchObject({ answered: 3, mentioned: 1 });
    expect(run!.costUsd).toBe(0.05); // the mock logs no cost against this job run: only the earlier pass counts
  });

  it("runs weekly only for products that asked for it", async () => {
    await addQuestion(workspaceId, productId, { text: "question one here", topic: "", stage: "discover" });
    expect(await runVisibility({ workspaceId }, { workspaceId })).toEqual({ queued: 0 });
    await saveVisibilitySettings(productId, settingsInput.parse({ weekly: "on", cap_usd: "1" }));
    expect(await visibilitySettings(productId)).toEqual({ weekly: true, capUsd: 1 });
    expect(await runVisibility({ workspaceId }, { workspaceId })).toEqual({ queued: 1 });
    expect((await getDb().select().from(jobs).where(eq(jobs.queue, "ai_visibility_run"))).length).toBe(1);
    expect((await getDb().select().from(aiVisibilityRuns))[0]).toMatchObject({ trigger: "weekly", capUsd: 1 });
  });

  it("suggests questions that don't name the product and aren't already there", async () => {
    await addQuestion(workspaceId, productId, { text: "best offline field notes app", topic: "", stage: "discover" });
    ai.suggestions = {
      questions: [
        { text: "best offline field notes app", topic: "apps", stage: "discover" },
        { text: "Is Fieldnote good?", topic: "brand", stage: "decide" },
        { text: "TerraJot vs Quadrat for transects", topic: "compare", stage: "compare" },
      ],
    };
    expect(await runPromptsSuggest({ workspaceId }, { workspaceId, productId, count: 20 })).toEqual({ added: 1 });
    const texts = (await getDb().select().from(aiPrompts)).map((p) => p.text).sort();
    expect(texts).toEqual(["TerraJot vs Quadrat for transects", "best offline field notes app"]);
  });
});
