"use server";

import { z } from "zod";
import { planPiece, plannedInput, planReply } from "@startica/core/content/calendar";
import { planInput, replanContentPlan, requestContentPlan } from "@startica/core/content/plan";
import type { ActionResult } from "@/components/app/form-dialog";
import { id, mutate, productScope } from "@/lib/actions";
import { getWorkspace } from "@/lib/dal";

/** Sets, moves or clears when a piece or a drafted Inbox reply is planned (empty clears it). Never posts. */
export async function setPlannedTime(kind: "piece" | "reply", itemId: string, value: string): Promise<ActionResult> {
  return mutate(async () => {
    const workspace = await getWorkspace();
    const at = plannedInput.parse(value);
    if (z.enum(["piece", "reply"]).parse(kind) === "piece") await planPiece(workspace.id, id.parse(itemId), at);
    else await planReply(workspace.id, id.parse(itemId), at);
  });
}

/** Starts an AI content plan for the next one or two weeks. */
export async function startContentPlan(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const input = planInput.parse({
      weeks: formData.get("weeks"),
      channels: formData.getAll("channels"),
      postsPerWeek: formData.get("postsPerWeek"),
      guidance: formData.get("guidance") ?? "",
    });
    await requestContentPlan(scope.workspaceId, scope.productId, input);
  });
}

/** Plan again: replaces the plan's unposted pieces; posted ones stay. */
export async function planAgain(planId: string): Promise<ActionResult> {
  return mutate(async () => replanContentPlan((await getWorkspace()).id, id.parse(planId)));
}
