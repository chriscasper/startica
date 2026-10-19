"use client";

import { useTransition } from "react";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setAnalyticsHistory, writeAnalyticsSummary } from "./actions";

export function WriteSummaryButton({ productId, writing, again }: { productId: string; writing: boolean; again: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending || writing}
      onClick={() =>
        startTransition(async () => {
          const { error } = await writeAnalyticsSummary(productId);
          if (error) toast.error(error);
          else toast.success("Writing the summary…");
        })
      }
    >
      <SparklesIcon />
      {writing ? "Writing…" : again ? "Write again" : "Write it now"}
    </Button>
  );
}

/** Settings → Products: how much metric history the product keeps. */
export function HistorySelect({ productId, days, choices }: { productId: string; days: number; choices: readonly { days: number; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span>Keep analytics history for</span>
      <select
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        value={days}
        disabled={pending}
        onChange={(e) => {
          const next = Number(e.target.value);
          startTransition(async () => {
            const { error } = await setAnalyticsHistory(productId, next);
            if (error) toast.error(error);
            else toast.success(next > days ? "Saved: reading the older days now" : "Saved: older days are dropped on the next sync");
          });
        }}
      >
        {choices.map((c) => (
          <option key={c.days} value={c.days}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
