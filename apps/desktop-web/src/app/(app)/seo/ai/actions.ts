"use server";

import { and, eq } from "drizzle-orm";
import { hasAiKey } from "@startica/core/ai/client";
import { createRun } from "@startica/core/visibility/jobs";
import {
  addQuestion,
  deleteQuestion,
  ownQuestion,
  questionInput,
  saveVisibilitySettings,
  setQuestionActive,
  settingsInput,
  stopRun,
  suggestQuestions,
  updateQuestion,
} from "@startica/core/visibility/questions";
import { enqueue } from "@startica/db/queue";
import { aiVisibilityRuns } from "@startica/db/schema";
import type { ActionResult } from "@/components/app/form-dialog";
import { formFields, id, mutate, productScope } from "@/lib/actions";
import { db, getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";

/** AI visibility (ARCHITECTURE.md section 10.2): questions, runs and their settings. */

async function requireAi() {
  if (desktopApp().demo) throw new Error("AI is off in the demo, like every other outside call.");
  if (!(await hasAiKey())) throw new Error("Add an AI key in Settings → General → AI first.");
}

export async function runNow(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    await requireAi();
    const scope = await productScope(productId);
    const [running] = await (await db())
      .select({ id: aiVisibilityRuns.id })
      .from(aiVisibilityRuns)
      .where(and(eq(aiVisibilityRuns.productId, scope.productId), eq(aiVisibilityRuns.status, "running")));
    if (running) throw new Error("A run is already going");
    const runId = await createRun(scope.workspaceId, scope.productId, "manual");
    await enqueue(scope.workspaceId, "ai_visibility_run", { runId });
  });
}

export async function stopVisibilityRun(runId: string): Promise<ActionResult> {
  return mutate(async () => stopRun((await getWorkspace()).id, id.parse(runId)));
}

export async function saveSettings(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await saveVisibilitySettings(scope.productId, settingsInput.parse(formFields(formData)));
  });
}

export async function newQuestion(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await addQuestion(scope.workspaceId, scope.productId, questionInput.parse(formFields(formData)));
  });
}

export async function editQuestion(promptId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const q = await ownQuestion((await getWorkspace()).id, id.parse(promptId));
    await updateQuestion(q.id, questionInput.parse(formFields(formData)));
  });
}

export async function toggleQuestion(promptId: string, active: boolean): Promise<ActionResult> {
  return mutate(async () => setQuestionActive((await ownQuestion((await getWorkspace()).id, id.parse(promptId))).id, active));
}

export async function removeQuestion(promptId: string): Promise<ActionResult> {
  return mutate(async () => deleteQuestion((await ownQuestion((await getWorkspace()).id, id.parse(promptId))).id));
}

export async function suggest(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    await requireAi();
    const scope = await productScope(productId);
    await suggestQuestions(scope.workspaceId, scope.productId);
  });
}
