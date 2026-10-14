"use client";

import { useTransition } from "react";
import { Loader2Icon, PencilIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type ActionResult, type Field } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addFindingToRoadmap, deleteRoadmapItem, finishItem, requestReplan, runAudit, saveRoadmapItem, setItemStatus } from "./actions";

export type ItemView = {
  id: string;
  stage: string;
  title: string;
  why: string;
  playbook: string | null;
  successMetric: string;
  nextStep: string;
  priority: number;
  status: "todo" | "doing" | "done" | "dropped";
  result: string | null;
  source: "ai" | "owner";
};
export type PlanView = { summary: string; changes: { title: string; change: string; reason: string }[]; date: string } | null;
export type AuditView = {
  id: string;
  kind: "landing" | "onboarding" | "seo" | "geo";
  status: "running" | "done" | "failed";
  summary: string | null;
  error: string | null;
  date: string;
  findings: { severity: "high" | "medium" | "low"; title: string; detail: string; fix: string }[];
};

const STAGES = [
  { key: "acquisition", label: "Acquisition", hint: "Getting the right people to visit" },
  { key: "activation", label: "Activation", hint: "Getting them to first value" },
  { key: "retention", label: "Retention", hint: "Bringing them back" },
  { key: "revenue", label: "Revenue", hint: "Turning users into customers" },
  { key: "referral", label: "Referral", hint: "Users bringing users" },
] as const;

const itemFields: Field[] = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "stage", label: "Funnel stage", type: "select", options: STAGES.map((s) => ({ value: s.key, label: s.label })) },
  {
    name: "priority",
    label: "Priority",
    type: "select",
    options: [1, 2, 3, 4, 5].map((p) => ({ value: String(p), label: `P${p}${p === 1 ? " (this week)" : p === 5 ? " (someday)" : ""}` })),
  },
  { name: "why", label: "Why (the hypothesis)", type: "textarea", rows: 3 },
  { name: "success_metric", label: "Success metric", type: "text", placeholder: "e.g. 40% of new users activate in week 1" },
  { name: "next_step", label: "Next step (shows up on Today)", type: "textarea", rows: 2 },
];

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>, ok?: string) =>
    startTransition(async () => {
      const { error } = await fn();
      if (error) toast.error(error);
      else if (ok) toast.success(ok);
    });
  return [pending, run] as const;
}

function ItemCard({ productId, item }: { productId: string; item: ItemView }) {
  const [pending, run] = useAction();
  return (
    <Card size="sm" id={item.id} className="scroll-mt-20 target:ring-2 target:ring-primary">
      <CardHeader>
        <CardTitle className="text-sm leading-snug">{item.title}</CardTitle>
        <CardDescription className="flex flex-wrap gap-1">
          <Badge variant={item.priority <= 1 ? "default" : "outline"}>P{item.priority}</Badge>
          <Badge variant="outline">{item.source === "ai" ? "AI" : "You"}</Badge>
          {item.playbook && <Badge variant="secondary">{item.playbook}</Badge>}
        </CardDescription>
        <CardAction className="flex">
          <FormDialog
            trigger={
              <Button size="icon-sm" variant="ghost" aria-label="Edit">
                <PencilIcon />
              </Button>
            }
            title="Edit roadmap item"
            description="Editing makes the item yours: re-plans won't change or drop it."
            fields={itemFields}
            values={{ ...item, priority: String(item.priority), success_metric: item.successMetric, next_step: item.nextStep }}
            action={(fd) => saveRoadmapItem(productId, item.id, fd)}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Delete"
            disabled={pending}
            onClick={() => window.confirm(`Delete “${item.title}”?`) && run(() => deleteRoadmapItem(item.id))}
          >
            <Trash2Icon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2 text-xs">
        {item.why && <p className="text-muted-foreground">{item.why}</p>}
        {item.successMetric && (
          <p>
            <span className="font-medium">Success: </span>
            {item.successMetric}
          </p>
        )}
        {item.nextStep && item.status !== "done" && (
          <p>
            <span className="font-medium">Next: </span>
            {item.nextStep}
          </p>
        )}
        {item.result && (
          <p>
            <span className="font-medium">Result: </span>
            {item.result}
          </p>
        )}
        <div className="flex flex-wrap gap-1 pt-1">
          {item.status !== "doing" && item.status !== "done" && (
            <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => setItemStatus(item.id, "doing"))}>
              Start
            </Button>
          )}
          {item.status !== "done" && (
            <FormDialog
              trigger={<Button size="xs" variant="outline">Done</Button>}
              title="What happened?"
              description="A line about the result helps the next re-plan decide what to do more (or less) of."
              fields={[{ name: "result", label: "Result (optional)", type: "textarea", rows: 3, placeholder: "e.g. 120 visits from the guide, 9 signups, 4 still active after a week" }]}
              submitLabel="Mark done"
              action={(fd) => finishItem(item.id, fd)}
            />
          )}
          {item.status !== "dropped" && item.status !== "done" && (
            <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => setItemStatus(item.id, "dropped"))}>
              Drop
            </Button>
          )}
          {(item.status === "done" || item.status === "dropped") && (
            <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => setItemStatus(item.id, "todo"))}>
              Reopen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function RoadmapHeader({ productId, planning, plan }: { productId: string; planning: boolean; plan: PlanView }) {
  const [pending, run] = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan ? `Latest plan · ${plan.date}` : "No plan yet"}</CardTitle>
        <CardDescription>
          {plan ? plan.summary : "The AI reads the intel, your numbers and what's been tried, and proposes a short list of weekly bets."}
        </CardDescription>
        <CardAction className="flex gap-2">
          <Button disabled={pending || planning} onClick={() => run(() => requestReplan(productId), "Planning… this takes a minute or two.")}>
            {planning ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {planning ? "Planning…" : plan ? "Re-plan" : "Create the roadmap"}
          </Button>
          <FormDialog
            trigger={
              <Button variant="outline">
                <PlusIcon /> Add item
              </Button>
            }
            title="Add roadmap item"
            fields={itemFields}
            values={{ stage: "acquisition", priority: "2" }}
            action={(fd) => saveRoadmapItem(productId, null, fd)}
          />
        </CardAction>
      </CardHeader>
      {plan && plan.changes.some((c) => c.change !== "kept") && (
        <CardContent>
          <ul className="grid gap-1 text-sm">
            {plan.changes
              .filter((c) => c.change !== "kept")
              .map((c, i) => (
                <li key={i}>
                  <Badge variant="outline" className="mr-2">
                    {c.change}
                  </Badge>
                  <span className="font-medium">{c.title}</span>
                  <span className="text-muted-foreground"> · {c.reason}</span>
                </li>
              ))}
          </ul>
        </CardContent>
      )}
      <p className="px-(--card-spacing) text-xs text-muted-foreground">Re-plans also run automatically every Monday at 07:00 while Startica is open.</p>
    </Card>
  );
}

export function Board({ productId, items }: { productId: string; items: ItemView[] }) {
  const open = items.filter((i) => i.status === "todo" || i.status === "doing");
  const closed = items.filter((i) => i.status === "done" || i.status === "dropped");
  const sort = (a: ItemView, b: ItemView) => (a.status === "doing" ? -1 : 0) - (b.status === "doing" ? -1 : 0) || a.priority - b.priority;
  return (
    <div className="grid gap-4">
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {STAGES.map((stage) => {
          const stageItems = open.filter((i) => i.stage === stage.key).sort(sort);
          return (
            <section key={stage.key} className="grid w-72 shrink-0 snap-start content-start gap-2 rounded-xl bg-muted/50 p-3">
              <header>
                <h2 className="text-sm font-semibold">
                  {stage.label} <span className="font-normal text-muted-foreground">({stageItems.length})</span>
                </h2>
                <p className="text-xs text-muted-foreground">{stage.hint}</p>
              </header>
              {stageItems.map((item) => (
                <div key={item.id} className="grid gap-1">
                  {item.status === "doing" && <span className="text-xs font-medium text-primary">In progress</span>}
                  <ItemCard productId={productId} item={item} />
                </div>
              ))}
            </section>
          );
        })}
      </div>
      {closed.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">Done and dropped ({closed.length})</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {closed.map((item) => (
              <ItemCard key={item.id} productId={productId} item={item} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const AUDITS: { kind: AuditView["kind"]; label: string; what: string }[] = [
  { kind: "landing", label: "Landing page", what: "Promise, proof and call to action" },
  { kind: "onboarding", label: "Onboarding", what: "From first visit to first key action" },
  { kind: "seo", label: "SEO", what: "Technical basics and missing pages" },
  { kind: "geo", label: "AI search", what: "Do AI assistants and search recommend you?" },
] as const;

const severityVariant = { high: "destructive", medium: "secondary", low: "outline" } as const;

// The SEO and AI search audits live on SEO & GEO → Opportunities; the Roadmap keeps the landing and onboarding ones.
export function Audits({ productId, audits, kinds, title = "Audits" }: { productId: string; audits: AuditView[]; kinds: AuditView["kind"][]; title?: string }) {
  const [pending, run] = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          The AI reviews the site{kinds.includes("geo") ? " (and, for AI search, the web)" : ""}. Each takes a minute or two and costs well under $1. Add any
          finding to the roadmap with one click.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {AUDITS.filter((a) => kinds.includes(a.kind)).map((a) => {
          const latest = audits.find((x) => x.kind === a.kind);
          const running = latest?.status === "running";
          return (
            <section key={a.kind} className="grid gap-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{a.label}</h3>
                <span className="text-sm text-muted-foreground">{a.what}</span>
                {latest && !running && <span className="text-xs text-muted-foreground">· {latest.date}</span>}
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  disabled={pending || running}
                  onClick={() => run(() => runAudit(productId, a.kind), "Audit started")}
                >
                  {running ? <Loader2Icon className="animate-spin" /> : null}
                  {running ? "Running…" : latest ? "Run again" : "Run"}
                </Button>
              </div>
              {latest?.status === "failed" && <p className="text-sm text-destructive">{latest.error}</p>}
              {latest?.status === "done" && (
                <>
                  {latest.summary && <p className="text-sm">{latest.summary}</p>}
                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground">{latest.findings.length} findings</summary>
                    <ul className="mt-2 grid gap-2">
                      {latest.findings.map((f, i) => (
                        <li key={i} className="grid gap-1 rounded-md bg-muted/50 p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={severityVariant[f.severity]}>{f.severity}</Badge>
                            <span className="font-medium">{f.title}</span>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="ml-auto"
                              disabled={pending}
                              onClick={() => run(() => addFindingToRoadmap(latest.id, i), "Added to the roadmap")}
                            >
                              <PlusIcon /> Roadmap
                            </Button>
                          </div>
                          <p className="text-muted-foreground">{f.detail}</p>
                          <p>
                            <span className="font-medium">Fix: </span>
                            {f.fix}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
