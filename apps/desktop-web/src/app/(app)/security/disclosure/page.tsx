import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { securityReports } from "@startica/db/schema";
import { hasAiKey } from "@startica/core/ai/client";
import { db } from "@/lib/dal";
import { loadSites, withSite } from "../../accessibility/data";
import { NoProduct } from "../../accessibility/ui";
import { AddReportButton, CopyBlock, PolicyForm, ReportActions, SecurityTxtForm } from "../controls";
import { SeverityBadge } from "../shared";

export const metadata: Metadata = { title: "Disclosure" };

export default function DisclosurePage(props: PageProps<"/security/disclosure">) {
  return (
    <>
      <PageHeader title="Disclosure" description="Make it easy for people to tell you about security problems, and keep track of what they report." />
      <Suspense fallback={<PageSkeleton />}>
        <Disclosure searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const VALID: Record<string, string> = { likely: "Looks real", unclear: "Unclear", unlikely: "Probably not a problem" };

async function Disclosure({ searchParams }: { searchParams: PageProps<"/security/disclosure">["searchParams"] }) {
  const ctx = await loadSites((await searchParams).site);
  if (!ctx) return <NoProduct />;
  const site = ctx.site;
  const reports = await (await db()).select().from(securityReports).where(eq(securityReports.productId, ctx.product.id)).orderBy(desc(securityReports.receivedAt));
  const aiReady = !ctx.demo && (await hasAiKey());
  const verifiedSite = ctx.sites.find((s) => s.securityVerifiedAt) ?? null;
  const open = reports.filter((r) => r.status === "new");
  const closed = reports.filter((r) => r.status !== "new");

  return (
    <>
      <LiveRefresh tables={["security_reports"]} />
      <Card>
        <CardHeader>
          <CardTitle>Reported problems</CardTitle>
          <CardDescription>
            Paste what people send you. With an AI key, each one is triaged: how serious it could be, whether it looks real, whether you already know about
            it, and a reply to send yourself. Startica never sends anything.
          </CardDescription>
          <CardAction>
            <AddReportButton productId={ctx.product.id} aiReady={aiReady} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {open.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting. Reports you add appear here until you mark them resolved or dismiss them.</p>}
          {open.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {r.triage && <SeverityBadge severity={r.triage.severity} />}
                {r.triage && <Badge variant="outline">{VALID[r.triage.likelyValid]}</Badge>}
                <span className="font-medium">{r.reporter || "Unknown sender"}</span>
                <span className="text-muted-foreground">· {r.receivedAt.toISOString().slice(0, 10)}</span>
                {r.findingId && (
                  <Link href={`/security/findings/${r.findingId}`} className="underline">
                    Tracked as a finding
                  </Link>
                )}
              </div>
              {r.triageStatus === "working" && <p className="text-muted-foreground">Triaging…</p>}
              {r.triageStatus === "failed" && <p className="text-destructive">Couldn&apos;t triage it: {r.triageError}</p>}
              {r.triage ? (
                <>
                  <p>{r.triage.summary}</p>
                  {r.triage.duplicateOf && (
                    <p>
                      Looks like a finding you already have:{" "}
                      <Link href={`/security/findings/${r.triage.duplicateOf}`} className="underline">
                        open it
                      </Link>
                    </p>
                  )}
                  {r.triage.missingInfo.length > 0 && (
                    <div>
                      <span className="font-medium">Missing:</span>
                      <ul className="list-disc pl-5">
                        {r.triage.missingInfo.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">Reply to send</span>
                    <CopyBlock text={r.triage.reply} label="the reply" />
                  </div>
                </>
              ) : (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">What they sent</summary>
                  <p className="mt-2 whitespace-pre-wrap">{r.body}</p>
                </details>
              )}
              {r.triage && (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">What they sent</summary>
                  <p className="mt-2 whitespace-pre-wrap">{r.body}</p>
                </details>
              )}
              <ReportActions reportId={r.id} status={r.status} siteId={verifiedSite?.id ?? null} hasFinding={Boolean(r.findingId)} canTriage={aiReady && r.triageStatus !== "working"} triaged={Boolean(r.triage)} />
            </div>
          ))}
          {closed.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Resolved and dismissed ({closed.length})</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {closed.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{r.status === "resolved" ? "Resolved" : "Dismissed"}</Badge>
                    <span>{r.triage?.summary ?? r.body.slice(0, 120)}</span>
                    <ReportActions reportId={r.id} status={r.status} siteId={null} hasFinding canTriage={false} triaged />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      {site ? (
        <Card>
          <CardHeader>
            <CardTitle>security.txt for {site.name}</CardTitle>
            <CardDescription>
              A small file (RFC 9116) that tells people how to report a problem to you. Publish it at <code className="font-mono">/.well-known/security.txt</code>.{" "}
              {site.security?.securityTxt?.status === "present" ? "The latest scan found one." : site.securityVerifiedAt ? (
                <Link href={withSite("/security/findings", site.id)} className="underline">
                  The latest scan didn&apos;t find a complete one.
                </Link>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SecurityTxtForm siteId={site.id} defaultPolicy={`${new URL(site.startUrl).origin}/security-policy`} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Add a site under Accessibility or Security to make its security.txt.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Disclosure policy</CardTitle>
          <CardDescription>
            A page that says how to report a problem, what&apos;s in scope, and that you won&apos;t take action against people who follow it. Publish it at the
            policy address in your security.txt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PolicyForm productId={ctx.product.id} />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">The policy text is a starting point, not legal advice. Edit it to match how you actually handle reports.</p>
    </>
  );
}
