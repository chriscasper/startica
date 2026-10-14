import { ownSite } from "@startica/core/a11y/sites";
import { acrMarkdown } from "@startica/core/a11y/manual";
import { isProfile } from "@startica/core/a11y/wcag";
import { getWorkspace } from "@/lib/dal";

/** Downloads the ACR/VPAT-style draft as Markdown (ARCHITECTURE.md section 9.5). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const siteId = params.get("site") ?? "";
  const profile = params.get("profile");
  const workspace = await getWorkspace();
  const site = /^[0-9a-f-]{36}$/i.test(siteId) ? await ownSite(workspace.id, siteId).catch(() => null) : null;
  if (!site) return new Response("Site not found", { status: 404 });
  return new Response(await acrMarkdown(site, isProfile(profile) ? profile : "wcag22"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${new URL(site.startUrl).hostname}-conformance-report-draft.md"`, "Cache-Control": "no-store" },
  });
}
