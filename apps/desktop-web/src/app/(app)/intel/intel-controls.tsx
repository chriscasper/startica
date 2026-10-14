"use client";

import { useTransition } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { requestIntelBuild, saveOwnerNotes } from "./actions";

export type IntelStatus = "none" | "queued" | "crawling" | "researching" | "writing" | "ready" | "failed";

const steps: Record<IntelStatus, string> = {
  none: "Not built yet",
  queued: "Queued, waiting for the worker",
  crawling: "Step 1 of 3: reading the product's website",
  researching: "Step 2 of 3: researching competitors and communities (a few minutes)",
  writing: "Step 3 of 3: writing the brief, personas and lists",
  ready: "Ready",
  failed: "Failed",
};

const running = (status: IntelStatus) => ["queued", "crawling", "researching", "writing"].includes(status);

export function BuildControls({
  productId,
  status,
  error,
  updatedAt,
}: {
  productId: string;
  status: IntelStatus;
  error: string | null;
  updatedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const busy = running(status);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={pending || busy}
          onClick={() =>
            startTransition(async () => {
              const result = await requestIntelBuild(productId);
              if (result.error) toast.error(result.error);
            })
          }
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          {status === "none" ? "Build intel" : busy ? "Building…" : "Rebuild intel"}
        </Button>
        <Badge variant={status === "failed" ? "destructive" : status === "ready" ? "secondary" : "outline"}>
          {steps[status]}
        </Badge>
        {updatedAt && !busy && (
          <span className="text-xs text-muted-foreground">
            Updated {new Date(updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        )}
      </div>
      {status === "failed" && error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Uses your strategy model with web search. A build typically costs well under $1; see System for exact costs. Rebuilds
        replace AI-written items and keep anything you added, edited, watched or ignored.
      </p>
    </div>
  );
}

export function OwnerNotesForm({ productId, notes }: { productId: string; notes: string | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const { error } = await saveOwnerNotes(productId, fd);
          if (error) toast.error(error);
          else toast.success("Notes saved. They're used on the next build.");
        })
      }
      className="grid gap-2"
    >
      <Textarea
        name="owner_notes"
        rows={5}
        defaultValue={notes ?? ""}
        placeholder="What should Startica know that the website doesn't say? Who it's really for, what makes it different, current numbers, what you've tried, communities you already know…"
      />
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save notes"}
        </Button>
      </div>
    </form>
  );
}
