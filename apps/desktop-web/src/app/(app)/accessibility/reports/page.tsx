import type { Metadata } from "next";
import { Suspense } from "react";
import { DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { CopyBlock } from "@/components/app/copy-block";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildAcr, buildStatement } from "@startica/core/a11y/manual";
import { desktopApp } from "@/lib/desktop";
import { SavePdfButton, StatementForm } from "../controls";
import { loadSites } from "../data";
import { NoProduct, NoSite, SitePicker } from "../ui";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage(props: PageProps<"/accessibility/reports">) {
  return (
    <>
      <PageHeader title="Reports" description="Share where the site stands: a printable report, an accessibility statement for your site, and a conformance report draft." />
      <Suspense fallback={<PageSkeleton />}>
        <Reports searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const LEVEL_STYLE: Record<string, string> = {
  Supports: "border-transparent bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  "Partially Supports": "border-transparent bg-amber-500/10 text-amber-800 dark:text-amber-300",
  "Does Not Support": "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  "Not Applicable": "",
  "Not Evaluated": "",
};

async function Reports({ searchParams }: { searchParams: PageProps<"/accessibility/reports">["searchParams"] }) {
  const ctx = await loadSites((await searchParams).site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <NoSite ctx={ctx} />;
  const site = ctx.site;
  const [statement, acr] = await Promise.all([buildStatement(site), buildAcr(site)]);
  const pdf = process.env.STARTICA_ELECTRON === "1" && !desktopApp().demo;
  const input = site.a11yStatement;
  const tally = (level: string) => acr.filter((r) => r.conformance === level).length;
  const link = buttonVariants({ size: "sm", variant: "outline" });

  return (
    <>
      <SitePicker ctx={ctx} path="/accessibility/reports" />
      <Card>
        <CardHeader>
          <CardTitle>Report</CardTitle>
          <CardDescription>Score and history, every criterion with its automated and manual result, the top issues and the pages with the lowest scores, on one printable page.</CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2">
            <a href={`/accessibility/report/print?site=${site.id}`} target="_blank" rel="noopener noreferrer" className={link}>
              <ExternalLinkIcon />
              Open
            </a>
            <SavePdfButton siteId={site.id} available={pdf} />
            <a href={`/accessibility/export?site=${site.id}`} className={link}>
              <DownloadIcon />
              Issues CSV
            </a>
          </CardAction>
        </CardHeader>
        {!pdf && <CardContent className="text-xs text-muted-foreground">Save as PDF works in the desktop app. Here, open the report and print it from your browser.</CardContent>}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accessibility statement</CardTitle>
          <CardDescription>
            A page for your site that says what standard you aim for, how you check, the known problems and how to reach you. Written from your details and the latest
            results; it never claims the site is compliant. Update it after each round of fixes.
          </CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2">
            <StatementForm
              siteId={site.id}
              saved={Boolean(input)}
              values={{ organization: input?.organization ?? ctx.product.name, contact: input?.contact ?? "", target: input?.target ?? "wcag22aa", approach: input?.approach ?? "", limitations: input?.limitations ?? "" }}
            />
            {statement && (
              <a href={`/accessibility/report/statement?site=${site.id}`} className={link}>
                <DownloadIcon />
                Markdown
              </a>
            )}
          </CardAction>
        </CardHeader>
        {statement && (
          <CardContent>
            <CopyBlock text={statement} label="the statement" />
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conformance report draft (ACR / VPAT style)</CardTitle>
          <CardDescription>
            Each WCAG 2.2 A and AA criterion with a conformance level and remarks, from the automated results and your checklist. Criteria you haven&apos;t checked by hand are
            &quot;Not Evaluated&quot;, however clean the automated checks are. Always a draft: review every row before you share it.
          </CardDescription>
          <CardAction>
            <a href={`/accessibility/report/acr?site=${site.id}`} className={link}>
              <DownloadIcon />
              Markdown
            </a>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm tabular-nums">
            {tally("Supports")} supports · {tally("Partially Supports")} partially · {tally("Does Not Support")} does not · {tally("Not Applicable")} not applicable ·{" "}
            {tally("Not Evaluated")} not evaluated
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Criterion</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Conformance</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {acr.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-normal">
                    <span className="tabular-nums">{r.id}</span> {r.title}
                  </TableCell>
                  <TableCell>{r.level}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={LEVEL_STYLE[r.conformance]}>
                      {r.conformance}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal text-xs text-muted-foreground">{r.remarks}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
