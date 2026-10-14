import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq } from "drizzle-orm";
import { ExternalLinkIcon } from "lucide-react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { a11yIssueGroups, a11yOccurrences, sitePages, sites } from "@startica/db/schema";
import { db, getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import { OpenHighlightsButton, RecheckButton } from "../../controls";
import { ago, byPriority, loadSites, pathOf, withSite, type GroupRow } from "../../data";
import { AutomatedNote, ImpactBadge, Score } from "../../ui";

export const metadata: Metadata = { title: "Page report" };

export default function PageReportPage(props: PageProps<"/accessibility/pages/[id]">) {
  return (
    <>
      <PageHeader title="Page report" />
      <Suspense fallback={<PageSkeleton />}>
        <Report params={props.params} />
      </Suspense>
    </>
  );
}

/** One page's latest results, issues grouped. A plain function, so it may read the clock. */
async function loadReport(pageId: string) {
  const workspace = await getWorkspace();
  const d = await db();
  const [row] = await d
    .select({ page: sitePages, site: sites })
    .from(sitePages)
    .innerJoin(sites, eq(sites.id, sitePages.siteId))
    .where(and(eq(sitePages.id, pageId), eq(sitePages.workspaceId, workspace.id)));
  if (!row) return null;
  const items = await d
    .select({ occurrence: a11yOccurrences, group: a11yIssueGroups })
    .from(a11yOccurrences)
    .innerJoin(a11yIssueGroups, eq(a11yIssueGroups.id, a11yOccurrences.groupId))
    .where(eq(a11yOccurrences.pageId, pageId));
  const groups = new Map<string, { group: GroupRow; elements: (typeof items)[number]["occurrence"][] }>();
  for (const { occurrence, group } of items) {
    if (group.status === "ignored" || (group.kind !== "violation" && group.reviewStatus !== "fail")) continue;
    const entry = groups.get(group.id) ?? { group, elements: [] };
    entry.elements.push(occurrence);
    groups.set(group.id, entry);
  }
  return {
    ...row,
    when: ago(row.page.lastScannedAt),
    issues: [...groups.values()].sort((a, b) => byPriority(a.group, b.group)),
    review: items.filter((i) => i.group.kind === "needs_review" && !i.group.reviewStatus && i.group.status === "open").length,
    highlightsAvailable: process.env.STARTICA_ELECTRON === "1" && !desktopApp().demo,
  };
}

async function Report({ params }: { params: PageProps<"/accessibility/pages/[id]">["params"] }) {
  const report = await loadReport((await params).id);
  if (!report) notFound();
  const { page, site, issues } = report;
  const ctx = await loadSites(site.id);

  return (
    <>
      <LiveRefresh tables={["site_pages", "a11y_issue_groups"]} />
      <Link href={withSite("/accessibility/pages", site.id)} className="text-sm text-muted-foreground hover:underline">
        ← All pages
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{page.title || pathOf(page.url)}</CardTitle>
          <CardDescription>
            <a href={page.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
              {page.url}
              <ExternalLinkIcon className="size-3.5" aria-hidden />
            </a>
          </CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2">
            {issues.length > 0 && <OpenHighlightsButton pageId={page.id} available={report.highlightsAvailable} />}
            <RecheckButton kind="page" id={page.id} canScan={Boolean(ctx?.canScan)} label="Recheck page" />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>
            Score{" "}
            <strong className="text-lg">
              <Score value={page.state === "done" ? page.score : null} target={site.targetScore} />
            </strong>
          </span>
          <span>
            {issues.length} issue{issues.length === 1 ? "" : "s"}
          </span>
          {report.review > 0 && (
            <Link href={withSite("/accessibility/review", site.id)} className="underline">
              {report.review} {report.review === 1 ? "item needs" : "items need"} a person to review
            </Link>
          )}
          <span className="text-muted-foreground">Checked {report.when}</span>
          {page.lang ? <span className="text-muted-foreground">Language: {page.lang}</span> : null}
          {page.state !== "done" && (
            <span className="flex items-center gap-2">
              <Badge variant={page.state === "failed" ? "destructive" : "outline"}>{page.state}</Badge>
              {page.error}
            </span>
          )}
        </CardContent>
      </Card>

      {page.screenshot && page.screenshotSize && issues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Where they are</CardTitle>
            <CardDescription>
              The page as the scan saw it, with each failing element boxed and numbered like the issues below. Elements that were hidden or off the first{" "}
              {page.screenshotSize.height.toLocaleString("en-US")} pixels have no box.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[36rem] overflow-auto rounded-md border">
              <div className="relative w-full" style={{ aspectRatio: `${page.screenshotSize.width} / ${page.screenshotSize.height}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a local, per-page file served by the app */}
                <img src={`/accessibility/pages/${page.id}/screenshot`} alt={`Screenshot of ${pathOf(page.url)} when it was checked`} className="absolute inset-0 h-full w-full" />
                {issues.flatMap(({ group, elements }, i) =>
                  elements
                    .filter((e) => e.box && e.box.y < page.screenshotSize!.height)
                    .map((e) => (
                      <span
                        key={e.id}
                        title={group.help}
                        className="absolute rounded-sm border-2 border-destructive bg-destructive/10"
                        style={{
                          left: `${(e.box!.x / page.screenshotSize!.width) * 100}%`,
                          top: `${(e.box!.y / page.screenshotSize!.height) * 100}%`,
                          width: `${Math.max(e.box!.width, 4) / page.screenshotSize!.width * 100}%`,
                          height: `${Math.max(e.box!.height, 4) / page.screenshotSize!.height * 100}%`,
                        }}
                      >
                        <span className="absolute -top-2.5 -left-2.5 flex size-5 items-center justify-center rounded-full bg-destructive text-[0.65rem] font-semibold text-white tabular-nums">{i + 1}</span>
                      </span>
                    )),
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {issues.length === 0 && page.state === "done" ? (
        <p className="text-sm text-muted-foreground">No issues found on this page by the automated checks.</p>
      ) : (
        issues.map(({ group, elements }, i) => (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle>
                {page.screenshot && <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-destructive text-[0.65rem] text-white tabular-nums align-middle">{i + 1}</span>}
                <Link href={withSite(`/accessibility/issues/${group.id}`, site.id)} className="hover:underline">
                  {group.help}
                </Link>
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <ImpactBadge impact={group.impact} />
                WCAG {group.criteria.join(", ") || "–"} {group.level && `(level ${group.level})`}
                {group.pagesCount > 1 && <span>· also on {group.pagesCount - 1} other page{group.pagesCount === 2 ? "" : "s"}</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {elements.map((e) => (
                <div key={e.id} className="grid gap-2 rounded-md border p-3 text-sm">
                  <code className="w-fit max-w-full truncate text-xs text-muted-foreground">{e.selector}</code>
                  <pre className="overflow-x-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{e.html}</pre>
                  {e.failureSummary && <p className="whitespace-pre-line text-muted-foreground">{e.failureSummary}</p>}
                </div>
              ))}
              {group.helpUrl && (
                <a href={group.helpUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm underline">
                  How to fix this
                  <ExternalLinkIcon className="size-3.5" aria-hidden />
                </a>
              )}
            </CardContent>
          </Card>
        ))
      )}
      <AutomatedNote />
    </>
  );
}
