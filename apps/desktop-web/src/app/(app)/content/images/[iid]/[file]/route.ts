import { ownContentImage, readContentImageFile } from "@startica/core/content/images";
import { getWorkspace } from "@/lib/dal";

/** A post image's picture or one of its sizes; ?download names the file for saving. */
export async function GET(request: Request, ctx: RouteContext<"/content/images/[iid]/[file]">) {
  const { iid, file } = await ctx.params;
  const workspace = await getWorkspace();
  const image = /^[0-9a-f-]{36}$/i.test(iid) ? await ownContentImage(workspace.id, iid).catch(() => null) : null;
  const data = image ? readContentImageFile(image.id, file) : null;
  if (!data) return new Response("Not found", { status: 404 });
  const ext = file.split(".").pop();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const headers: Record<string, string> = { "Content-Type": type, "Cache-Control": "no-store" };
  if (new URL(request.url).searchParams.has("download")) headers["Content-Disposition"] = `attachment; filename="post-${iid.slice(0, 8)}-${file.replace(/\.(png|jpg)$/, "")}.${ext}"`;
  return new Response(new Uint8Array(data), { headers });
}
