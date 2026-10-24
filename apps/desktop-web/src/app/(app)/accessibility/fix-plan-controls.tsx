"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PLAN_MAX_ISSUES, planCostHint } from "@startica/core/a11y/fix-plan-limits";
import { FormDialog } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { removeFixPlan, rewriteFixPlan, writeFixPlan } from "./actions";

/**
 * Picking issues on the Issues list for one fix plan (ARCHITECTURE.md section 9.4): a box on
 * each open issue, one for everything listed, and a bar that writes the plan.
 */

type Selection = { ids: string[]; selected: Set<string>; toggle: (id: string) => void; setAll: (on: boolean) => void };
const SelectionContext = createContext<Selection | null>(null);

function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("Inside PlanSelection only");
  return ctx;
}

/** Wraps the list; `ids` are the open issues shown, most important first. */
export function PlanSelection({ siteId, ids, unavailable, children }: { siteId: string; ids: string[]; unavailable: string | null; children: React.ReactNode }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Only what's still listed counts (filters change, issues get fixed).
  const selected = new Set(ids.filter((id) => picked.has(id)));
  const toggle = (id: string) =>
    setPicked(() => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else if (next.size < PLAN_MAX_ISSUES) next.add(id);
      else toast.error(`One plan covers up to ${PLAN_MAX_ISSUES} issues`);
      return next;
    });
  const setAll = (on: boolean) => {
    if (on && ids.length > PLAN_MAX_ISSUES) toast.info(`Picked the top ${PLAN_MAX_ISSUES}: one plan covers up to ${PLAN_MAX_ISSUES} issues`);
    setPicked(new Set(on ? ids.slice(0, PLAN_MAX_ISSUES) : []));
  };
  return (
    <SelectionContext.Provider value={{ ids, selected, toggle, setAll }}>
      {children}
      <PlanBar siteId={siteId} unavailable={unavailable} />
    </SelectionContext.Provider>
  );
}

export function SelectAllBox() {
  const { ids, selected, setAll } = useSelection();
  const all = selected.size > 0 && selected.size === Math.min(ids.length, PLAN_MAX_ISSUES);
  return (
    <input
      type="checkbox"
      aria-label={ids.length > PLAN_MAX_ISSUES ? `Pick the top ${PLAN_MAX_ISSUES} issues` : "Pick every issue listed"}
      checked={all}
      ref={(el) => {
        if (el) el.indeterminate = selected.size > 0 && !all;
      }}
      onChange={() => setAll(!all)}
      className="size-4 accent-foreground"
    />
  );
}

export function SelectBox({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection();
  return <input type="checkbox" aria-label={`Pick “${label}”`} checked={selected.has(id)} onChange={() => toggle(id)} className="size-4 accent-foreground" />;
}

function PlanBar({ siteId, unavailable }: { siteId: string; unavailable: string | null }) {
  const { ids, selected, setAll } = useSelection();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [pending, start] = useTransition();
  const n = selected.size;
  if (n === 0) return null;
  const write = () =>
    start(async () => {
      // In list order, so the plan numbers them the way the owner saw them.
      const { error, planId } = await writeFixPlan(
        siteId,
        ids.filter((id) => selected.has(id)),
        guidance,
      );
      if (error || !planId) return void toast.error(error ?? "Couldn't start the plan");
      setOpen(false);
      setAll(false);
      setGuidance("");
      router.push(`/accessibility/fix-plans/${planId}`);
    });
  return (
    <div role="region" aria-label="Fix plan" className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-popover p-3 text-sm shadow-md">
      <span className="font-medium">
        {n} {n === 1 ? "issue" : "issues"} picked
      </span>
      <Button size="sm" variant="ghost" onClick={() => setAll(false)}>
        Clear
      </Button>
      <div className="ml-auto flex items-center gap-3">
        {unavailable && <span className="text-xs text-muted-foreground">{unavailable}</span>}
        <Button size="sm" disabled={Boolean(unavailable)} onClick={() => setOpen(true)}>
          Write one fix plan ({planCostHint(n)})
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write one fix plan</DialogTitle>
            <DialogDescription>
              Your AI key reads the failing HTML of the {n} {n === 1 ? "issue" : "issues"} you picked and writes one short task list covering all of them, ready to paste into your
              coding agent. Nothing is changed on your site. {planCostHint(n)}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="plan-guidance">Guidance (optional)</Label>
            <Textarea
              id="plan-guidance"
              rows={3}
              maxLength={500}
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="e.g. Next.js with Tailwind; the header is components/Header.tsx"
            />
          </div>
          <DialogFooter>
            <Button onClick={write} disabled={pending}>
              {pending ? "Starting…" : "Write the plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** On a plan: write it again (with guidance) or delete it. */
export function RewritePlanButton({ planId, disabled }: { planId: string; disabled: boolean }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline" disabled={disabled}>
          Write again
        </Button>
      }
      title="Write the plan again"
      description="Same issues. Optionally tell it more: your framework, where components live, or what was wrong with this plan."
      fields={[{ name: "guidance", label: "Guidance (optional)", type: "textarea", rows: 3, placeholder: "e.g. We use React; forms are in components/forms/" }]}
      submitLabel="Write again"
      action={(fd) => rewriteFixPlan(planId, fd)}
    />
  );
}

export function DeletePlanButton({ planId, siteId }: { planId: string; siteId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!window.confirm("Delete this fix plan?")) return;
          const { error } = await removeFixPlan(planId);
          if (error) return void toast.error(error);
          router.push(`/accessibility/fix-plans?site=${siteId}`);
        })
      }
    >
      Delete
    </Button>
  );
}
