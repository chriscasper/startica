"use server";

import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { ensureTodayMoves, localDay } from "@startica/core/growth/moves";
import { dailyMoves } from "@startica/db/schema";
import type { ActionResult } from "@/components/app/form-dialog";
import { formFields, id, mutate, productScope } from "@/lib/actions";
import { db, getWorkspace } from "@/lib/dal";

async function ownMove(moveId: string) {
  const workspace = await getWorkspace();
  const [move] = await (await db())
    .select()
    .from(dailyMoves)
    .where(and(eq(dailyMoves.id, id.parse(moveId)), eq(dailyMoves.workspaceId, workspace.id)));
  if (!move) throw new Error("Move not found");
  return move;
}

export async function setMoveStatus(moveId: string, status: string): Promise<ActionResult> {
  return mutate(async () => {
    const move = await ownMove(moveId);
    await (await db())
      .update(dailyMoves)
      .set({ status: z.enum(["open", "done", "skipped"]).parse(status) })
      .where(eq(dailyMoves.id, move.id));
  });
}

export async function refreshMoves(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await ensureTodayMoves(scope.workspaceId, scope.productId, { refresh: true });
  });
}

export async function addMove(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const input = z.object({ title: z.string().trim().min(1, "What do you want to do?"), why: z.string().trim().default("") }).parse(formFields(formData));
    const day = localDay();
    const [last] = await (await db())
      .select({ rank: max(dailyMoves.rank) })
      .from(dailyMoves)
      .where(and(eq(dailyMoves.productId, scope.productId), eq(dailyMoves.day, day)));
    await (await db())
      .insert(dailyMoves)
      .values({ ...scope, ...input, day, rank: (last?.rank ?? 0) + 1, kind: "custom", source: "owner" });
  });
}

export async function deleteMove(moveId: string): Promise<ActionResult> {
  return mutate(async () => {
    const move = await ownMove(moveId);
    if (move.source !== "owner") throw new Error("Only moves you added can be deleted; skip the others");
    await (await db()).delete(dailyMoves).where(eq(dailyMoves.id, move.id));
  });
}
