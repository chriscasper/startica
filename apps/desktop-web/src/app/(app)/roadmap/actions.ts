"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { recordVersion } from "@startica/core/chat/versions";
import { auditKinds, findingToRoadmap } from "@startica/core/growth/audits";
import { roadmapItemValue } from "@startica/core/growth/roadmap";
import { enqueue } from "@startica/db/queue";
import { audits, funnelStages, roadmapItems } from "@startica/db/schema";
import type { ActionResult } from "@/components/app/form-dialog";
import { fail, formFields, id, mutate, productScope } from "@/lib/actions";
import { db, getWorkspace } from "@/lib/dal";

async function ownItem(itemId: string) {
  const workspace = await getWorkspace();
  const [item] = await (await db())
    .select()
    .from(roadmapItems)
    .where(and(eq(roadmapItems.id, id.parse(itemId)), eq(roadmapItems.workspaceId, workspace.id)));
  if (!item) throw new Error("Roadmap item not found");
  return item;
}

export async function requestReplan(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await enqueue(scope.workspaceId, "roadmap_plan", { productId: scope.productId });
  });
}

const itemSchema = z.object({
  title: z.string().trim().min(1, "Give it a title"),
  stage: z.enum(funnelStages),
  why: z.string().trim().default(""),
  success_metric: z.string().trim().default(""),
  next_step: z.string().trim().default(""),
  priority: z.coerce.number().int().min(1).max(5),
});

/** Creating or editing an item makes it the owner's: re-plans won't change it. */
export async function saveRoadmapItem(productId: string, itemId: string | null, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const i = itemSchema.parse(formFields(formData));
    const values = { title: i.title, stage: i.stage, why: i.why, successMetric: i.success_metric, nextStep: i.next_step, priority: i.priority, source: "owner" as const };
    if (itemId) {
      const item = await ownItem(itemId);
      await (await db()).update(roadmapItems).set(values).where(eq(roadmapItems.id, item.id));
      const edited = roadmapItemValue({ ...item, ...values, updatedAt: new Date() });
      await recordVersion({ workspaceId: item.workspaceId, kind: "roadmap_item", subjectId: item.id }, edited, "edited", { previous: roadmapItemValue(item) });
    } else {
      await (await db()).insert(roadmapItems).values({ ...values, ...scope });
    }
  });
}

export async function setItemStatus(itemId: string, status: string, result?: string): Promise<ActionResult> {
  return mutate(async () => {
    const item = await ownItem(itemId);
    const parsed = z.enum(["todo", "doing", "done", "dropped"]).parse(status);
    await (await db())
      .update(roadmapItems)
      .set({ status: parsed, ...(result !== undefined ? { result: result.trim() || null } : {}) })
      .where(eq(roadmapItems.id, item.id));
  });
}

export async function finishItem(itemId: string, formData: FormData): Promise<ActionResult> {
  return setItemStatus(itemId, "done", z.string().max(2000).parse(formData.get("result") ?? ""));
}

export async function deleteRoadmapItem(itemId: string): Promise<ActionResult> {
  return mutate(async () => {
    const item = await ownItem(itemId);
    await (await db()).delete(roadmapItems).where(eq(roadmapItems.id, item.id));
  });
}

export async function runAudit(productId: string, kind: string): Promise<ActionResult> {
  try {
    const scope = await productScope(productId);
    const parsed = z.enum(auditKinds).parse(kind);
    return mutate(async () => {
      const [audit] = await (await db()).insert(audits).values({ ...scope, kind: parsed }).returning({ id: audits.id });
      await enqueue(scope.workspaceId, "audit_run", { auditId: audit!.id });
    });
  } catch (error) {
    return fail(error);
  }
}

/** Turns an audit finding into an owner roadmap item. */
export async function addFindingToRoadmap(auditId: string, index: number): Promise<ActionResult> {
  return mutate(async () => findingToRoadmap((await getWorkspace()).id, id.parse(auditId), z.number().int().min(0).parse(index)));
}
