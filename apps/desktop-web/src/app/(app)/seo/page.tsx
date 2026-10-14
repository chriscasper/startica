import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AI_CRAWLERS_CHECKED, PURPOSE_LABEL } from "@startica/core/seo/crawlers";
import { CheckPageButton, ScanSiteButton } from "../accessibility/controls";
import { ago, loadSites, scanById, sitePageRows, withSite } from "../accessibility/data";
import { NoProduct, ScanUnavailable, Score } from "../accessibility/ui";
import { and, eq } from "drizzle-orm";
import { periods, siteTotals } from "@startica/core/search/report";
import { listRuns } from "@startica/core/visibility/questions";
import { agentCheckHistory } from "@startica/core/agents/run";
import { connections } from "@startica/db/schema";
import { db } from "@/lib/dal";
import { seoRuleGroups } from "./data";
import { ruleOf, SeoNoSite, SeoSitePicker, SeverityBadge } from "./shared";

export const metadata: Metadata = { title: "SEO & GEO" };

export default function SeoPage(props: PageProps<"/seo">) {
  return (
    <>
      <PageHeader title="SEO & GEO" description="Get found: in search results, in AI answers that recommend products, and by AI agents." />
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
  const searchPeriods = await periods(ctx.product.id, "google", 28);
  const [searchConn] = await (await db())
    .select({ status: connections.status })
    .from(connections)
    .where(and(eq(connections.productId, ctx.product.id), eq(connections.kind, "search_console")));
  const [rules, pages, last, search, searchBefore] = await Promise.all([
    seoRuleGroups(site.id),
    sitePageRows(site.id),
    scanById(site.lastScanId),
    searchPeriods.newest ? siteTotals(ctx.product.id, "google", searchPeriods.current) : null,
    searchPeriods.newest ? siteTotals(ctx.product.id, "google", searchPeriods.previous) : null,
  ]);
  const visibility = (await listRuns(ctx.product.id, 10)).find((r) => r.status !== "running" && r.metrics && r.metrics.answered > 0) ?? null;
  const problems = rules.filter((r) => r.severity !== "info");
  const count = (s: string) => problems.filter((r) => r.severity === s).reduce((n, r) => n + r.groups.length, 0);
  return {
    ctx,
    data: {
      site,
      problems,
      counts: { high: count("high"), medium: count("medium"), low: count("low") },
      checked: pages.filter((p) => p.state === "done").length,
      lastWhen: last ? ago(last.finishedAt) : null,
      search: search && searchBefore ? { now: search, before: searchPeriods.previousComplete ? searchBefore : null } : null,
      searchConnected: Boolean(searchConn),
      visibility: visibility?.metrics ? { metrics: visibility.metrics, when: ago(visibility.startedAt) } : null,
      // The latest finished check, even if it had too little to score (no older score in its place).
      agents: (await agentCheckHistory(site.id, 5)).find((c) => !c.error) ?? null,
    },
  };
}

async function Overview({ searchParams }: { searchParams: PageProps<"/seo">["searchParams"] }) {
  const { ctx, data } = await loadOverview((await searchParams).site);
  if (!ctx) return <NoProduct />;
  if (!data) return <SeoNoSite ctx={ctx} />;
  const { site, problems, counts } = data;
  const access = site.aiAccess;
  const q = (href: string) => withSite(href, site.id);

  return (
    <>
      <LiveRefresh tables={["sites", "site_scans", "site_pages", "search_stats", "ai_visibility_runs", "agent_checks"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeoSitePicker ctx={ctx} path="/seo" />
        <div className="flex flex-wrap items-center gap-2">
          <ScanSiteButton siteId={site.id} productId={ctx.product.id} canScan={ctx.canScan} />
          <CheckPageButton siteId={site.id} canScan={ctx.canScan} />
        </div>
      </div>
      {!ctx.canScan && <ScanUnavailable demo={ctx.demo} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardDescription>Site health</CardDescription>
            <CardTitle className="text-3xl">
              <Score value={site.seoScore} target={90} />
              <span className="text-sm font-normal text-muted-foreground"> / 100</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {data.checked} pages checked{data.lastWhen ? `, ${data.lastWhen}` : ""}. The same scan checks accessibility.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Problems to fix</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{counts.high + counts.medium + counts.low}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs tabular-nums">
            <Link href={q("/seo/health")} className="hover:underline">
              {counts.high} high · {counts.medium} medium · {counts.low} low
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>AI search access</CardDescription>
            <CardTitle className="text-xl">
              {!access ? "Not checked yet" : access.crawlers.some((c) => !c.allowed && c.purpose !== "training") ? "Some AI search is blocked" : "Open to AI search"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-0.5 text-xs text-muted-foreground">
            {access && <span>llms.txt: {access.llmsTxt === "present" ? "found" : access.llmsTxt === "invalid" ? "found, but not in the usual format" : "none"}</span>}
            <Link href={q("/seo/agents")} className="hover:underline">
              Agent readiness: {!data.agents ? "not checked yet" : data.agents.score != null ? `${data.agents.score} / 100` : "too little to score yet"}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Clicks from Google, 28 days</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{data.search ? data.search.now.clicks.toLocaleString("en-US") : "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {data.search ? (
              <Link href="/seo/search" className="hover:underline">
                {data.search.now.impressions.toLocaleString("en-US")} impressions · position {data.search.now.position.toFixed(1)}
                {data.search.before?.clicks
                  ? ` · ${data.search.now.clicks >= data.search.before.clicks ? "+" : ""}${Math.round(((data.search.now.clicks - data.search.before.clicks) / data.search.before.clicks) * 100)}% clicks`
                  : ""}
              </Link>
            ) : data.searchConnected ? (
              <Link href="/seo/search" className="hover:underline">
                Search Console is connected; numbers appear after the first sync.
              </Link>
            ) : (
              <Link href="/seo/search" className="underline">
                Connect Search Console
              </Link>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>AI visibility</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {data.visibility ? `${Math.round((data.visibility.metrics.mentioned / data.visibility.metrics.answered) * 100)}%` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/seo/ai" className={data.visibility ? "hover:underline" : "underline"}>
              {data.visibility
                ? `of AI answers mention ${ctx.product.name}, ${data.visibility.metrics.recommended} recommend it (${data.visibility.when})`
                : "See whether AI assistants recommend you"}
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fix these first</CardTitle>
          <CardDescription>The problems that most affect being found, across the site.</CardDescription>
          <CardAction>
            <Link href={q("/seo/health")} className="text-sm underline">
              Site health
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {problems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{site.lastScanId ? "No problems found by the checks." : "Run a scan to see the site's health here."}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Problem</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.slice(0, 5).map((r) => (
                  <TableRow key={r.rule}>
                    <TableCell>
                      <Link href={`${q("/seo/health")}#${r.rule}`} className="font-medium hover:underline">
                        {ruleOf(r.rule).title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={r.severity} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.pageCount || "site"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI crawlers</CardTitle>
          <CardDescription>
            What robots.txt lets each AI crawler do. Blocking training is a choice; blocking search or user bots keeps the site out of AI answers. (List checked{" "}
            {AI_CRAWLERS_CHECKED}.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!access ? (
            <p className="text-sm text-muted-foreground">Checked during the next scan.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Crawler</TableHead>
                  <TableHead>For</TableHead>
                  <TableHead>Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {access.crawlers.map((c) => (
                  <TableRow key={c.token}>
                    <TableCell>
                      <span className="font-mono text-xs">{c.token}</span> <span className="text-muted-foreground">({c.operator})</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{PURPOSE_LABEL[c.purpose]}</TableCell>
                    <TableCell>
                      {c.allowed ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckIcon className="size-4" aria-hidden /> Allowed
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 ${c.purpose === "training" ? "" : "text-destructive"}`}>
                          <XIcon className="size-4" aria-hidden /> Blocked
                        </span>
                      )}
                    </TableCell>
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
