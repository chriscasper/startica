import { ownSite } from "@startica/core/a11y/sites";
import { reportHtml } from "@startica/core/a11y/manual";
import { getWorkspace } from "@/lib/dal";

/** The printable accessibility report (ARCHITECTURE.md section 9.5): a standalone page to print or save as PDF. */
export async function GET(request: Request) {
  const siteId = new URL(request.url).searchParams.get("site") ?? "";
  const workspace = await getWorkspace();
  const site = /^[0-9a-f-]{36}$/i.test(siteId) ? await ownSite(workspace.id, siteId).catch(() => null) : null;
  if (!site) return new Response("Site not found", { status: 404 });
  return new Response(await reportHtml(site), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
