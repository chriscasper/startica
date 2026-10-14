import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckIcon, Loader2Icon, MinusIcon } from "lucide-react";
import { hasAiKey, taskModel } from "@startica/core/ai/client";
import { MODELS } from "@startica/core/ai/models";
import { estimatePerQuestion, MAX_PROMPTS, namesProduct, productNames } from "@startica/core/visibility/analysis";
import { answersFor, listQuestions, listRuns, visibilitySettings } from "@startica/core/visibility/questions";
import type { aiVisibilityAnswers, VisibilityMetrics } from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveProduct, getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import { MetricChart } from "../../analytics/metric-chart";
import { AddQuestionButton, QuestionActions, RunButton, SettingsButton, StopRunButton, SuggestButton } from "./ai-ui";

export const metadata: Metadata = { title: "AI visibility" };

export default function AiVisibilityPage() {
  return (
    <>
      <PageHeader title="AI visibility" description="Whether AI assistants mention and recommend your product when people ask them the questions your customers ask." />
      <Suspense fallback={<PageSkeleton />}>
        <Visibility />
      </Suspense>
    </>
  );
}

type Answer = typeof aiVisibilityAnswers.$inferSelect;
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Everything the page shows. A plain function, so it may read the clock. */
async function load(productId: string, workspaceId: string) {
  const [questions, runs, settings, aiReady, answerModel, scoreModel] = await Promise.all([
    listQuestions(productId),
    listRuns(productId),
    visibilitySettings(productId),
    hasAiKey(),
    taskModel({ workspaceId }, "answer"),
    taskModel({ workspaceId }, "score"),
  ]);
  const running = runs.find((r) => r.status === "running") ?? null;
  const finished = runs.filter((r) => r.status !== "running" && r.metrics && r.metrics.answered > 0);
  const [latest, previous] = finished;
  const answers = await answersFor([running?.id, latest?.id, previous?.id].filter((x): x is string => Boolean(x)));
  const active = questions.filter((q) => q.active).length;
  return {
    questions,
    runs,
    running,
    runningDone: running ? answers.filter((a) => a.runId === running.id).length : 0,
    latest: latest ?? null,
    previous: previous ?? null,
    latestAnswers: new Map(answers.filter((a) => a.runId === latest?.id && a.promptId).map((a) => [a.promptId!, a])),
    previousAnswers: new Map(answers.filter((a) => a.runId === previous?.id && a.promptId).map((a) => [a.promptId!, a])),
    history: [...finished].reverse(),
    settings,
    aiReady,
    model: MODELS.find((m) => m.id === answerModel.model)?.label ?? answerModel.model,
    estimate: estimatePerQuestion(answerModel, scoreModel) * active,
    active,
    ago: (d: Date) => {
      const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400_000));
      return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
    },
  };
}

function Delta({ now, before }: { now: number; before: number | null }) {
  if (before == null) return null;
  const d = now - before;
  if (d === 0) return <span className="text-xs text-muted-foreground">no change</span>;
  return <span className={cn("text-xs tabular-nums", d > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>{`${d > 0 ? "+" : ""}${d} pts`}</span>;
}

function Tile({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="flex items-baseline gap-2 text-2xl tabular-nums">
          {value} {delta}
        </CardTitle>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardHeader>
    </Card>
  );
}

function Result({ answer }: { answer: Answer | undefined }) {
  if (!answer) return <span className="text-xs text-muted-foreground">Not asked yet</span>;
  if (answer.error) return <span className="text-xs text-destructive">Failed</span>;
  if (answer.recommended)
    return (
      <Badge>
        <CheckIcon /> Recommended{answer.position ? ` · #${answer.position}` : ""}
      </Badge>
    );
  if (answer.mentioned) return <Badge variant="secondary">Mentioned{answer.position ? ` · #${answer.position}` : ""}</Badge>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <MinusIcon className="size-3" aria-hidden /> Not mentioned
    </span>
  );
}

function AnswerDetails({ answer }: { answer: Answer }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Read the answer</summary>
      <div className="mt-2 grid gap-3 rounded-md border bg-muted/30 p-3">
        {answer.error ? <p className="text-destructive">{answer.error}</p> : <p className="whitespace-pre-wrap">{answer.answer}</p>}
        {answer.description && (
          <p className="text-xs">
            <span className="text-muted-foreground">How it describes you: </span>“{answer.description}”{answer.sentiment ? ` (${answer.sentiment})` : ""}
          </p>
        )}
        {answer.productsNamed.length > 0 && <p className="text-xs text-muted-foreground">Products named, in order: {answer.productsNamed.join(", ")}</p>}
        {answer.citations.length > 0 && (
          <div className="grid gap-0.5 text-xs">
            <span className="text-muted-foreground">Sources it cited</span>
            {answer.citations.map((c) => (
              <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className={cn("truncate underline", answer.ownCitations.includes(c.url) && "font-medium")}>
                {answer.ownCitations.includes(c.url) ? "★ " : ""}
                {c.title || c.url}
              </a>
            ))}
          </div>
        )}
        {answer.searches.length > 0 && <p className="text-xs text-muted-foreground">Searched for: {answer.searches.map((s) => `“${s}”`).join(", ")}</p>}
      </div>
    </details>
  );
}

function ShareOfVoice({ metrics }: { metrics: VisibilityMetrics }) {
  const max = Math.max(1, ...metrics.brands.map((b) => b.answers));
  return (
    <div className="grid gap-1.5 text-sm">
      {metrics.brands.map((b) => (
        <div key={b.name} className="grid grid-cols-[9rem_1fr_5rem] items-center gap-2">
          <span className={cn("truncate", b.own && "font-medium")}>{b.name}</span>
          <span className="h-2 rounded-full bg-muted">
            <span className={cn("block h-2 rounded-full", b.own ? "bg-(--module)" : "bg-muted-foreground/40")} style={{ width: `${Math.round((b.answers / max) * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums">
            {b.answers} <span className="text-xs text-muted-foreground">({pct(b.answers, metrics.answered)}%)</span>
          </span>
        </div>
      ))}
    </div>
  );
}

async function Visibility() {
  const product = await getActiveProduct();
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a product in <Link href="/settings?tab=products" className="underline">Settings</Link> first.
      </p>
    );
  }
  const workspace = await getWorkspace();
  const d = await load(product.id, workspace.id);
  const names = productNames(product.name, product.url);
  const demo = desktopApp().demo;
  const blocked = demo ? "AI is off in the demo" : !d.aiReady ? "Add an AI key in Settings first" : null;
  const m = d.latest?.metrics ?? null;
  const pm = d.previous?.metrics ?? null;
  const rate = (n: number, mm: VisibilityMetrics | null) => (mm ? pct(n, mm.answered) : null);

  return (
    <>
      <LiveRefresh tables={["ai_prompts", "ai_visibility_runs", "ai_visibility_answers"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs text-muted-foreground">
          Answers come from {d.model} with web search, through your AI key. What people see in ChatGPT, Claude, Perplexity or Google can differ: those apps
          personalize answers and use other models and settings. Treat this as a trend, not an exact count.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SettingsButton productId={product.id} weekly={d.settings.weekly} cap={d.settings.capUsd} />
          <RunButton productId={product.id} questions={d.active} model={d.model} estimate={d.estimate} cap={d.settings.capUsd} disabled={blocked ?? (d.running ? "A run is already going" : null)} />
        </div>
      </div>

      {d.running && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
          <span>
            Asking question {Math.min(d.runningDone + 1, d.running.promptCount)} of {d.running.promptCount}…
          </span>
          <StopRunButton runId={d.running.id} />
        </div>
      )}
      {!d.running && d.runs[0] && d.runs[0].note && (
        <p className={cn("rounded-lg border p-3 text-sm", d.runs[0].status === "failed" && "border-destructive/40 text-destructive")}>
          Last run ({d.ago(d.runs[0].startedAt)}): {d.runs[0].note}
        </p>
      )}

      {m && d.latest && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Mentioned" value={`${pct(m.mentioned, m.answered)}%`} sub={`in ${m.mentioned} of ${m.answered} answers`} delta={<Delta now={pct(m.mentioned, m.answered)} before={rate(pm?.mentioned ?? 0, pm)} />} />
            <Tile label="Recommended" value={`${pct(m.recommended, m.answered)}%`} sub={`${m.recommended} answers suggest it`} delta={<Delta now={pct(m.recommended, m.answered)} before={rate(pm?.recommended ?? 0, pm)} />} />
            <Tile label="Average position" value={m.avgPosition != null ? `#${m.avgPosition}` : "—"} sub="among the products an answer names" />
            <Tile label="Your pages cited" value={`${pct(m.cited, m.answered)}%`} sub={`${m.cited} answers link to your site`} delta={<Delta now={pct(m.cited, m.answered)} before={rate(pm?.cited ?? 0, pm)} />} />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            From the run {d.ago(d.latest.startedAt)} ({d.latest.trigger === "weekly" ? "weekly" : "run by you"}, ${d.latest.costUsd.toFixed(2)})
            {d.previous ? `, compared with the one on ${date(d.previous.startedAt)}` : ""}.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Share of voice</CardTitle>
                <CardDescription>How many answers name each product: yours and the competitors in Intel.</CardDescription>
              </CardHeader>
              <CardContent>
                <ShareOfVoice metrics={m} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Mentioned over time</CardTitle>
                <CardDescription>The share of answers that name {product.name}, run by run.</CardDescription>
              </CardHeader>
              <CardContent>
                {d.history.length > 1 ? (
                  <MetricChart data={d.history.map((r) => ({ day: r.startedAt.toISOString().slice(0, 10), value: pct(r.metrics!.mentioned, r.metrics!.answered) }))} unit="% of answers" label="Mentioned" />
                ) : (
                  <p className="text-sm text-muted-foreground">The trend shows after the second run. Turn on weekly runs in Settings to build it up.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
          <CardDescription>
            {d.questions.length
              ? `${d.active} asked on each run${d.questions.length > d.active ? `, ${d.questions.length - d.active} paused` : ""}. At most ${MAX_PROMPTS}.`
              : "What your customers would ask an AI assistant when they have the problem your product solves."}
          </CardDescription>
          <CardAction className="flex flex-wrap gap-2">
            <SuggestButton productId={product.id} disabled={blocked} />
            <AddQuestionButton productId={product.id} />
          </CardAction>
        </CardHeader>
        <CardContent>
          {d.questions.length === 0 ? (
            <div className="grid justify-items-start gap-2 rounded-lg border border-dashed p-6 text-sm">
              <p>Start with about 20 questions. Startica can write them from your Intel (personas, keywords and competitors), or add your own.</p>
              <SuggestButton productId={product.id} disabled={blocked} variant="default" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Others named</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.questions.map((q) => {
                  const a = d.latestAnswers.get(q.id);
                  const before = d.previousAnswers.get(q.id);
                  const changed = a && before && !a.error && !before.error && a.mentioned !== before.mentioned;
                  return (
                    <TableRow key={q.id} className={cn(!q.active && "opacity-60")}>
                      <TableCell className="max-w-xl whitespace-normal align-top">
                        <div className="grid gap-1">
                          <span>{q.text}</span>
                          <span className="flex flex-wrap gap-1">
                            {q.topic && <Badge variant="outline">{q.topic}</Badge>}
                            <Badge variant="outline">{q.stage}</Badge>
                            {!q.active && <Badge variant="outline">paused</Badge>}
                          </span>
                          {a && <AnswerDetails answer={a} />}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="grid justify-items-start gap-1">
                          <Result answer={a} />
                          {changed && <span className="text-xs text-muted-foreground">{a.mentioned ? "new since last run" : "dropped since last run"}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-56 align-top text-xs whitespace-normal text-muted-foreground">
                        {a?.productsNamed.filter((p) => !namesProduct(p, names)).slice(0, 5).join(", ") || ""}
                      </TableCell>
                      <TableCell className="align-top">
                        <QuestionActions question={q} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
