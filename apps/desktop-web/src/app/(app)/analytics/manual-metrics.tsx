"use client";

import { useTransition } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import { addManualMetric, deleteManualMetric } from "./actions";

export type ManualRow = { id: string; day: string; metric: string; value: number };

export function AddManualMetric({ productId, today }: { productId: string; today: string }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          <PlusIcon />
          Add a number
        </Button>
      }
      title="Record a number"
      description="For anything Startica can't read yet, e.g. waitlist signups or newsletter subscribers. Same day and metric replaces the earlier value."
      fields={[
        { name: "day", label: "Date", type: "date", required: true },
        { name: "metric", label: "Metric", type: "text", required: true, placeholder: "waitlist_signups" },
        { name: "value", label: "Value", type: "number", required: true },
      ]}
      values={{ day: today }}
      action={(fd) => addManualMetric(productId, fd)}
    />
  );
}

export function DeleteManualMetric({ row }: { row: ManualRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Delete ${row.metric} on ${row.day}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const { error } = await deleteManualMetric(row.id);
          if (error) toast.error(error);
        })
      }
    >
      <Trash2Icon />
    </Button>
  );
}
