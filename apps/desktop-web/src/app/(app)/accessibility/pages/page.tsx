import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ago, loadSites, pathOf, sitePageRows } from "../data";
import { NoProduct, NoSite, Score, SitePicker } from "../ui";

export const metadata: Metadata = { title: "Accessibility pages" };

export default function AccessibilityPagesPage(props: PageProps<"/accessibility/pages">) {
  return (
    <>
      <PageHeader title="Pages" description="Every page found on the site, with its score and issues. Lowest scores first." />
      <Suspense fallback={<PageSkeleton />}>
        <Pages searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

/** The site's pages, worst first. A plain function, so it may read the clock. */
async function loadPages(siteParam: string | string[] | undefined) {
  const ctx = await loadSites(siteParam);
  if (!ctx?.site) return { ctx, pages: [] };
  const order = { done: 0, failed: 1, skipped: 2, queued: 3 };
  const pages = (await sitePageRows(ctx.site.id))
    .map((p) => ({ ...p, when: ago(p.lastScannedAt) }))
    .sort((a, b) => order[a.state] - order[b.state] || (a.score ?? 101) - (b.score ?? 101) || a.url.localeCompare(b.url));
  return { ctx, pages };
}

async function Pages({ searchParams }: { searchParams: PageProps<"/accessibility/pages">["searchParams"] }) {
  const { ctx, pages } = await loadPages((await searchParams).site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <NoSite ctx={ctx} />;

  return (
    <>
      <LiveRefresh tables={["site_pages"]} />
      <SitePicker ctx={ctx} path="/accessibility/pages" />
      <Card>
        <CardContent>
          {pages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No pages yet. Run a scan from the Overview.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Critical</TableHead>
                  <TableHead className="text-right">Serious</TableHead>
                  <TableHead className="text-right">Moderate</TableHead>
                  <TableHead className="text-right">Minor</TableHead>
                  <TableHead>Checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-md whitespace-normal">
                      <Link href={`/accessibility/pages/${p.id}`} className="font-medium hover:underline">
                        {pathOf(p.url)}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">{p.title ?? ""}</div>
                      {p.state !== "done" && (
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <Badge variant={p.state === "failed" ? "destructive" : "outline"}>{p.state === "queued" ? "waiting" : p.state}</Badge>
                          {p.error && <span className="text-muted-foreground">{p.error}</span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Score value={p.state === "done" ? p.score : null} target={ctx.site!.targetScore} />
                    </TableCell>
                    {(["critical", "serious", "moderate", "minor"] as const).map((k) => (
                      <TableCell key={k} className="text-right tabular-nums">
                        {p.state === "done" ? (p.impacts?.[k] ?? 0) : "–"}
                      </TableCell>
                    ))}
                    <TableCell className="text-xs text-muted-foreground">{p.when}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
