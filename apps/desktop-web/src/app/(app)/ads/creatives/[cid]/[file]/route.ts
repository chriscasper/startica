import { ownCreative, readCreativeFile } from "@startica/core/ads/creatives";
import { getWorkspace } from "@/lib/dal";

/** A creative's picture or one of its sizes (AD2); ?download names the file for saving. */
export async function GET(request: Request, ctx: RouteContext<"/ads/creatives/[cid]/[file]">) {
  const { cid, file } = await ctx.params;
  const workspace = await getWorkspace();
  const creative = /^[0-9a-f-]{36}$/i.test(cid) ? await ownCreative(workspace.id, cid).catch(() => null) : null;
  const data = creative ? readCreativeFile(creative.id, file) : null;
  if (!data) return new Response("Not found", { status: 404 });
  const ext = file.split(".").pop();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const headers: Record<string, string> = { "Content-Type": type, "Cache-Control": "no-store" };
  if (new URL(request.url).searchParams.has("download")) headers["Content-Disposition"] = `attachment; filename="creative-${cid.slice(0, 8)}-${file.replace(/\.(png|jpg)$/, "")}.${ext}"`;
  return new Response(new Uint8Array(data), { headers });
}
