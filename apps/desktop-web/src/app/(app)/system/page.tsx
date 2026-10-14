import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { desc, eq } from "drizzle-orm";
import { activeProvider, aiApiKey, hasAiKey, monthlyBudgetUsd, monthToDateSpendUsd } from "@startica/core/ai/client";
import { PROVIDERS } from "@startica/core/ai/models";
import { ExternalLinkIcon } from "lucide-react";
import * as schema from "@startica/db/schema";
import { db, getWorkspace } from "@/lib/dal";
import { RunPingButton } from "./run-ping-button";
import { StopButton } from "@/components/app/scan-activity";
import { activeJobs } from "@startica/core/jobs/cancel";
import { QUEUE_LABELS } from "@startica/core/jobs/background";

export const metadata: Metadata = { title: "System" };

const statusVariant = {
  succeeded: "secondary",
  ok: "secondary",
  running: "outline",
  failed: "destructive",
  error: "destructive",
  refused: "destructive",
  blocked: "destructive",
} as const;

function StatusBadge({ status }: { status: string }) {
  const variant = statusVariant[status as keyof typeof statusVariant] ?? "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

function formatTime(date: Date) {
  return date.toLocaleString("en-US", { dateStyle: "short", timeStyle: "medium" });
}

export default function SystemPage() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="System" description="Background jobs, AI calls and spend." />
        <RunPingButton />
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <SystemContent />
      </Suspense>
    </>
  );
}

/** Jobs waiting or running, with how long. A plain function, so it may read the clock. */
async function loadActive(workspaceId: string) {
  const minutes = (ms: number) => Math.max(0, Math.round((Date.now() - ms) / 60_000));
  return (await activeJobs(workspaceId)).map((j) => ({
    id: j.id,
    label: QUEUE_LABELS[j.queue] ?? j.queue,
    state: j.stopping ? "stopping" : j.status === "running" ? `running ${minutes(j.startedAt ?? j.updatedAt.getTime())} min` : `waiting ${minutes(j.createdAt.getTime())} min`,
    stopping: j.stopping,
  }));
}

async function SystemContent() {
  const workspace = await getWorkspace();
  const d = await db();
  const [jobRuns, aiRuns, spentUsd, budgetUsd, hasApiKey, provider, anthropicKey, openaiKey] = await Promise.all([
    d.select().from(schema.jobRuns).where(eq(schema.jobRuns.workspaceId, workspace.id)).orderBy(desc(schema.jobRuns.startedAt)).limit(20),
    d.select().from(schema.aiRuns).where(eq(schema.aiRuns.workspaceId, workspace.id)).orderBy(desc(schema.aiRuns.createdAt)).limit(20),
    monthToDateSpendUsd(workspace.id),
    monthlyBudgetUsd(),
    hasAiKey(),
    activeProvider(),
    aiApiKey("anthropic"),
    aiApiKey("openai"),
  ]);
  const active = await loadActive(workspace.id);
  const consoles = (["anthropic", "openai"] as const).filter((p) => (p === "anthropic" ? anthropicKey : openaiKey));

  return (
    <>
      <LiveRefresh tables={["job_runs", "ai_runs", "jobs"]} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{PROVIDERS[provider].keyLabel}</CardDescription>
            <CardTitle>{hasApiKey ? "Configured" : "Missing"}</CardTitle>
          </CardHeader>
          {!hasApiKey && (
            <CardContent className="text-sm text-muted-foreground">
              Add your key in <a href="/settings" className="underline">Settings → General → AI</a>.
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>AI spend this month</CardDescription>
            <CardTitle>
              ${spentUsd.toFixed(4)} <span className="text-sm font-normal text-muted-foreground">of ${budgetUsd}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Startica&apos;s own calls, estimated from tokens.
            {consoles.length > 0 && (
              <>
                {" "}Your account&apos;s actual usage:{" "}
                {consoles.map((p, i) => (
                  <span key={p}>
                    {i > 0 && " · "}
                    <a href={PROVIDERS[p].usageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
                      {p === "anthropic" ? "Anthropic" : "OpenAI"}
                      <ExternalLinkIcon className="size-3" aria-hidden />
                    </a>
                  </span>
                ))}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Workspace</CardDescription>
            <CardTitle>{workspace.name}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Running and waiting</CardTitle>
          <CardDescription>
            Scans and AI work in progress. Stop ends a job early: a running AI call is cut off (you pay only for what it used), and whatever was
            already finished is kept.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is running.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>{j.label}</TableCell>
                    <TableCell className="text-muted-foreground">{j.state}</TableCell>
                    <TableCell className="text-right">{!j.stopping && <StopButton target={{ job: j.id }} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job runs</CardTitle>
          <CardDescription>Latest 20. Updates live while the worker runs.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Queue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Result / error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="whitespace-nowrap">{formatTime(run.startedAt)}</TableCell>
                  <TableCell>{run.queue}</TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>{run.attempt}</TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {run.error ?? (run.result ? JSON.stringify(run.result) : "")}
                  </TableCell>
                </TableRow>
              ))}
              {jobRuns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No jobs yet. Click “Run test job”.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI calls</CardTitle>
          <CardDescription>Every AI request, with tokens and estimated cost.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Tokens in / out</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aiRuns.map((run) => (
                <TableRow key={run.id} title={run.error ?? undefined}>
                  <TableCell className="whitespace-nowrap">{formatTime(run.createdAt)}</TableCell>
                  <TableCell>{run.task}</TableCell>
                  <TableCell className="font-mono text-xs">{run.model}</TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {run.inputTokens} / {run.outputTokens}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">${run.costUsd.toFixed(5)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {run.latencyMs != null ? `${run.latencyMs} ms` : ""}
                  </TableCell>
                </TableRow>
              ))}
              {aiRuns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No AI calls yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
