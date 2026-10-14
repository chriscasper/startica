import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, asc, eq } from "drizzle-orm";
import { ExternalLinkIcon } from "lucide-react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { a11yIssueGroups, a11yOccurrences, sitePages, sites } from "@startica/db/schema";
import { trackerFor, trackerIssueFor } from "@startica/core/trackers/trackers";
import { db, getWorkspace } from "@/lib/dal";
import { IGNORE_LABEL } from "@startica/core/a11y/track";
import { COST_HINT } from "@startica/core/a11y/ai";
import { hasAiKey } from "@startica/core/ai/client";
import { CopyBlock } from "@/components/app/copy-block";
import { desktopApp } from "@/lib/desktop";
import { CreateTrackerIssueButton, IgnoreIssueButton, IssueToRoadmapButton, RecheckButton, SuggestFixButton, UnignoreButton } from "../../controls";
import { loadSites, pathOf, withSite } from "../../data";
import { AutomatedNote, ImpactBadge } from "../../ui";

export const metadata: Metadata = { title: "Accessibility issue" };

const MAX_ELEMENTS = 200;

export default function IssuePage(props: PageProps<"/accessibility/issues/[id]">) {
  return (
    <>
      <PageHeader title="Issue" />
      <Suspense fallback={<PageSkeleton />}>
        <Issue params={props.params} />
      </Suspense>
    </>
  );
}

async function Issue({ params }: { params: PageProps<"/accessibility/issues/[id]">["params"] }) {
  const { id } = await params;
  const workspace = await getWorkspace();
  const d = await db();
  const [group] = await d
    .select()
    .from(a11yIssueGroups)
    .where(and(eq(a11yIssueGroups.id, id), eq(a11yIssueGroups.workspaceId, workspace.id)));
  if (!group) notFound();
  const ctx = await loadSites(group.siteId);
  const [site] = await d.select({ productId: sites.productId }).from(sites).where(eq(sites.id, group.siteId));
  const tracker = site ? await trackerFor(site.productId) : null;
  const repoIssue = tracker ? await trackerIssueFor(tracker.id, group.id) : null;
  const elements = await d
    .select({ id: a11yOccurrences.id, selector: a11yOccurrences.selector, html: a11yOccurrences.html, failureSummary: a11yOccurrences.failureSummary, pageId: sitePages.id, url: sitePages.url })
    .from(a11yOccurrences)
    .innerJoin(sitePages, eq(sitePages.id, a11yOccurrences.pageId))
    .where(eq(a11yOccurrences.groupId, group.id))
    .orderBy(asc(sitePages.url))
    .limit(MAX_ELEMENTS);

  const aiReady = !desktopApp().demo && (await hasAiKey());
  const fix = group.aiFix;
  return (
    <>
      <LiveRefresh tables={["a11y_issue_groups", "site_pages", "tracker_issues"]} />
      <Link href={withSite("/accessibility/issues", group.siteId)} className="text-sm text-muted-foreground hover:underline">
        ← All issues
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{group.help}</CardTitle>
          <CardDescription>{group.description}</CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2">
            {repoIssue ? (
              <a href={repoIssue.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
                {tracker!.provider === "github" ? "GitHub" : "GitLab"} issue #{repoIssue.number} ({repoIssue.state})
                <ExternalLinkIcon className="size-3.5" aria-hidden />
              </a>
            ) : tracker ? (
              group.status === "open" && <CreateTrackerIssueButton groupId={group.id} provider={tracker.provider} />
            ) : (
              <Link href="/settings?tab=products" className="text-sm text-muted-foreground underline">
                Connect GitHub or GitLab
              </Link>
            )}
            {group.status === "ignored" ? <UnignoreButton groupId={group.id} /> : group.status === "open" && <IgnoreIssueButton groupId={group.id} />}
            <IssueToRoadmapButton groupId={group.id} />
            {group.status === "open" && <RecheckButton kind="group" id={group.id} canScan={Boolean(ctx?.canScan)} label={`Recheck ${group.pagesCount} page${group.pagesCount === 1 ? "" : "s"}`} />}
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <ImpactBadge impact={group.impact} />
            <Badge variant={group.status === "fixed" ? "secondary" : "outline"} className="capitalize">
              {group.status}
            </Badge>
            <span>
              WCAG {group.criteria.join(", ") || "–"} {group.level && <span className="text-muted-foreground">(level {group.level})</span>}
            </span>
            <span className="text-muted-foreground">
              · {group.pagesCount} page{group.pagesCount === 1 ? "" : "s"}, {group.occurrencesCount} element{group.occurrencesCount === 1 ? "" : "s"} · rule{" "}
              <code>{group.ruleId}</code>
            </span>
          </div>
          {group.status === "ignored" && (
            <p className="rounded-md border p-3">
              Ignored{group.ignoredAt ? ` on ${group.ignoredAt.toISOString().slice(0, 10)}` : ""}: {IGNORE_LABEL[group.ignoreReason as keyof typeof IGNORE_LABEL] ?? group.ignoreReason}
              {group.ignoreNote ? `. ${group.ignoreNote}` : ""}
            </p>
          )}
          {group.helpUrl && (
            <a href={group.helpUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 underline">
              How to fix this (rule documentation)
              <ExternalLinkIcon className="size-3.5" aria-hidden />
            </a>
          )}
          {group.pagesCount > 1 && (
            <p className="rounded-md bg-muted p-3">
              The same element fails on {group.pagesCount} pages, so it&apos;s probably part of a shared template or component: fixing it there fixes
              every page.
            </p>
          )}
          <AutomatedNote />
        </CardContent>
      </Card>

      {group.status !== "fixed" && (
        <Card>
          <CardHeader>
            <CardTitle>Suggested fix</CardTitle>
            <CardDescription>
              Your AI key reads the failing HTML and suggests the smallest change that fixes it, with steps. Copy what helps; nothing is changed on your site. {COST_HINT.fix}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {group.aiFixStatus === "working" && <p className="text-muted-foreground">Working on it…</p>}
            {group.aiFixStatus === "failed" && <p className="text-destructive">Couldn&apos;t suggest a fix: {group.aiFixError}</p>}
            {fix && group.aiFixStatus !== "working" && (
              <>
                <p>{fix.explanation}</p>
                <CopyBlock text={fix.html} label="the corrected HTML" />
                <ol className="flex list-decimal flex-col gap-1 pl-5">
                  {fix.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                <p className="text-xs text-muted-foreground">
                  Confidence: {fix.confidence}. Written by {fix.model} on {fix.createdAt.slice(0, 10)}
                  {fix.guidance ? `, with your guidance: "${fix.guidance}"` : ""}. Check it in your code, then Recheck the pages.
                </p>
              </>
            )}
            <div>
              <SuggestFixButton groupId={group.id} again={Boolean(fix)} disabled={!aiReady || group.aiFixStatus === "working"} />
              {!aiReady && <p className="mt-2 text-xs text-muted-foreground">{desktopApp().demo ? "AI help is off in the demo." : "Add an AI key in Settings → General → AI to use this."}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Where it fails</CardTitle>
          <CardDescription>
            {elements.length === 0
              ? "Not found on any page in the latest results."
              : `Each element, with what the check found${group.occurrencesCount > MAX_ELEMENTS ? ` (the first ${MAX_ELEMENTS})` : ""}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {elements.map((e) => (
            <div key={e.id} className="grid gap-2 rounded-md border p-3 text-sm">
              <Link href={`/accessibility/pages/${e.pageId}`} className="w-fit font-medium hover:underline">
                {pathOf(e.url)}
              </Link>
              <code className="w-fit max-w-full truncate text-xs text-muted-foreground">{e.selector}</code>
              <pre className="overflow-x-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{e.html}</pre>
              {e.failureSummary && <p className="whitespace-pre-line text-muted-foreground">{e.failureSummary}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
