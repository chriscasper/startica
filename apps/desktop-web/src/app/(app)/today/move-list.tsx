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
  setup: "Setup",
  content: "Content",
  audit: "Audit",
  ads: "Ads",
  analytics: "Analytics",
  custom: "Yours",
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
    <li className={`flex gap-3 rounded-lg border p-4 ${closed ? "opacity-60" : ""}`}>
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
          <Badge variant="outline">{kindLabel[move.kind] ?? move.kind}</Badge>
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
