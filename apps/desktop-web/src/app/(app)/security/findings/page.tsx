import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { siteFindings } from "@startica/core/security/findings";
import { describeDetail, findingInfo } from "@startica/core/security/report";
import { cn } from "@/lib/utils";
import { loadSites, withSite } from "../../accessibility/data";
import { NoProduct, SitePicker } from "../../accessibility/ui";
import { hasAiKey } from "@startica/core/ai/client";
import { ImportReportButton } from "../controls";
import { bySeverity, OutsideNote, SecurityNoSite, SeverityBadge, STATUS_LABEL } from "../shared";

export const metadata: Metadata = { title: "Security findings" };

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "fixed", label: "Fixed" },
  { key: "decided", label: "Accepted or not a problem" },
] as const;

export default function FindingsPage(props: PageProps<"/security/findings">) {
  return (
    <>
      <PageHeader title="Findings" description="Every security problem the checks found, most serious first. One fix covers every page listed." />
      <Suspense fallback={<PageSkeleton />}>
        <Findings searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Findings({ searchParams }: { searchParams: PageProps<"/security/findings">["searchParams"] }) {
  const params = await searchParams;
  const ctx = await loadSites(params.site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <SecurityNoSite ctx={ctx} />;
  const site = ctx.site;
  if (!site.securityVerifiedAt) {
    return (
      <p className="text-sm">
        Security checks are off until you prove the site is yours.{" "}
        <Link href={withSite("/security", site.id)} className="underline">
          Verify {site.name}
        </Link>
      </p>
    );
  }
  const filter = FILTERS.find((f) => f.key === params.status)?.key ?? "open";
  const all = (await siteFindings(site.id)).sort(bySeverity);
  const shown = all.filter((f) => (filter === "decided" ? f.status === "accepted" || f.status === "false_positive" : f.status === filter));
  const aiReady = !ctx.demo && (await hasAiKey());
  const countOf = (key: (typeof FILTERS)[number]["key"]) => all.filter((f) => (key === "decided" ? f.status === "accepted" || f.status === "false_positive" : f.status === key)).length;

  return (
    <>
      <LiveRefresh tables={["security_findings"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SitePicker ctx={ctx} path="/security/findings" />
        <ImportReportButton siteId={site.id} disabled={!aiReady} />
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Status">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={withSite(`/security/findings?status=${f.key}`, site.id)}
              aria-current={f.key === filter ? "page" : undefined}
              className={cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", f.key === filter && "bg-background font-medium text-foreground shadow-sm")}
            >
              {f.label} <span className="tabular-nums">({countOf(f.key)})</span>
            </Link>
          ))}
        </nav>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {filter === "open" ? (site.securityCheckedAt ? "No open findings." : "Run a scan to see findings here.") : "None."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Finding</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  {filter !== "open" && <TableHead>Status</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((f) => {
                  const info = findingInfo(f);
                  const detail = f.source === "scan" || f.source === "monitor" ? describeDetail(f.detail) : info.sourceLabel;
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-normal">
                        <Link href={`/security/findings/${f.id}`} className="font-medium hover:underline">
                          {info.title}
                        </Link>
                        {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{info.area}</TableCell>
                      <TableCell>
                        <SeverityBadge severity={f.severity} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.source === "import" || f.source === "report" ? "–" : f.pagesCount || "Site"}</TableCell>
                      {filter !== "open" && (
                        <TableCell>
                          <Badge variant="outline">{STATUS_LABEL[f.status]}</Badge>
                        </TableCell>
                      )}
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
