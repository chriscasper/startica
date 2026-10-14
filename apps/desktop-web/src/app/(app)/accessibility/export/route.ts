import { ownSite } from "@startica/core/a11y/sites";
import { issuesCsv } from "@startica/core/a11y/track";
import { getWorkspace } from "@/lib/dal";

/** Downloads a site's accessibility issues, one row per element, as CSV (ARCHITECTURE.md section 9.3). */
export async function GET(request: Request) {
  const siteId = new URL(request.url).searchParams.get("site") ?? "";
  const workspace = await getWorkspace();
  const site = /^[0-9a-f-]{36}$/i.test(siteId) ? await ownSite(workspace.id, siteId).catch(() => null) : null;
  if (!site) return new Response("Site not found", { status: 404 });
  const name = `${new URL(site.startUrl).hostname}-accessibility-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(`﻿${await issuesCsv(site.id)}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
