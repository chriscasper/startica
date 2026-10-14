import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { siteFindings } from "@startica/core/security/findings";
import { describeDetail, findingInfo } from "@startica/core/security/report";
import { ensureVerifyToken } from "@startica/core/security/verify";
import { scoreHistory } from "@startica/core/a11y/track";
import { ScoreChart } from "../accessibility/score-chart";
import { CheckPageButton, ScanSiteButton } from "../accessibility/controls";
import { ago, loadSites, withSite } from "../accessibility/data";
import { NoProduct, ScanUnavailable, Score, SitePicker } from "../accessibility/ui";
import { bySeverity, OutsideNote, SecurityNoSite, SeverityBadge, VerifyCard } from "./shared";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage(props: PageProps<"/security">) {
  return (
    <>
      <PageHeader title="Security" description="Find and fix the security problems an outside check can see on your own sites." />
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
  if (!site.securityVerifiedAt) return { ctx, data: { site, token: await ensureVerifyToken(site), findings: [], certDays: null, history: [], timeToFix: null, fixedCount: 0, monitorWhen: null, checkedWhen: null } };
  const findings = (await siteFindings(site.id)).sort(bySeverity);
  const history = (await scoreHistory(site.id)).flatMap((h) => (h.at && h.securityScore != null ? [{ at: h.at.toISOString(), score: h.securityScore }] : []));
  // Average days from first seen to fixed, for Startica's own findings fixed in the last 90 days.
  const since = Date.now() - 90 * 86_400_000;
  const fixedRecently = findings.filter((f) => f.status === "fixed" && f.fixedAt && f.fixedAt.getTime() >= since && (f.source === "scan" || f.source === "monitor"));
  const timeToFix = fixedRecently.length ? fixedRecently.reduce((sum, f) => sum + (f.fixedAt!.getTime() - f.firstSeenAt.getTime()), 0) / fixedRecently.length / 86_400_000 : null;
  const monitorWhen = site.securityMonitor ? ago(new Date(site.securityMonitor.checkedAt)) : null;
  const validTo = site.security?.tls?.validTo ?? null;
  const certDays = validTo ? Math.floor((validTo - Date.now()) / 86_400_000) : null;
  return { ctx, data: { site, token: null, findings, certDays, history, timeToFix, fixedCount: fixedRecently.length, monitorWhen, checkedWhen: site.securityCheckedAt ? ago(site.securityCheckedAt) : null } };
}

const VERIFIED_BY: Record<string, string> = { dns: "DNS record", file: "file", search_console: "Search Console", local: "a site on this computer or network", demo: "sample data" };

async function Overview({ searchParams }: { searchParams: PageProps<"/security">["searchParams"] }) {
  const { ctx, data } = await loadOverview((await searchParams).site);
  if (!ctx) return <NoProduct />;
  if (!data) return <SecurityNoSite ctx={ctx} />;
  const { site } = data;
  const q = (href: string) => withSite(href, site.id);

  if (data.token) {
    return (
      <>
        <LiveRefresh tables={["sites"]} />
        <SitePicker ctx={ctx} path="/security" />
        <VerifyCard site={site} token={data.token} demo={ctx.demo} />
      </>
    );
  }

  const open = data.findings.filter((f) => f.status === "open");
  const problems = open.filter((f) => f.severity !== "info");
  const count = (s: string) => open.filter((f) => f.severity === s).length;
  const facts = site.security;
  const tls = facts?.tls;
  const email = facts?.email;
  const days = data.certDays;

  return (
    <>
      <LiveRefresh tables={["sites", "site_scans", "security_findings"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SitePicker ctx={ctx} path="/security" />
        <div className="flex flex-wrap items-center gap-2">
          <ScanSiteButton siteId={site.id} productId={ctx.product.id} canScan={ctx.canScan} />
          <CheckPageButton siteId={site.id} canScan={ctx.canScan} />
        </div>
      </div>
      {!ctx.canScan && <ScanUnavailable demo={ctx.demo} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Security score</CardDescription>
            <CardTitle className="text-3xl">
              <Score value={site.securityScore} target={90} />
              <span className="text-sm font-normal text-muted-foreground"> / 100</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {data.checkedWhen ? `Checked ${data.checkedWhen}` : "Run a scan to check the site"}. Verified by {VERIFIED_BY[site.securityVerifiedBy ?? ""] ?? "you"}.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Open findings</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{problems.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs tabular-nums">
            <Link href={q("/security/findings")} className="hover:underline">
              {count("critical")} critical · {count("high")} high · {count("medium")} medium · {count("low")} low
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>HTTPS</CardDescription>
            <CardTitle className="text-xl">{!facts ? "Not checked yet" : !facts.https ? "Not used" : tls ? (tls.authorized ? "Trusted certificate" : "Certificate not trusted") : "Local site"}</CardTitle>
          </CardHeader>
          {tls && (
            <CardContent className="text-xs text-muted-foreground">
              {tls.protocol ?? "Unknown TLS"}
              {days !== null ? ` · expires in ${days} days` : ""}
              {tls.issuer ? ` · ${tls.issuer}` : ""}
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Email domain and reporting</CardDescription>
            <CardTitle className="text-xl">{email ? (email.spf && email.dmarc ? "SPF and DMARC set" : "Spoofing possible") : facts ? "Not checked (local site)" : "Not checked yet"}</CardTitle>
          </CardHeader>
          {facts && (
            <CardContent className="text-xs text-muted-foreground">
              {email ? `DMARC ${email.dmarc ? `p=${email.dmarcPolicy ?? "?"}` : "missing"} · ` : ""}security.txt {facts.securityTxt?.status === "present" ? "found" : facts.securityTxt?.status === "invalid" ? "incomplete" : "missing"}
            </CardContent>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trend</CardTitle>
          <CardDescription>
            The score after each full scan.{" "}
            {data.timeToFix != null
              ? `Findings fixed in the last 90 days (${data.fixedCount}) took ${data.timeToFix < 1 ? "less than a day" : `${Math.round(data.timeToFix)} days`} on average.`
              : "Time to fix shows once findings get fixed."}{" "}
            <Link href={q("/security/monitoring")} className="underline">
              Monitoring
            </Link>{" "}
            {data.monitorWhen ? `last checked ${data.monitorWhen}.` : "hasn't run yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>{data.history.length < 2 ? <p className="text-sm text-muted-foreground">The chart appears after two full scans.</p> : <ScoreChart data={data.history} target={90} label="Security score" />}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fix these first</CardTitle>
          <CardDescription>The most serious open findings across the site.</CardDescription>
          <CardAction className="flex gap-3">
            <Link href={q("/security/report")} className="text-sm underline">
              Report
            </Link>
            <Link href={q("/security/findings")} className="text-sm underline">
              All findings
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {problems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{site.securityCheckedAt ? "No open problems found by the checks." : "Run a scan to see the site's security here."}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Finding</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.slice(0, 6).map((f) => {
                  const detail = describeDetail(f.detail);
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-normal">
                        <Link href={`/security/findings/${f.id}`} className="font-medium hover:underline">
                          {findingInfo(f).title}
                        </Link>
                        {(detail || f.sourceLabel) && <span className="block text-xs text-muted-foreground">{f.source === "scan" || f.source === "monitor" ? detail : f.sourceLabel}</span>}
                      </TableCell>
                      <TableCell>
                        <SeverityBadge severity={f.severity} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.pagesCount || "Site"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <OutsideNote />
        </CardContent>
      </Card>
    </>
  );
}
