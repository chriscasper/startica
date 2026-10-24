import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sitePlans } from "@startica/core/a11y/fix-plan";
import { ago, loadSites, withSite } from "../data";
import { NoProduct, NoSite, SitePicker } from "../ui";

export const metadata: Metadata = { title: "Accessibility fix plans" };

const STATUS = { working: "Writing…", ready: "Ready", failed: "Failed" } as const;

export default function FixPlansPage(props: PageProps<"/accessibility/fix-plans">) {
  return (
    <>
      <PageHeader title="Fix plans" description="One plan for several issues at once. Pick issues on the Issues list to write a new one." />
      <Suspense fallback={<PageSkeleton />}>
        <Plans searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Plans({ searchParams }: { searchParams: PageProps<"/accessibility/fix-plans">["searchParams"] }) {
  const params = await searchParams;
  const ctx = await loadSites(params.site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <NoSite ctx={ctx} />;
  const site = ctx.site;
  const plans = await sitePlans(site.id);
  return (
    <>
      <LiveRefresh tables={["a11y_fix_plans"]} />
      <SitePicker ctx={ctx} path="/accessibility/fix-plans" />
      <Link href={withSite("/accessibility/issues", site.id)} className="text-sm text-muted-foreground hover:underline">
        ← All issues
      </Link>
      <Card>
        <CardContent>
          {plans.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No fix plans yet. On the Issues list, pick the issues to fix and click Write one fix plan.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Issues</TableHead>
                  <TableHead className="text-right">Tasks</TableHead>
                  <TableHead className="text-right">Written</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-xl whitespace-normal">
                      <Link href={`/accessibility/fix-plans/${p.id}`} className="font-medium hover:underline">
                        {p.plan?.summary ?? `Plan for ${p.groupIds.length} ${p.groupIds.length === 1 ? "issue" : "issues"}`}
                      </Link>
                    </TableCell>
                    <TableCell>{STATUS[p.status]}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.groupIds.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.plan?.tasks.length ?? "–"}</TableCell>
                    <TableCell className="text-right">{ago(p.createdAt)}</TableCell>
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
