import { loadCampaign } from "@startica/core/ads/campaigns";
import { utmSlug } from "@startica/core/ads/checks";
import { campaignBrief, googleAdsEditorCsv, metaBulkCsv, utf16le } from "@startica/core/ads/exports";
import { getWorkspace } from "@/lib/dal";

/** Downloads a campaign's hand-off file (ARCHITECTURE.md section 8.6). */
export async function GET(_request: Request, ctx: RouteContext<"/ads/[id]/export/[kind]">) {
  const { id, kind } = await ctx.params;
  const workspace = await getWorkspace();
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await loadCampaign(workspace.id, id) : null;
  if (!detail) return new Response("Campaign not found", { status: 404 });
  const base = utmSlug(detail.campaign.name);
  const file = (body: BodyInit, name: string, type: string) =>
    new Response(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });

  if (kind === "google" && detail.campaign.platform === "google")
    return file(utf16le(googleAdsEditorCsv(detail)) as BodyInit, `${base}-google-ads-editor.csv`, "text/csv; charset=utf-16le");
  if (kind === "meta" && detail.campaign.platform === "meta") return file(`﻿${metaBulkCsv(detail)}`, `${base}-meta-import.csv`, "text/csv; charset=utf-8");
  if (kind === "brief") return file(campaignBrief(detail), `${base}-brief.md`, "text/markdown; charset=utf-8");
  return new Response("No such file for this campaign", { status: 404 });
}
