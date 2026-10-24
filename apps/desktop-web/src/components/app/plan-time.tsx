"use client";

import { useState, useTransition } from "react";
import { CalendarClockIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { setPlannedTime } from "@/app/(app)/content/calendar/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The best-time hint for an item's channel or community, and the next good time (ms) if there is one. */
export type PlanHint = { text: string; next: number | null };

/** A time as the value of a datetime-local input (local time). */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const plannedLabel = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Plan (or move, or clear) when a Content Studio piece or a drafted Inbox reply goes out. Startica
 * reminds you when it's due and opens it; you still press Post… and the site's own button.
 */
export function PlanTimeButton({ kind, id, plannedAt, hint }: { kind: "piece" | "reply"; id: string; plannedAt: number | null; hint: PlanHint | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(plannedAt ? toLocalInput(plannedAt) : "");
  const [pending, startTransition] = useTransition();

  const save = (v: string, ok: string) =>
    startTransition(async () => {
      const { error } = await setPlannedTime(kind, id, v);
      if (error) return void toast.error(error);
      setOpen(false);
      toast.success(ok);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(plannedAt ? toLocalInput(plannedAt) : "");
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost">
            <CalendarClockIcon /> {plannedAt ? plannedLabel(plannedAt) : "Plan"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plannedAt ? "Move or clear the planned time" : "Plan when to post"}</DialogTitle>
          <DialogDescription>Startica reminds you when it&apos;s due (a notification and a Today move) and opens it. You still press Post… and the site&apos;s own button.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`plan-${id}`}>Date and time</Label>
            <Input id={`plan-${id}`} type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          {hint && <p className="text-xs text-muted-foreground">{hint.text}</p>}
          {hint?.next && (
            <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => setValue(toLocalInput(hint.next!))}>
              <SparklesIcon /> Next good time: {plannedLabel(hint.next)}
            </Button>
          )}
        </div>
        <DialogFooter>
          {plannedAt && (
            <Button variant="ghost" disabled={pending} onClick={() => save("", "Taken off the calendar")}>
              Clear
            </Button>
          )}
          <Button disabled={pending || !value} onClick={() => save(new Date(value).toISOString(), "Planned")}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
