import { readLogo } from "@startica/core/ads/creatives";
import { productScope } from "@/lib/actions";

/** The product's logo used in ad templates (AD2). */
export async function GET(_request: Request, ctx: RouteContext<"/ads/logo/[id]">) {
  const { id } = await ctx.params;
  const scope = await productScope(id).catch(() => null);
  const logo = scope ? readLogo(scope.productId) : null;
  if (!logo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(logo.data), { headers: { "Content-Type": logo.type === "png" ? "image/png" : logo.type === "webp" ? "image/webp" : "image/jpeg", "Cache-Control": "no-store" } });
}
