import { ownSite } from "@startica/core/a11y/sites";
import { buildStatement } from "@startica/core/a11y/manual";
import { statementHtml } from "@startica/core/a11y/statement-html";
import { getWorkspace } from "@/lib/dal";

/** Downloads the accessibility statement (ARCHITECTURE.md section 9.5): Markdown, or with `format=html` an HTML fragment to paste into a CMS. */
export async function GET(request: Request) {
  const siteId = new URL(request.url).searchParams.get("site") ?? "";
  const workspace = await getWorkspace();
  const site = /^[0-9a-f-]{36}$/i.test(siteId) ? await ownSite(workspace.id, siteId).catch(() => null) : null;
  const text = site ? await buildStatement(site) : null;
  if (!site || !text) return new Response("No statement yet: fill in its details first", { status: 404 });
  const host = new URL(site.startUrl).hostname;
  if (new URL(request.url).searchParams.get("format") === "html") {
    return new Response(statementHtml(text), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${host}-accessibility-statement.html"`, "Cache-Control": "no-store" },
    });
  }
  return new Response(text, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${host}-accessibility-statement.md"`, "Cache-Control": "no-store" },
  });
}
