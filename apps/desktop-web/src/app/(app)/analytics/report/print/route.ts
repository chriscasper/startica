import { analyticsExport, reportHtml } from "@startica/core/metrics/export";
import { exportParams } from "../params";

/** The printable Analytics report for a period: a standalone page to print, or save as PDF in the desktop app. */
export async function GET(request: Request) {
  const asked = await exportParams(request);
  if (!asked) return new Response("Product not found", { status: 404 });
  const { doc } = await analyticsExport(asked.productId, asked.range);
  return new Response(reportHtml(doc), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
