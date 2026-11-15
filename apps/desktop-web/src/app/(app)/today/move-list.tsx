"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon, PlusIcon, RefreshCwIcon, SkipForwardIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type ActionResult } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addMove, deleteMove, refreshMoves, setMoveStatus } from "./actions";

export type MoveView = {
  id: string;
  rank: number;
  kind: string;
  title: string;
  why: string;
  href: string | null;
  status: "open" | "done" | "skipped";
  source: "system" | "owner";
};

const kindLabel: Record<string, string> = {
  inbox: "Inbox",
  roadmap: "Roadmap",
  intel: "Intel",
  competitors: "Competitors",
  setup: "Setup",
  content: "Content",
  audit: "Audit",
  ads: "Ads",
  analytics: "Analytics",
  calendar: "Calendar",
  listening: "Listening",
  replies: "Replies",
  custom: "Yours",
};

// Where a move comes from, by color: conversations blue, planning violet, writing green,
// site checks amber, paid rose, numbers teal. Setup and the owner's own moves stay neutral.
const tone = {
  blue: "border-transparent bg-sky-500/10 text-sky-800 dark:text-sky-300",
  violet: "border-transparent bg-violet-500/10 text-violet-800 dark:text-violet-300",
  green: "border-transparent bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  amber: "border-transparent bg-amber-500/10 text-amber-800 dark:text-amber-300",
  rose: "border-transparent bg-rose-500/10 text-rose-800 dark:text-rose-300",
  teal: "border-transparent bg-teal-500/10 text-teal-800 dark:text-teal-300",
};
const kindStyle: Record<string, string> = {
  inbox: tone.blue,
  replies: tone.blue,
  listening: tone.blue,
  roadmap: tone.violet,
  calendar: tone.violet,
  content: tone.green,
  audit: tone.amber,
  ads: tone.rose,
  analytics: tone.teal,
  intel: tone.teal,
  competitors: tone.teal,
};

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

function Move({ move }: { move: MoveView }) {
  const [pending, run] = useAction();
  const closed = move.status !== "open";
  return (
    <li className={`flex gap-3 rounded-lg border p-4 transition-colors hover:border-(--module)/40 hover:bg-(--tint) ${closed ? "opacity-60" : ""}`}>
      <Button
        size="icon-sm"
        variant={move.status === "done" ? "default" : "outline"}
        aria-label={move.status === "done" ? "Mark as not done" : "Mark as done"}
        disabled={pending}
        onClick={() => run(() => setMoveStatus(move.id, move.status === "done" ? "open" : "done"))}
        className="mt-0.5 shrink-0 rounded-full"
      >
        {move.status === "done" && <CheckIcon />}
      </Button>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${move.status === "done" ? "line-through" : ""}`}>{move.title}</span>
          <Badge variant="outline" className={kindStyle[move.kind]}>{kindLabel[move.kind] ?? move.kind}</Badge>
          {move.status === "skipped" && <Badge variant="secondary">Skipped</Badge>}
        </div>
        {move.why && <p className="line-clamp-2 text-sm text-muted-foreground" title={move.why}>{move.why}</p>}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {move.href && !closed && (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={move.href} />}>
            Go <ArrowRightIcon />
          </Button>
        )}
        {move.status === "open" ? (
          <Button size="icon-sm" variant="ghost" aria-label="Skip today" disabled={pending} onClick={() => run(() => setMoveStatus(move.id, "skipped"))}>
            <SkipForwardIcon />
          </Button>
        ) : (
          move.status === "skipped" && (
            <Button size="icon-sm" variant="ghost" aria-label="Undo skip" disabled={pending} onClick={() => run(() => setMoveStatus(move.id, "open"))}>
              <Undo2Icon />
            </Button>
          )
        )}
        {move.source === "owner" && (
          <Button size="icon-sm" variant="ghost" aria-label="Delete" disabled={pending} onClick={() => run(() => deleteMove(move.id))}>
            <Trash2Icon />
          </Button>
        )}
      </div>
    </li>
  );
}

export function MoveList({ productId, moves }: { productId: string; moves: MoveView[] }) {
  const [pending, run] = useAction();
  const open = moves.filter((m) => m.status === "open").length;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          {moves.length === 0 ? "Nothing waiting. Nice." : open === 0 ? "All done for today." : `${open} of ${moves.length} left`}
        </p>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => refreshMoves(productId), "Updated")}>
          <RefreshCwIcon /> Refresh
        </Button>
        <FormDialog
          trigger={
            <Button size="sm" variant="outline">
              <PlusIcon /> Add a move
            </Button>
          }
          title="Add a move for today"
          fields={[
            { name: "title", label: "What", type: "text", required: true },
            { name: "why", label: "Why (optional)", type: "text" },
          ]}
          submitLabel="Add"
          action={(fd) => addMove(productId, fd)}
        />
      </div>
      <ol className="grid gap-2">
        {moves.map((m) => (
          <Move key={m.id} move={m} />
        ))}
      </ol>
    </div>
  );
}
