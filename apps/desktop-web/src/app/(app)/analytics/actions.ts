"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { historyDays, setHistoryDays } from "@startica/core/metrics/history";
import { requestAnalyticsSummary } from "@startica/core/metrics/summary";
import { enqueue } from "@startica/db/queue";
import { metricsSnapshots } from "@startica/db/schema";
import type { ActionResult } from "@/components/app/form-dialog";
import { formFields, id, mutate, productScope } from "@/lib/actions";
import { db, getWorkspace } from "@/lib/dal";

const manualSchema = z.object({
  day: z.iso.date("Pick a date"),
  metric: z
    .string()
    .trim()
    .min(1, "Name the metric")
    .transform((m) => m.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")),
  value: z.coerce.number({ error: "Enter a number" }),
});

/** Records a number by hand (e.g. waitlist signups from somewhere Startica can't read). */
export async function addManualMetric(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const input = manualSchema.parse(formFields(formData));
    await (await db())
      .insert(metricsSnapshots)
      .values({ ...scope, ...input, source: "manual", dimension: "" })
      .onConflictDoUpdate({
        target: [metricsSnapshots.productId, metricsSnapshots.day, metricsSnapshots.source, metricsSnapshots.metric, metricsSnapshots.dimension],
        set: { value: input.value },
      });
  });
}

export async function deleteManualMetric(metricId: string): Promise<ActionResult> {
  return mutate(async () => {
    const workspace = await getWorkspace();
    await (await db())
      .delete(metricsSnapshots)
      .where(and(eq(metricsSnapshots.id, id.parse(metricId)), eq(metricsSnapshots.workspaceId, workspace.id), eq(metricsSnapshots.source, "manual")));
  });
}

/** Writes this week's AI summary now (a background job). */
export async function writeAnalyticsSummary(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await requestAnalyticsSummary(scope.workspaceId, scope.productId);
  });
}

/** How much history the product keeps; a longer one is read on the next sync, which starts now. */
export async function setAnalyticsHistory(productId: string, days: number): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const before = await historyDays(scope.productId);
    await setHistoryDays(scope.productId, z.number().int().parse(days));
    if (days > before) await enqueue(scope.workspaceId, "metrics_sync", { productId: scope.productId });
  });
}
