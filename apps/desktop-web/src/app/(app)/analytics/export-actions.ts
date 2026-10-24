"use server";

import { analyticsExport } from "@startica/core/metrics/export";
import { RANGE_CHOICES } from "@startica/core/metrics/report";
import type { ActionResult } from "@/components/app/form-dialog";
import { fail, productScope } from "@/lib/actions";

/** Desktop app: asks the Electron process to save the printable Analytics report as a PDF (it asks where). */
export async function saveAnalyticsPdf(productId: string, range: number): Promise<ActionResult> {
  try {
    if (process.env.STARTICA_ELECTRON !== "1" || typeof process.send !== "function") throw new Error("Save as PDF works in the desktop app; open the printable page and print it from your browser instead");
    const scope = await productScope(productId);
    const days = RANGE_CHOICES.find((r) => r.days === range)?.days;
    if (!days) throw new Error("Unknown period");
    const { fileBase } = await analyticsExport(scope.productId, days);
    process.send({ type: "save-pdf", path: `/analytics/report/print?product=${scope.productId}&range=${days}`, filename: `${fileBase}.pdf` });
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}
