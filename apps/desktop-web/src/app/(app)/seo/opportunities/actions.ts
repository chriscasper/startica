"use server";

import { z } from "zod";
import { hasAiKey } from "@startica/core/ai/client";
import { addToRoadmap, addToToday, requestDraft, sendBrief, setOpportunityStatus } from "@startica/core/opportunities/actions";
import type { ActionResult } from "@/components/app/form-dialog";
import { mutate, productScope } from "@/lib/actions";
import { desktopApp } from "@/lib/desktop";

/** Opportunities (ARCHITECTURE.md section 10.2): drafts, and sending them to the Roadmap, Today or Content Studio. */

const key = z.string().min(1).max(600);

async function requireAi() {
  if (desktopApp().demo) throw new Error("AI is off in the demo, like every other outside call.");
  if (!(await hasAiKey())) throw new Error("Add an AI key in Settings → General → AI first.");
}

export async function draftFix(productId: string, k: string): Promise<ActionResult> {
  return mutate(async () => {
    await requireAi();
    await requestDraft(await productScope(productId), key.parse(k));
  });
}

export async function toRoadmap(productId: string, k: string): Promise<ActionResult> {
  return mutate(async () => addToRoadmap(await productScope(productId), key.parse(k)));
}

export async function toToday(productId: string, k: string): Promise<ActionResult> {
  return mutate(async () => addToToday(await productScope(productId), key.parse(k)));
}

export async function toContent(productId: string, k: string): Promise<ActionResult> {
  return mutate(async () => {
    await requireAi();
    await sendBrief(await productScope(productId), key.parse(k));
  });
}

export async function setStatus(productId: string, k: string, status: string): Promise<ActionResult> {
  return mutate(async () => setOpportunityStatus(await productScope(productId), key.parse(k), z.enum(["open", "done", "dismissed"]).parse(status)));
}
