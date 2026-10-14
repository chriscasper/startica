import { ownSite } from "@startica/core/a11y/sites";
import { buildSecurityReport } from "@startica/core/security/report";
import { getWorkspace } from "@/lib/dal";

/** Downloads a verified site's security report as Markdown (ARCHITECTURE.md section 11.2). */
export async function GET(request: Request) {
  const siteId = new URL(request.url).searchParams.get("site") ?? "";
  const workspace = await getWorkspace();
  const site = /^[0-9a-f-]{36}$/i.test(siteId) ? await ownSite(workspace.id, siteId).catch(() => null) : null;
  if (!site || !site.securityVerifiedAt) return new Response("Site not found or not verified", { status: 404 });
  const name = `${new URL(site.startUrl).hostname}-security-report-${new Date().toISOString().slice(0, 10)}.md`;
  return new Response(await buildSecurityReport(site), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
