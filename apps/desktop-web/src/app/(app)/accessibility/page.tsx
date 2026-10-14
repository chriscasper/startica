import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { recentScans } from "@startica/core/a11y/sites";
import { prioritizedGroups, scanChanges, scoreHistory } from "@startica/core/a11y/track";
import { ScoreChart } from "./score-chart";
import { hasAiKey } from "@startica/core/ai/client";
import { COST_HINT } from "@startica/core/a11y/ai";
import { AddSiteButton, CheckPageButton, ScanSiteButton, SiteSettingsButton, SummarizeButton } from "./controls";
import { ago, loadSites, scanById, siteGroups, sitePageRows, withSite } from "./data";
import { AutomatedNote, ImpactBadge, NoProduct, NoSite, PriorityBadge, ScanUnavailable, Score, SitePicker } from "./ui";

export const metadata: Metadata = { title: "Accessibility" };

export default function AccessibilityPage(props: PageProps<"/accessibility">) {
  return (
    <>
      <PageHeader title="Accessibility" description="Check your product's sites against WCAG, fix what matters most first, and track progress." />
      <Suspense fallback={<PageSkeleton />}>
        <Overview searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

/** Everything the overview shows. A plain function, so it may read the clock. */
async function loadOverview(siteParam: string | string[] | undefined) {
  const ctx = await loadSites(siteParam);
  if (!ctx?.site) return { ctx, data: null };
  const site = ctx.site;
  const [ranked, pages, review, scans, last, history] = await Promise.all([
    prioritizedGroups(site, { status: "open", kind: "issues" }),
    sitePageRows(site.id),
    siteGroups(site.id, { status: "open", kind: "needs_review" }),
    recentScans(site.id),
    scanById(site.lastScanId),
    scoreHistory(site.id),
  ]);
  const groups = ranked.map((r) => r.group);
  const changes = last ? await scanChanges(site.id, last.id) : { added: [], fixed: [] };
  const impacts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const g of groups) impacts[g.impact ?? "minor"]++;
  return {
    ctx,
    data: {
      site,
      groups,
      impacts,
      checked: pages.filter((p) => p.state === "done").length,
      failed: pages.filter((p) => p.state === "failed").length,
      ranked,
      changes,
      aiReady: !ctx.demo && (await hasAiKey()),
      history: history.flatMap((h) => (h.at && h.score != null ? [{ at: h.at.toISOString(), score: h.score }] : [])),
      review: review.filter((g) => !g.reviewStatus).length,
      scans: scans.map((s) => ({ ...s, when: ago(s.finishedAt ?? s.startedAt ?? s.createdAt) })),
      last,
      lastWhen: last ? ago(last.finishedAt) : null,
    },
  };
}

async function Overview({ searchParams }: { searchParams: PageProps<"/accessibility">["searchParams"] }) {
  const { ctx, data } = await loadOverview((await searchParams).site);
  if (!ctx) return <NoProduct />;
  if (!data) return <NoSite ctx={ctx} />;
  const { site, groups, impacts } = data;
  const q = (href: string) => withSite(href, site.id);

  return (
    <>
      <LiveRefresh tables={["sites", "site_scans", "site_pages", "a11y_issue_groups"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SitePicker ctx={ctx} path="/accessibility" />
        <div className="flex flex-wrap items-center gap-2">
          <ScanSiteButton siteId={site.id} productId={ctx.product.id} canScan={ctx.canScan} />
          <CheckPageButton siteId={site.id} canScan={ctx.canScan} />
          <AddSiteButton productId={ctx.product.id} suggested={{ name: ctx.product.name, url: ctx.product.url }} first={false} />
          <SiteSettingsButton site={site} />
        </div>
      </div>
      {!ctx.canScan && <ScanUnavailable demo={ctx.demo} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Score</CardDescription>
            <CardTitle className="text-3xl">
              <Score value={site.score} target={site.targetScore} />
              <span className="text-sm font-normal text-muted-foreground"> / 100, target {site.targetScore}</span>
            </CardTitle>
          </CardHeader>
          {site.lastScanId && (
            <CardContent className="text-xs">
              {impacts.critical === 0 ? (
                <span className="text-emerald-700 dark:text-emerald-400">Goal met: no critical issues</span>
              ) : (
                <Link href={q("/accessibility/issues?impact=critical")} className="text-destructive hover:underline">
                  Goal: no critical issues ({impacts.critical} open)
                </Link>
              )}
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Open issues</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{groups.length}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1 text-xs">
            {(["critical", "serious", "moderate", "minor"] as const).map((k) => (
              <Link key={k} href={q(`/accessibility/issues?impact=${k}`)} className="tabular-nums hover:underline">
                {impacts[k]} {k}
                {k !== "minor" && " ·"}
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Pages checked</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{data.checked}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {data.failed > 0 ? `${data.failed} couldn't be checked. ` : ""}
            {data.review > 0 && (
              <Link href={q("/accessibility/review")} className="underline">
                {data.review} {data.review === 1 ? "item needs" : "items need"} a person to review
              </Link>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Last scan</CardDescription>
            <CardTitle className="text-xl">{data.lastWhen ?? "Not scanned yet"}</CardTitle>
          </CardHeader>
          {data.last && (
            <CardContent className="text-xs text-muted-foreground">
              {data.last.newIssues ?? 0} new, {data.last.fixedIssues ?? 0} fixed
            </CardContent>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fix these first</CardTitle>
          <CardDescription>
            Ranked by impact, the pages each issue is on and, with Google Analytics connected, the visits those pages get. An issue on many pages is usually one fix in a shared
            template.
          </CardDescription>
          <CardAction className="flex gap-3">
            <a href={`/accessibility/export?site=${site.id}`} className="text-sm underline">
              Export CSV
            </a>
            <Link href={q("/accessibility/issues")} className="text-sm underline">
              All issues
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{site.lastScanId ? "No open issues found by the automated checks." : "Run a scan to see issues here."}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>WCAG</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead className="text-right">Visits, 30 days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ranked.slice(0, 5).map(({ group: g, band, traffic }) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Link href={`/accessibility/issues/${g.id}`} className="font-medium hover:underline">
                        {g.help}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <PriorityBadge band={band} />
                    </TableCell>
                    <TableCell>
                      <ImpactBadge impact={g.impact} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {g.criteria.join(", ") || "–"} {g.level && <span className="text-muted-foreground">({g.level})</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{g.pagesCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{traffic > 0 ? Math.round(traffic).toLocaleString("en-US") : "–"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <AutomatedNote />
        </CardContent>
      </Card>

      {(site.a11ySummary || site.lastScanId) && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>A short, plain-language read of where the site stands and what to fix next, from your AI key. {COST_HINT.summary}.</CardDescription>
            <CardAction>
              <SummarizeButton siteId={site.id} again={Boolean(site.a11ySummary)} disabled={!data.aiReady || site.a11ySummaryStatus === "working"} />
            </CardAction>
          </CardHeader>
          <CardContent className="text-sm">
            {site.a11ySummaryStatus === "working" ? (
              <p className="text-muted-foreground">Writing…</p>
            ) : site.a11ySummaryStatus === "failed" ? (
              <p className="text-destructive">Couldn&apos;t write it: {site.a11ySummaryError}</p>
            ) : site.a11ySummary ? (
              <>
                <p>{site.a11ySummary.text}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {site.a11ySummary.model}, {site.a11ySummary.createdAt.slice(0, 10)}
                  {site.a11ySummary.scanId !== site.lastScanId ? ". There's a newer scan: summarize again." : "."}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">{data.aiReady ? "Press Summarize for a short read of the results." : "Add an AI key in Settings to get a plain-language summary."}</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score history</CardTitle>
            <CardDescription>The score after each full scan. Scans repeat every {site.scanIntervalDays === 0 ? "– (off)" : `${site.scanIntervalDays} days`}; change it in Site settings.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.history.length < 2 ? <p className="text-sm text-muted-foreground">The chart appears after two full scans.</p> : <ScoreChart data={data.history} target={site.targetScore} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What changed</CardTitle>
            <CardDescription>{data.lastWhen ? `In the last scan (${data.lastWhen})` : "After the first scan, new and fixed issues show here."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            {(
              [
                ["New", data.changes.added],
                ["Fixed", data.changes.fixed],
              ] as const
            ).map(([label, list]) => (
              <div key={label} className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">
                  {label} ({list.length})
                </span>
                {list.length === 0 ? (
                  <span className="text-muted-foreground">None</span>
                ) : (
                  list.slice(0, 6).map((g) => (
                    <Link key={g.id} href={`/accessibility/issues/${g.id}`} className="truncate hover:underline">
                      {g.help}
                    </Link>
                  ))
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scans</CardTitle>
          <CardDescription>The latest 10, with what changed.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.scans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scans yet. Scan now checks up to {site.maxPages} pages, about two a second.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Fixed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.scans.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.when}</TableCell>
                    <TableCell>{s.scope === "full" ? "Full scan" : s.scope === "page" ? "Page check" : "Issue recheck"}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "failed" ? "destructive" : s.status === "done" ? "secondary" : "outline"}>{s.status}</Badge>
                      {s.error && <div className="mt-1 max-w-xs text-xs text-destructive">{s.error}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.pagesDone}
                      {s.pagesFailed > 0 && <span className="text-muted-foreground"> (+{s.pagesFailed} failed)</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Score value={s.score} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.newIssues ?? "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.fixedIssues ?? "–"}</TableCell>
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
