"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, SettingsIcon, SparklesIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type ActionResult, type Field } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { editQuestion, newQuestion, removeQuestion, runNow, saveSettings, stopVisibilityRun, suggest, toggleQuestion } from "./actions";

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

const usd = (n: number) => `$${n < 1 ? n.toFixed(2) : n.toFixed(2).replace(/\.00$/, "")}`;

/** Run now, with what it will ask, with which model, and what it may cost. */
export function RunButton({
  productId,
  questions,
  model,
  estimate,
  cap,
  disabled,
}: {
  productId: string;
  questions: number;
  model: string;
  estimate: number;
  cap: number;
  disabled?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useAction();
  const capped = estimate > cap;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={Boolean(disabled) || questions === 0} title={disabled ?? undefined} />}>
        <PlayIcon /> Run now
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask {questions === 1 ? "1 question" : `${questions} questions`}</DialogTitle>
          <DialogDescription>
            Each question goes to {model} with web search, as a person would ask it, without mentioning your product. Then a smaller model reads each
            answer.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Likely cost</dt>
          <dd className="tabular-nums">
            about {usd(estimate)} (up to 3 web searches a question, $0.01 each)
          </dd>
          <dt className="text-muted-foreground">Cap</dt>
          <dd className="tabular-nums">
            {usd(cap)}: the run stops before it would go over{capped ? `, so it may not ask every question` : ""}
          </dd>
          <dt className="text-muted-foreground">Time</dt>
          <dd>about {Math.max(1, Math.round((questions * 25) / 60))} min</dd>
        </dl>
        <p className="text-xs text-muted-foreground">Billed to your AI key and counted against your monthly AI budget. You can stop it any time and keep the answers so far.</p>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await runNow(productId);
                if (!result.error) setOpen(false);
                return result;
              }, "Running. Answers appear as they come in.")
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />} Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StopRunButton({ runId }: { runId: string }) {
  const [pending, run] = useAction();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => stopVisibilityRun(runId), "Stopping…")}>
      <SquareIcon /> Stop
    </Button>
  );
}

export function SettingsButton({ productId, weekly, cap }: { productId: string; weekly: boolean; cap: number }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline">
          <SettingsIcon /> Settings
        </Button>
      }
      title="AI visibility settings"
      fields={[
        { name: "weekly", label: "Run every week (Monday morning, while Startica is open)", type: "checkbox" },
        { name: "cap_usd", label: "Cost cap per run, in USD", type: "number", required: true, hint: "A run stops before it would go over this." },
      ]}
      values={{ weekly: weekly ? "on" : "", cap_usd: String(cap) }}
      action={(fd) => saveSettings(productId, fd)}
    />
  );
}

const STAGES = [
  { value: "discover", label: "Discover: learning about the problem or options" },
  { value: "compare", label: "Compare: weighing options" },
  { value: "decide", label: "Decide: ready to choose or switch" },
];

const questionFields: Field[] = [
  { name: "text", label: "Question", type: "textarea", rows: 3, placeholder: "e.g. What's a good app for taking field notes without signal?", hint: "Ask it the way a customer would, without your product's name." },
  { name: "topic", label: "Topic (optional)", type: "text", placeholder: "offline notes" },
  { name: "stage", label: "Stage", type: "select", options: STAGES },
];

export function AddQuestionButton({ productId }: { productId: string }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          <PlusIcon /> Add a question
        </Button>
      }
      title="Add a question"
      fields={questionFields}
      values={{ stage: "discover" }}
      submitLabel="Add"
      action={(fd) => newQuestion(productId, fd)}
    />
  );
}

export function SuggestButton({ productId, disabled, variant = "outline" }: { productId: string; disabled?: string | null; variant?: "outline" | "default" }) {
  const [pending, run] = useAction();
  return (
    <Button variant={variant} size="sm" disabled={pending || Boolean(disabled)} title={disabled ?? undefined} onClick={() => run(() => suggest(productId), "Writing questions from your Intel…")}>
      <SparklesIcon /> Suggest questions
    </Button>
  );
}

export function QuestionActions({ question }: { question: { id: string; text: string; topic: string; stage: string; active: boolean } }) {
  const [pending, run] = useAction();
  return (
    <div className="flex items-center justify-end gap-0.5">
      <FormDialog
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label="Edit question">
            <PencilIcon />
          </Button>
        }
        title="Edit question"
        fields={questionFields}
        values={{ text: question.text, topic: question.topic, stage: question.stage }}
        action={(fd) => editQuestion(question.id, fd)}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={question.active ? "Pause question" : "Resume question"}
        title={question.active ? "Pause: leave it out of runs" : "Resume: ask it in runs"}
        disabled={pending}
        onClick={() => run(() => toggleQuestion(question.id, !question.active))}
      >
        {question.active ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete question"
        disabled={pending}
        onClick={() => window.confirm("Delete this question? It stops being asked; past runs keep counting its answers in their totals.") && run(() => removeQuestion(question.id))}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
