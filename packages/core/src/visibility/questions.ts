import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getSetting, setSetting } from "@startica/db/bootstrap";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { aiPrompts, aiVisibilityAnswers, aiVisibilityRuns, promptStages } from "@startica/db/schema";
import { jobByPayload, stopJob } from "../jobs/cancel.ts";
import { DEFAULT_CAP_USD, MAX_PROMPTS } from "./analysis.ts";

/** Questions, settings and reading runs (ARCHITECTURE.md section 10.2). Server actions call these. */

export type VisibilitySettings = { weekly: boolean; capUsd: number };
const settingKey = (productId: string) => `ai_visibility:${productId}`;

export async function visibilitySettings(productId: string): Promise<VisibilitySettings> {
  const saved = await getSetting<Partial<VisibilitySettings>>(settingKey(productId));
  return { weekly: saved?.weekly ?? false, capUsd: saved?.capUsd ?? DEFAULT_CAP_USD };
}

export const settingsInput = z.object({
  weekly: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  cap_usd: z.coerce.number().min(0.1, "Set a cap of at least $0.10").max(50, "At most $50 a run"),
});

export async function saveVisibilitySettings(productId: string, input: z.infer<typeof settingsInput>): Promise<void> {
  await setSetting(settingKey(productId), { weekly: input.weekly, capUsd: Math.round(input.cap_usd * 100) / 100 } satisfies VisibilitySettings);
}

export const questionInput = z.object({
  text: z.string().trim().min(5, "Write the question as someone would ask it").max(500),
  topic: z.string().trim().max(40).default(""),
  stage: z.enum(promptStages).default("discover"),
});

export async function addQuestion(workspaceId: string, productId: string, input: z.infer<typeof questionInput>): Promise<void> {
  const db = getDb();
  const existing = await db.select({ id: aiPrompts.id }).from(aiPrompts).where(eq(aiPrompts.productId, productId));
  if (existing.length >= MAX_PROMPTS) throw new Error(`At most ${MAX_PROMPTS} questions: remove some first`);
  await db.insert(aiPrompts).values({ workspaceId, productId, ...input, source: "owner" });
}

export async function ownQuestion(workspaceId: string, promptId: string) {
  const [row] = await getDb()
    .select()
    .from(aiPrompts)
    .where(and(eq(aiPrompts.id, promptId), eq(aiPrompts.workspaceId, workspaceId)));
  if (!row) throw new Error("Question not found");
  return row;
}

export async function updateQuestion(promptId: string, input: z.infer<typeof questionInput>): Promise<void> {
  await getDb()
    .update(aiPrompts)
    .set({ ...input, source: "owner" })
    .where(eq(aiPrompts.id, promptId));
}

export async function setQuestionActive(promptId: string, active: boolean): Promise<void> {
  await getDb().update(aiPrompts).set({ active }).where(eq(aiPrompts.id, promptId));
}

export async function deleteQuestion(promptId: string): Promise<void> {
  await getDb().delete(aiPrompts).where(eq(aiPrompts.id, promptId));
}

export async function suggestQuestions(workspaceId: string, productId: string): Promise<void> {
  if (await jobByPayload(workspaceId, ["ai_prompts_suggest"], "productId", productId)) return;
  await enqueue(workspaceId, "ai_prompts_suggest", { productId });
}

/** Stops a run in progress; the answers so far are kept. */
export async function stopRun(workspaceId: string, runId: string): Promise<void> {
  const job = await jobByPayload(workspaceId, ["ai_visibility_run"], "runId", runId);
  const result = job ? await stopJob(workspaceId, job) : "not_found";
  // Not running anywhere (queued, or left by an app that quit): close it here.
  if (result !== "stopping")
    await getDb()
      .update(aiVisibilityRuns)
      .set({ status: "cancelled", note: "Stopped by you before it finished.", finishedAt: new Date() })
      .where(and(eq(aiVisibilityRuns.id, runId), eq(aiVisibilityRuns.status, "running")));
}

// --- Reading ------------------------------------------------------------------------------

export async function listQuestions(productId: string) {
  return getDb().select().from(aiPrompts).where(eq(aiPrompts.productId, productId)).orderBy(desc(aiPrompts.active), asc(aiPrompts.topic), asc(aiPrompts.createdAt));
}

/** Runs newest first; the newest finished one is the one the page reports. */
export async function listRuns(productId: string, limit = 26) {
  return getDb().select().from(aiVisibilityRuns).where(eq(aiVisibilityRuns.productId, productId)).orderBy(desc(aiVisibilityRuns.startedAt)).limit(limit);
}

export async function runAnswers(runId: string) {
  return getDb().select().from(aiVisibilityAnswers).where(eq(aiVisibilityAnswers.runId, runId)).orderBy(asc(aiVisibilityAnswers.createdAt));
}

/** Each question's answers in the given runs, for "since last run" changes. */
export async function answersFor(runIds: string[]) {
  if (runIds.length === 0) return [];
  return getDb().select().from(aiVisibilityAnswers).where(inArray(aiVisibilityAnswers.runId, runIds));
}
