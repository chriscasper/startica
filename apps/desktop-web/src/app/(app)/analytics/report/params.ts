import { DEFAULT_RANGE, RANGE_CHOICES } from "@startica/core/metrics/report";
import { productScope } from "@/lib/actions";

/** The product (checked against this workspace) and period an export asks for: `?product=<id>&range=<days>`. */
export async function exportParams(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = await productScope(params.get("product") ?? "").catch(() => null);
  const range = RANGE_CHOICES.find((r) => String(r.days) === params.get("range"))?.days ?? DEFAULT_RANGE;
  return scope ? { productId: scope.productId, range } : null;
}
