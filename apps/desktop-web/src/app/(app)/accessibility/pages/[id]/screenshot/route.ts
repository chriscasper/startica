import { and, eq } from "drizzle-orm";
import { sitePages } from "@startica/db/schema";
import { readScreenshot } from "@startica/core/a11y/screenshots";
import { db, getWorkspace } from "@/lib/dal";

/** A page's latest screenshot (ARCHITECTURE.md section 9.3), from the data folder. */
export async function GET(_request: Request, ctx: RouteContext<"/accessibility/pages/[id]/screenshot">) {
  const { id } = await ctx.params;
  const workspace = await getWorkspace();
  const [page] = /^[0-9a-f-]{36}$/i.test(id)
    ? await (await db()).select({ siteId: sitePages.siteId, screenshot: sitePages.screenshot }).from(sitePages).where(and(eq(sitePages.id, id), eq(sitePages.workspaceId, workspace.id)))
    : [];
  const data = page?.screenshot ? readScreenshot(page.siteId, page.screenshot) : null;
  if (!data) return new Response("No screenshot", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
}
