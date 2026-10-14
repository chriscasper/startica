import type { Metadata } from "next";
import { Suspense } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { CircleAlertIcon, CircleCheckIcon, CircleHelpIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { AGENT_CHECKS, type CheckId } from "@startica/core/agents/checks";
import { agentCheckHistory } from "@startica/core/agents/run";
import { jobs, type AgentCheckResult } from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { MetricChart } from "../../analytics/metric-chart";
import { ago, loadSites } from "../../accessibility/data";
import { NoProduct, Score } from "../../accessibility/ui";
import { SeoNoSite, SeoSitePicker } from "../shared";
import { CheckNowButton } from "./check-button";

export const metadata: Metadata = { title: "Agent readiness" };

export default function AgentsPage(props: PageProps<"/seo/agents">) {
  return (
    <>
      <PageHeader title="Agent readiness" description="Whether AI agents (assistants that browse, compare and act for people) can understand your site and get simple things done on it." />
      <Suspense fallback={<PageSkeleton />}>
        <Agents searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const GROUPS: { title: string; description: string; ids: CheckId[] }[] = [
  { title: "Can agents reach it?", description: "Whether an agent gets to the page at all.", ids: ["public-pages", "no-bot-wall", "agent-access"] },
  { title: "Can agents read it?", description: "Whether what it gets makes sense without a person looking at the screen.", ids: ["content-without-js", "structure", "structured-data", "pricing-in-text", "docs-public", "llms-txt"] },
  { title: "Can agents act on it?", description: "Whether it can find its way and use what's there.", ids: ["controls-named", "forms-labeled"] },
  { title: "Extras for agents", description: "Newer ways to make a site easy for agents. Good to know about, not scored.", ids: ["api-description", "agent-tools", "markdown"] },
];

const STATUS = {
  pass: { icon: CircleCheckIcon, label: "Passed", className: "text-emerald-700 dark:text-emerald-400" },
  warn: { icon: TriangleAlertIcon, label: "Worth fixing", className: "text-amber-700 dark:text-amber-400" },
  fail: { icon: CircleAlertIcon, label: "Problem", className: "text-destructive" },
  info: { icon: InfoIcon, label: "Good to know", className: "text-muted-foreground" },
  unknown: { icon: CircleHelpIcon, label: "Not checked yet", className: "text-muted-foreground" },
} as const;

function CheckRow({ result }: { result: AgentCheckResult }) {
  const meta = AGENT_CHECKS[result.id as CheckId];
  const s = STATUS[result.status];
  return (
    <li className="grid grid-cols-[1.25rem_1fr] gap-x-2 gap-y-1 py-3">
      <s.icon className={cn("mt-0.5 size-5", s.className)} aria-label={s.label} />
      <div className="grid gap-1">
        <div className="font-medium">{meta?.title ?? result.id}</div>
        <p className="text-sm">{result.summary}</p>
        {result.detail && result.detail.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {result.detail.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
        {meta && result.status !== "pass" && <p className="text-xs text-muted-foreground">{meta.why}</p>}
      </div>
    </li>
  );
}

async function Agents({ searchParams }: { searchParams: PageProps<"/seo/agents">["searchParams"] }) {
  const ctx = await loadSites((await searchParams).site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <SeoNoSite ctx={ctx} />;
  const site = ctx.site;
  const [history, waiting] = await Promise.all([
    agentCheckHistory(site.id),
    (await db())
      .select({ payload: jobs.payload })
      .from(jobs)
      .where(and(eq(jobs.queue, "agent_check"), inArray(jobs.status, ["queued", "running"]))),
  ]);
  const running = waiting.some((j) => j.payload.siteId === site.id);
  const latest = history.find((h) => !h.error) ?? null;
  const failed = history[0]?.error ? history[0] : null;
  const byId = new Map((latest?.results ?? []).map((r) => [r.id, r]));
  const scored = [...history].reverse().filter((h) => h.score != null);
  const counts = (latest?.results ?? []).reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {} as Record<string, number>);

  return (
    <>
      <LiveRefresh tables={["agent_checks", "sites", "a11y_issue_groups"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeoSitePicker ctx={ctx} path="/seo/agents" />
        <CheckNowButton siteId={site.id} running={running} disabled={ctx.demo ? "Checks are off in the demo" : null} />
      </div>
      {failed && <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">The last check didn&apos;t finish: {failed.error}</p>}

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card>
          <CardHeader>
            <CardDescription>Agent readiness</CardDescription>
            <CardTitle className="text-3xl">
              {latest?.score != null ? (
                <>
                  <Score value={latest.score} target={80} />
                  <span className="text-sm font-normal text-muted-foreground"> / 100</span>
                </>
              ) : (
                "—"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-xs text-muted-foreground">
            {latest ? (
              <>
                <span>
                  {counts.pass ?? 0} passed · {counts.warn ?? 0} worth fixing · {counts.fail ?? 0} {counts.fail === 1 ? "problem" : "problems"}
                </span>
                <span>Checked {ago(latest.checkedAt)}. Runs after every scan, and when you click Check now.</span>
              </>
            ) : (
              <span>Not checked yet. It runs after the next scan, or click Check now.</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Over time</CardTitle>
          </CardHeader>
          <CardContent>
            {scored.length > 1 ? (
              <MetricChart data={scored.map((h) => ({ day: h.checkedAt.toISOString().slice(0, 10), value: h.score! }))} unit="points" label="Agent readiness" />
            ) : (
              <p className="text-sm text-muted-foreground">The trend shows after the second check.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {GROUPS.map((g) => (
        <Card key={g.title}>
          <CardHeader>
            <CardTitle>{g.title}</CardTitle>
            <CardDescription>{g.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {g.ids.map((id) => (
                <CheckRow key={id} result={byId.get(id) ?? { id, status: "unknown", summary: "Not checked yet." }} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground">
        Startica requests your public pages the way a simple agent does: plain HTML, no JavaScript, no sign-in, identified as StarticaAgentCheck. A site that lets
        only named AI agents through its bot protection may show a challenge here that those agents don&apos;t get. Signals checked 2026-10-12.
      </p>
    </>
  );
}
