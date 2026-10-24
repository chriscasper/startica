import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { CopyBlock } from "@/components/app/copy-block";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { a11yFixPlans, a11yIssueGroups, sites } from "@startica/db/schema";
import { fixPlanMarkdown, readPlan } from "@startica/core/a11y/fix-plan";
import { hasAiKey } from "@startica/core/ai/client";
import { db, getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import { withSite } from "../../data";
import { DeletePlanButton, RewritePlanButton } from "../../fix-plan-controls";
import { AutomatedNote } from "../../ui";

export const metadata: Metadata = { title: "Accessibility fix plan" };

export default function FixPlanPage(props: PageProps<"/accessibility/fix-plans/[id]">) {
  return (
    <>
      <PageHeader title="Fix plan" />
      <Suspense fallback={<PageSkeleton />}>
        <Plan params={props.params} />
      </Suspense>
    </>
  );
}

async function Plan({ params }: { params: PageProps<"/accessibility/fix-plans/[id]">["params"] }) {
  const { id } = await params;
  const workspace = await getWorkspace();
  const d = await db();
  const [row] = await d
    .select()
    .from(a11yFixPlans)
    .where(and(eq(a11yFixPlans.id, id), eq(a11yFixPlans.workspaceId, workspace.id)));
  if (!row) notFound();
  const [site] = await d.select({ name: sites.name, startUrl: sites.startUrl }).from(sites).where(eq(sites.id, row.siteId));
  // Each issue's status now: some get fixed after the plan was written.
  const live = new Map(
    (await d.select({ id: a11yIssueGroups.id, status: a11yIssueGroups.status }).from(a11yIssueGroups).where(inArray(a11yIssueGroups.id, row.groupIds))).map((g) => [
      g.id,
      g.status,
    ]),
  );
  const aiReady = !desktopApp().demo && (await hasAiKey());
  const plan = readPlan(row.plan);
  const markdown = plan && site && row.status !== "working" ? fixPlanMarkdown(plan, site) : null;
  const fixedCount = row.groupIds.filter((g) => live.get(g) === "fixed").length;

  return (
    <>
      <LiveRefresh tables={["a11y_fix_plans", "a11y_issue_groups"]} />
      <Link href={withSite("/accessibility/fix-plans", row.siteId)} className="text-sm text-muted-foreground hover:underline">
        ← All fix plans
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Fix plan for {row.groupIds.length} {row.groupIds.length === 1 ? "issue" : "issues"}
          </CardTitle>
          <CardDescription>
            {row.status === "working"
              ? "Writing the plan. It appears here in a minute or two."
              : markdown
                ? `One task list for every issue you picked, written to paste into your coding agent.${fixedCount > 0 ? ` ${fixedCount} of the issues ${fixedCount === 1 ? "is" : "are"} fixed since.` : ""}`
                : null}
          </CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2">
            <RewritePlanButton planId={row.id} disabled={!aiReady || row.status === "working"} />
            <DeletePlanButton planId={row.id} siteId={row.siteId} />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {row.status === "failed" && <p className="text-destructive">Couldn&apos;t write the plan: {row.error}</p>}
          {markdown && <CopyBlock text={markdown} label="the plan" document />}
          {plan && row.status !== "working" && (
            <p className="text-xs text-muted-foreground">
              Written by {plan.model} on {plan.createdAt.slice(0, 10)}. After your agent makes the changes, Recheck the issues&apos; pages or run a scan.
            </p>
          )}
          {!aiReady && (
            <p className="text-xs text-muted-foreground">{desktopApp().demo ? "AI help is off in the demo." : "Add an AI key in Settings → General → AI to write it again."}</p>
          )}
          <AutomatedNote />
        </CardContent>
      </Card>
    </>
  );
}
