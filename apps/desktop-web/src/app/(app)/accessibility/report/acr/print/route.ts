import { ownSite } from "@startica/core/a11y/sites";
import { acrHtml } from "@startica/core/a11y/acr-print";
import { getWorkspace } from "@/lib/dal";

/** The conformance report draft as a standalone page (ARCHITECTURE.md section 9.5), to print or save as PDF. */
export async function GET(request: Request) {
  const siteId = new URL(request.url).searchParams.get("site") ?? "";
  const workspace = await getWorkspace();
  const site = /^[0-9a-f-]{36}$/i.test(siteId) ? await ownSite(workspace.id, siteId).catch(() => null) : null;
  if (!site) return new Response("Site not found", { status: 404 });
  return new Response(await acrHtml(site), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
