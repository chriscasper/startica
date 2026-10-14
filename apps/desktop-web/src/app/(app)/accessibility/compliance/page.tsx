import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { a11yIssueGroups } from "@startica/db/schema";
import { complianceView, isProfile, PROFILES, STATUS_LABEL, type CriterionStatus } from "@startica/core/a11y/wcag";
import { db } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { loadSites } from "../data";
import { AutomatedNote, NoProduct, NoSite, SitePicker } from "../ui";

export const metadata: Metadata = { title: "Compliance view" };

export default function CompliancePage(props: PageProps<"/accessibility/compliance">) {
  return (
    <>
      <PageHeader title="By criterion" description="Each success criterion of a standard, with what the automated checks found. It shows progress; it isn't a conformance claim." />
      <Suspense fallback={<PageSkeleton />}>
        <Compliance searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const STATUS_STYLE: Record<CriterionStatus, string> = {
  failing: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  needs_review: "border-transparent bg-amber-500/10 text-amber-800 dark:text-amber-300",
  no_failures: "border-transparent bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  manual: "",
};

async function Compliance({ searchParams }: { searchParams: PageProps<"/accessibility/compliance">["searchParams"] }) {
  const params = await searchParams;
  const ctx = await loadSites(params.site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <NoSite ctx={ctx} />;
  const site = ctx.site;
  const profile = isProfile(params.profile) ? params.profile : "wcag22";
  const groups = await (await db()).select().from(a11yIssueGroups).where(eq(a11yIssueGroups.siteId, site.id));
  const rows = complianceView(profile, groups, site.includeAaa);
  const count = (s: CriterionStatus) => rows.filter((r) => r.status === s).length;
  const pill = (active: boolean) => cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", active && "bg-background font-medium text-foreground shadow-sm");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SitePicker ctx={ctx} path="/accessibility/compliance" />
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Standard">
          {Object.entries(PROFILES).map(([key, p]) => (
            <Link key={key} href={`/accessibility/compliance?site=${site.id}&profile=${key}`} className={pill(profile === key)} aria-current={profile === key ? "page" : undefined}>
              {p.label}
            </Link>
          ))}
        </nav>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{PROFILES[profile].label}</CardTitle>
          <CardDescription>
            {PROFILES[profile].note} {rows.length} criteria at level A and AA{site.includeAaa && profile === "wcag22" ? " (and AAA)" : ""}: {count("failing")} failing,{" "}
            {count("needs_review")} needing review, {count("no_failures")} with no automated failures and {count("manual")} that only a person can check. Legal scope and deadlines
            change; check the current rules for your situation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Criterion</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Automated result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-normal">
                    <span className="tabular-nums">{r.id}</span> {r.title}
                  </TableCell>
                  <TableCell>{r.level}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLE[r.status]}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                    {r.status === "failing" && (
                      <Link href={`/accessibility/issues?site=${site.id}&criterion=${r.id}`} className="ml-2 text-xs underline">
                        {r.issues} {r.issues === 1 ? "issue" : "issues"}
                      </Link>
                    )}
                    {r.status === "needs_review" && (
                      <Link href={`/accessibility/review?site=${site.id}`} className="ml-2 text-xs underline">
                        {r.reviews} to review
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <AutomatedNote />
        </CardContent>
      </Card>
    </>
  );
}
