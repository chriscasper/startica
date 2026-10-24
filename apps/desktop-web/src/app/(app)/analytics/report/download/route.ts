import { analyticsExport, reportMarkdown } from "@startica/core/metrics/export";
import { exportParams } from "../params";

/** Downloads the Analytics report for a period as Markdown (ARCHITECTURE.md section 8.2, "Report export"). */
export async function GET(request: Request) {
  const asked = await exportParams(request);
  if (!asked) return new Response("Product not found", { status: 404 });
  const { doc, fileBase } = await analyticsExport(asked.productId, asked.range);
  return new Response(reportMarkdown(doc), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${fileBase}.md"`, "Cache-Control": "no-store" },
  });
}
