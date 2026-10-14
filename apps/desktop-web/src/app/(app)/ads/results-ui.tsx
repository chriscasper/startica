"use client";

import { useTransition } from "react";
import { CalendarCheckIcon, MapIcon, PencilIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type ActionResult } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import { newSpend, removeSpend, rewriteFromSuggestion, saveTarget, suggestionRoadmap, suggestionToday } from "./actions";

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

export function AddSpendButton({ campaignId, ads, today, weekAgo }: { campaignId: string; ads: { id: string; label: string }[]; today: string; weekAgo: string }) {
  return (
    <FormDialog
      trigger={
        <Button>
          <PlusIcon /> Enter spend
        </Button>
      }
      title="Enter spend"
      description="Copy what the ad manager reports for a range of days. Per ad gives a cost per result for each ad; the whole campaign gives the total only."
      fields={[
        { name: "ad_id", label: "For", type: "select", options: [{ value: "", label: "The whole campaign" }, ...ads.map((a) => ({ value: a.id, label: a.label }))] },
        { name: "start_day", label: "First day", type: "date", required: true },
        { name: "end_day", label: "Last day", type: "date", required: true },
        { name: "amount", label: "Amount spent", type: "number", required: true, hint: "In your ad account's currency." },
        { name: "clicks", label: "Clicks (optional)", type: "number", hint: "With impressions, shows whether people click." },
        { name: "impressions", label: "Impressions (optional)", type: "number" },
      ]}
      values={{ start_day: weekAgo, end_day: today }}
      submitLabel="Add"
      action={(fd) => newSpend(campaignId, fd)}
    />
  );
}

export function RemoveSpendButton({ spendId }: { spendId: string }) {
  const [pending, run] = useAction();
  return (
    <Button size="icon-sm" variant="ghost" aria-label="Delete this spend" disabled={pending} onClick={() => confirm("Delete this spend entry?") && run(() => removeSpend(spendId))}>
      <Trash2Icon />
    </Button>
  );
}

export function TargetButton({ campaignId, value }: { campaignId: string; value: number | null }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          <PencilIcon /> {value ? "Change target" : "Set a target"}
        </Button>
      }
      title="Target cost per result"
      description="What one result (a signup, a trial, a sale) may cost to be worth it. Ads well under it get Scale; well over it, Stop. Leave it empty to compare ads with each other."
      fields={[{ name: "target_cost", label: "Target cost per result", type: "number", placeholder: "e.g. 25" }]}
      values={{ target_cost: value ? String(value) : "" }}
      action={(fd) => saveTarget(campaignId, fd)}
    />
  );
}

export function SuggestionButtons({ campaignId, adId, verdict }: { campaignId: string; adId: string; verdict: string }) {
  const [pending, run] = useAction();
  return (
    <div className="flex flex-wrap gap-1">
      {verdict === "rewrite" && (
        <Button size="sm" disabled={pending} onClick={() => run(() => rewriteFromSuggestion(campaignId, adId), "Rewriting the ad: see Plan and ads")}>
          <SparklesIcon /> Rewrite with AI
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => suggestionToday(campaignId, adId), "Added to Today")}>
        <CalendarCheckIcon /> Today
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => suggestionRoadmap(campaignId, adId), "Added to the Roadmap")}>
        <MapIcon /> Roadmap
      </Button>
    </div>
  );
}
