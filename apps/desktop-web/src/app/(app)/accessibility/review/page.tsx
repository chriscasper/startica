import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { a11yIssueGroups, a11yOccurrences, sitePages } from "@startica/db/schema";
import { db } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { hasAiKey } from "@startica/core/ai/client";
import { COST_HINT } from "@startica/core/a11y/ai";
import { desktopApp } from "@/lib/desktop";
import { ReviewButtons, SuggestReviewButton } from "../controls";
import { loadSites, pathOf } from "../data";
import { NoProduct, NoSite, SitePicker } from "../ui";

export const metadata: Metadata = { title: "Needs review" };

const DECISION: Record<string, string> = { pass: "Passed", fail: "Failed: now an issue", skip: "Skipped" };

export default function ReviewPage(props: PageProps<"/accessibility/review">) {
  return (
    <>
      <PageHeader title="Needs review" description="Checks the automated tools couldn't decide. Look at each one and say whether it passes; Startica remembers it across scans." />
      <Suspense fallback={<PageSkeleton />}>
        <Review searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const MAX_EXAMPLES = 3;

async function Review({ searchParams }: { searchParams: PageProps<"/accessibility/review">["searchParams"] }) {
  const params = await searchParams;
  const ctx = await loadSites(params.site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <NoSite ctx={ctx} />;
  const site = ctx.site;
  const decided = params.show === "decided";
  const d = await db();
  const all = await d
    .select()
    .from(a11yIssueGroups)
    .where(and(eq(a11yIssueGroups.siteId, site.id), eq(a11yIssueGroups.kind, "needs_review"), eq(a11yIssueGroups.status, "open")))
    .orderBy(asc(a11yIssueGroups.help));
  const shown = all.filter((g) => (decided ? g.reviewStatus : !g.reviewStatus));
  const examples = shown.length
    ? await d
        .select({ groupId: a11yOccurrences.groupId, pageId: sitePages.id, url: sitePages.url, selector: a11yOccurrences.selector, html: a11yOccurrences.html, summary: a11yOccurrences.failureSummary })
        .from(a11yOccurrences)
        .innerJoin(sitePages, eq(sitePages.id, a11yOccurrences.pageId))
        .where(inArray(a11yOccurrences.groupId, shown.map((g) => g.id)))
    : [];
  const aiReady = !desktopApp().demo && (await hasAiKey());
  const pill = (active: boolean) => cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", active && "bg-background font-medium text-foreground shadow-sm");

  return (
    <>
      <LiveRefresh tables={["a11y_issue_groups"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SitePicker ctx={ctx} path="/accessibility/review" />
        <nav className="flex gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Show">
          <Link href={`/accessibility/review?site=${site.id}`} className={pill(!decided)} aria-current={!decided ? "page" : undefined}>
            To review ({all.filter((g) => !g.reviewStatus).length})
          </Link>
          <Link href={`/accessibility/review?site=${site.id}&show=decided`} className={pill(decided)} aria-current={decided ? "page" : undefined}>
            Decided ({all.filter((g) => g.reviewStatus).length})
          </Link>
        </nav>
      </div>
      {!decided && shown.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {aiReady ? `Ask AI looks at the element (and the page screenshot when there is one) and suggests Pass or Fail with a reason, ${COST_HINT.review} each. You decide.` : "With an AI key, Ask AI suggests Pass or Fail for each item. You decide."}
        </p>
      )}
      {shown.length === 0 && (
        <p className="text-sm text-muted-foreground">{decided ? "Nothing decided yet." : site.lastScanId ? "Nothing to review." : "Run a scan from the Overview first."}</p>
      )}
      {shown.map((g) => {
        const items = examples.filter((e) => e.groupId === g.id);
        return (
          <Card key={g.id}>
            <CardHeader>
              <CardTitle className="text-base">{g.help}</CardTitle>
              <CardDescription>
                WCAG {g.criteria.join(", ") || "–"} · {g.pagesCount} {g.pagesCount === 1 ? "page" : "pages"}
                {g.helpUrl && (
                  <>
                    {" · "}
                    <a href={g.helpUrl} target="_blank" rel="noreferrer" className="underline">
                      How to check it
                    </a>
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {items.slice(0, MAX_EXAMPLES).map((e, i) => (
                <div key={i} className="grid gap-1 rounded-md border p-3">
                  <Link href={`/accessibility/pages/${e.pageId}`} className="w-fit font-medium hover:underline">
                    {pathOf(e.url)}
                  </Link>
                  <pre className="overflow-x-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{e.html}</pre>
                  {e.summary && <p className="whitespace-pre-line text-muted-foreground">{e.summary}</p>}
                </div>
              ))}
              {items.length > MAX_EXAMPLES && <p className="text-xs text-muted-foreground">And {items.length - MAX_EXAMPLES} more elements like these.</p>}
              {g.aiReviewStatus === "working" && <p className="text-muted-foreground">Looking at it…</p>}
              {g.aiReviewStatus === "failed" && <p className="text-destructive">Couldn&apos;t look at it: {g.aiReviewError}</p>}
              {g.aiReview && g.aiReviewStatus !== "working" && (
                <p className="rounded-md bg-muted p-3">
                  <span className="font-medium">AI suggests {g.aiReview.suggestion === "unsure" ? "you check it closely" : g.aiReview.suggestion === "pass" ? "Pass" : "Fail"}:</span> {g.aiReview.reason}
                  <span className="block text-xs text-muted-foreground">
                    {g.aiReview.model}, {g.aiReview.createdAt.slice(0, 10)}. You decide.
                  </span>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {g.reviewStatus && <Badge variant="outline">{DECISION[g.reviewStatus]}</Badge>}
                <ReviewButtons groupId={g.id} decided={g.reviewStatus} />
                {!g.reviewStatus && <SuggestReviewButton groupId={g.id} again={Boolean(g.aiReview)} disabled={!aiReady || g.aiReviewStatus === "working"} />}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
