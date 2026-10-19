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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { securityFindings, sites, trackerIssues } from "@startica/db/schema";
import { findingPages } from "@startica/core/security/findings";
import { hasAiKey } from "@startica/core/ai/client";
import { COST_HINT } from "@startica/core/security/ai";
import { versionsToShow } from "@startica/core/chat/threads";
import { describeDetail, findingInfo } from "@startica/core/security/report";
import type { LibraryVuln } from "@startica/core/security/monitor";
import { trackerFor } from "@startica/core/trackers/trackers";
import { RefineButton } from "@/components/app/refine/refine-panel";
import { VersionsButton } from "@/components/app/refine/versions-button";
import { db, getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import { pathOf, withSite } from "../../../accessibility/data";
import { AddToRoadmapButton, CopyBlock, CreateSecurityIssueButton, DecisionButtons, ExplainButton, MarkFixedButton, RecheckFindingButton } from "../../controls";
import { OutsideNote, SeverityBadge, STATUS_LABEL } from "../../shared";

export const metadata: Metadata = { title: "Security finding" };

const MAX_PAGES = 200;

export default function FindingPage(props: PageProps<"/security/findings/[id]">) {
  return (
    <>
      <PageHeader title="Finding" />
      <Suspense fallback={<PageSkeleton />}>
        <Finding params={props.params} />
      </Suspense>
    </>
  );
}

const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "–");

async function Finding({ params }: { params: PageProps<"/security/findings/[id]">["params"] }) {
  const { id } = await params;
  const workspace = await getWorkspace();
  const d = await db();
  const [row] = await d
    .select({ finding: securityFindings, site: sites })
    .from(securityFindings)
    .innerJoin(sites, eq(sites.id, securityFindings.siteId))
    .where(and(eq(securityFindings.id, id), eq(securityFindings.workspaceId, workspace.id)));
  if (!row) notFound();
  const { finding, site } = row;
  const info = findingInfo(finding);
  // Startica's own checks (the scans and the monitor) recheck and close their findings; imported and reported ones are closed by hand.
  const scanned = finding.source === "scan" || finding.source === "monitor";
  const vulns = finding.rule === "vulnerable-library" && Array.isArray(finding.detail.vulns) ? (finding.detail.vulns as LibraryVuln[]) : [];
  const detail = describeDetail(finding.detail);
  const pages = (await findingPages(site.id, finding.groupKey)).slice(0, MAX_PAGES);
  const tracker = await trackerFor(site.productId);
  const [repoIssue] = tracker
    ? await d
        .select()
        .from(trackerIssues)
        .where(and(eq(trackerIssues.trackerId, tracker.id), eq(trackerIssues.sourceKind, "security"), eq(trackerIssues.sourceId, finding.id)))
    : [];
  const demo = desktopApp().demo;
  const aiReady = !demo && (await hasAiKey());
  const help = finding.aiHelp;
  const versions = await versionsToShow(workspace.id, "security_help", finding.id);

  return (
    <>
      <LiveRefresh tables={["security_findings", "tracker_issues"]} />
      <Link href={withSite("/security/findings", site.id)} className="text-sm text-muted-foreground hover:underline">
        ← All findings
      </Link>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-balance">{info.title}</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <SeverityBadge severity={finding.severity} />
          <Badge variant="outline">{STATUS_LABEL[finding.status]}</Badge>
          <span>{info.area}</span>
          <span>·</span>
          <span>{!scanned ? info.sourceLabel : finding.pagesCount ? `${finding.pagesCount} ${finding.pagesCount === 1 ? "page" : "pages"}` : "Site-wide"}</span>
          <span>·</span>
          <span>
            First seen {date(finding.firstSeenAt)}
            {finding.status === "fixed" ? `, fixed ${date(finding.fixedAt)}` : `, last seen ${date(finding.lastSeenAt)}`}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DecisionButtons findingId={finding.id} status={finding.status} />
        {scanned ? <RecheckFindingButton findingId={finding.id} disabled={demo} /> : finding.status === "open" && <MarkFixedButton findingId={finding.id} />}
        <AddToRoadmapButton findingId={finding.id} />
        {repoIssue ? (
          <a href={repoIssue.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline">
            Issue #{repoIssue.number} <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : (
          tracker && <CreateSecurityIssueButton findingId={finding.id} provider={tracker.provider} />
        )}
      </div>
      {(finding.status === "accepted" || finding.status === "false_positive") && finding.reason && (
        <p className="rounded-lg border p-3 text-sm">
          <span className="font-medium">{finding.status === "accepted" ? "Risk accepted" : "Marked not a problem"}</span> on {date(finding.decidedAt)}: {finding.reason}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{scanned ? "Why it matters" : "What it is"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="whitespace-pre-line">{info.why}</p>
            {detail && (
              <p>
                <span className="font-medium">Seen:</span> <code className="font-mono text-xs break-all">{detail}</code>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How to fix it</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>{info.fix || "The report didn't say. Ask for help below, or ask whoever reported it."}</p>
            <p className="text-xs text-muted-foreground">
              {scanned ? "After fixing, press Recheck: Startica checks again and marks it fixed when the problem is gone." : "Startica doesn't check this one itself: mark it fixed when it's done."}
            </p>
          </CardContent>
        </Card>
      </div>

      {vulns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Advisories</CardTitle>
            <CardDescription>
              From OSV.dev, most urgent first: known exploited (CISA&apos;s KEV list), then by EPSS, the estimated chance of exploitation in the next 30 days. Update to a
              version at or above every &quot;fixed in&quot; shown.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {vulns.map((v) => (
              <div key={v.id} className="flex flex-col gap-1 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={v.severity} />
                  {v.kev && <Badge variant="destructive">Known exploited</Badge>}
                  <a href={`https://osv.dev/vulnerability/${encodeURIComponent(v.id)}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs underline">
                    {v.cve ?? v.id}
                  </a>
                  {v.epss != null && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      EPSS {(v.epss * 100).toFixed(1)}%{v.percentile != null ? ` (higher than ${Math.round(v.percentile * 100)}% of CVEs)` : ""}
                    </span>
                  )}
                </div>
                <span>{v.summary}</span>
                {v.fixed.length > 0 && <span className="text-xs text-muted-foreground">Fixed in {v.fixed.join(", ")}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Help for your stack</CardTitle>
          <CardDescription>
            Your AI key explains it and writes the fix steps (and config, where it helps) for the server or framework your site&apos;s responses show. Copy-only: nothing is
            changed for you. {COST_HINT.explain}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {finding.aiStatus === "working" ? (
            <p className="text-muted-foreground">Working on it…</p>
          ) : finding.aiStatus === "failed" ? (
            <p className="text-destructive">Couldn&apos;t write it: {finding.aiError}</p>
          ) : null}
          {help && finding.aiStatus !== "working" && (
            <>
              <p>{help.summary}</p>
              <ol className="flex list-decimal flex-col gap-1.5 pl-5">
                {help.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              {help.snippets.map((snip, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="text-xs font-medium">{snip.label}</span>
                  <CopyBlock text={snip.code} label={snip.label} language={snip.language} />
                </div>
              ))}
              <p>
                <span className="font-medium">Check it worked:</span> {help.verify}
              </p>
              <p className="text-xs text-muted-foreground">
                Written by {help.model} on {help.createdAt.slice(0, 10)}. Check it against your setup before you change anything.
              </p>
            </>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ExplainButton findingId={finding.id} again={Boolean(help)} disabled={!aiReady || finding.aiStatus === "working"} />
              {help && <RefineButton kind="security_help" subjectId={finding.id} disabled={!aiReady || finding.aiStatus === "working"} />}
              <VersionsButton kind="security_help" noun="fix steps" versions={versions} />
            </div>
            {!aiReady && <p className="mt-2 text-xs text-muted-foreground">{demo ? "AI help is off in the demo." : "Add an AI key in Settings → General → AI to use this."}</p>}
          </div>
        </CardContent>
      </Card>

      {pages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pages</CardTitle>
            <CardDescription>Where the latest scan saw it. It&apos;s usually one setting (server, CDN or template) that fixes every page.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {pages.map((p) => (
                <li key={p.pageId} className="min-w-0 truncate">
                  <Link href={`/accessibility/pages/${p.pageId}`} className="hover:underline">
                    {pathOf(p.url)}
                  </Link>
                  {p.title && <span className="text-muted-foreground"> · {p.title}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(info.owasp || info.controls.length > 0) && <Card>
        <CardHeader>
          <CardTitle>References</CardTitle>
          <CardDescription>Where this belongs in common frameworks, for you or your auditor. References only: Startica doesn&apos;t assess whether a control is met.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {info.owasp && <p>OWASP Top 10: {info.owasp}</p>}
          {info.controls.map((c) => (
            <p key={c}>{c}</p>
          ))}
        </CardContent>
      </Card>}
      <OutsideNote />
    </>
  );
}
