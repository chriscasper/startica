"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { planAgain, startContentPlan } from "./actions";

export type PlanView = {
  id: string;
  range: string;
  channels: string;
  postsPerWeek: number;
  status: "working" | "ready" | "failed";
  error: string | null;
  summary: string | null;
  pieces: number;
  costUsd: number;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Plan with AI: range, channels, posts per week and guidance, with the cost shown before it runs. */
export function PlanDialog({
  productId,
  channels,
  estimate,
  aiKey,
  busy,
}: {
  productId: string;
  channels: { value: string; label: string; hint: string }[];
  estimate: { baseUsd: number; perPieceUsd: number; model: string };
  aiKey: boolean;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [weeks, setWeeks] = useState(1);
  const [perWeek, setPerWeek] = useState(5);
  const [picked, setPicked] = useState<string[]>(["linkedin", "bluesky"]);
  const [pending, startTransition] = useTransition();
  const pieces = Math.max(0, Math.round(perWeek * weeks));
  const usd = estimate.baseUsd + pieces * estimate.perPieceUsd;

  function submit(formData: FormData) {
    startTransition(async () => {
      const { error } = await startContentPlan(productId, formData);
      if (error) return void toast.error(error);
      setOpen(false);
      toast.success("Planning… the posts appear on the calendar and in the Library as they're written.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button disabled={busy || !aiKey} title={aiKey ? undefined : "Add an AI key in Settings first"}>
            {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} {busy ? "Planning…" : "Plan with AI"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form action={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Plan the next weeks</DialogTitle>
            <DialogDescription>
              The AI picks topics and times from your Intel, the latest analytics read-out, what worked and the best-time hints, then writes each post in your voice. Each lands in the Library as a draft with a planned time; you review and post every one.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="plan-weeks">How far ahead</Label>
              <select id="plan-weeks" name="weeks" className={selectClass} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                <option value={1}>The next week</option>
                <option value={2}>The next two weeks</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plan-per-week">Posts per week</Label>
              <Input id="plan-per-week" name="postsPerWeek" type="number" min={1} max={14} value={perWeek} onChange={(e) => setPerWeek(Number(e.target.value) || 1)} />
            </div>
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-medium">Channels</legend>
            <div className="grid max-h-56 gap-1.5 overflow-y-auto pr-1">
              {channels.map((c) => (
                <label key={c.value} className="grid grid-cols-[auto_1fr] items-start gap-x-2 text-sm">
                  <input
                    type="checkbox"
                    name="channels"
                    value={c.value}
                    checked={picked.includes(c.value)}
                    onChange={(e) => setPicked(e.target.checked ? [...picked, c.value] : picked.filter((p) => p !== c.value))}
                    className="mt-0.5 size-4 accent-foreground"
                  />
                  <span>
                    {c.label}
                    <span className="block text-xs text-muted-foreground">{c.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="plan-guidance">Guidance (optional)</Label>
            <Textarea id="plan-guidance" name="guidance" rows={2} maxLength={1000} placeholder="e.g. Lead up to the template launch on Thursday. No discounts." />
          </div>
          <p className="text-xs text-muted-foreground">
            About ${usd.toFixed(2)} on {estimate.model} for the plan and {pieces} posts; it counts toward your monthly AI budget.
          </p>
          <DialogFooter>
            <Button type="submit" disabled={pending || picked.length === 0}>
              {pending ? "Starting…" : "Plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlanAgainButton({ planId, disabled }: { planId: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="xs"
      variant="ghost"
      className="ml-auto"
      disabled={pending || disabled}
      onClick={() =>
        window.confirm("Plan again? Its posts that aren't posted yet (and their edits and images) are replaced; posted ones stay.") &&
        startTransition(async () => {
          const { error } = await planAgain(planId);
          if (error) toast.error(error);
          else toast.success("Planning again…");
        })
      }
    >
      <RefreshCwIcon /> Plan again
    </Button>
  );
}
