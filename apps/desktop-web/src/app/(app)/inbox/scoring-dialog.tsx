"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, SlidersHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveThresholds } from "./actions";

export type ScoringSettings = {
  relevance: number;
  intent: number;
  /** Scores of the last 7 days' archived conversations, for the live preview. */
  archived: { relevance: number; intent: number }[];
  maxRedrafts: number;
};

const DRAFT_COST_USD = 0.01; // about one Sonnet draft

function relevanceMeaning(value: number) {
  if (value >= 0.7) return "On topic only: conversations about the problem your product solves.";
  if (value >= 0.5) return "Also nearby: your audience talking about a related problem.";
  if (value >= 0.3) return "Loose: anything your audience talks about. Expect many off-topic drafts.";
  return "Almost everything: most keyword matches are noise.";
}

function intentMeaning(value: number) {
  if (value >= 0.7) return "Only people asking for a tool, a recommendation or an alternative.";
  if (value >= 0.5) return "Also people asking for help or complaining about the problem.";
  if (value >= 0.3) return "Also general discussion where a reply could still be welcome.";
  return "Almost everything, including news and announcements.";
}

function Slider(props: { id: string; label: string; value: number; onChange: (v: number) => void; meaning: string }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={props.id} className="text-sm font-medium">
          {props.label}
        </label>
        <span className="text-sm tabular-nums">at least {Math.round(props.value * 100)}%</span>
      </div>
      <input
        id={props.id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(props.value * 100)}
        onChange={(e) => props.onChange(Number(e.target.value) / 100)}
        className="w-full accent-primary"
      />
      <p className="text-xs text-muted-foreground">{props.meaning}</p>
    </div>
  );
}

/** Inbox → Scoring: how relevant and how actively-asking a conversation must be to get a draft. */
export function ScoringDialog({ productId, settings }: { productId: string; settings: ScoringSettings }) {
  const [open, setOpen] = useState(false);
  const [relevance, setRelevance] = useState(settings.relevance);
  const [intent, setIntent] = useState(settings.intent);
  const [draftPassing, setDraftPassing] = useState(true);
  const [pending, startTransition] = useTransition();

  const passing = settings.archived.filter((s) => s.relevance >= relevance - 1e-9 && s.intent >= intent - 1e-9).length;
  const toDraft = Math.min(passing, settings.maxRedrafts);

  const reset = (next: boolean) => {
    if (next) {
      setRelevance(settings.relevance);
      setIntent(settings.intent);
      setDraftPassing(true);
    }
    setOpen(next);
  };

  const save = () =>
    startTransition(async () => {
      const { error, queued } = await saveThresholds(productId, { relevance, intent, draftPassing: draftPassing && passing > 0 });
      if (error) return void toast.error(error);
      toast.success(queued > 0 ? `Saved. Drafting replies for ${queued} archived conversation${queued === 1 ? "" : "s"}.` : "Saved. New conversations are scored against these settings.");
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <SlidersHorizontalIcon />
            Scoring
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What gets a draft</DialogTitle>
          <DialogDescription>
            The AI scores every conversation Startica finds. Ones that reach both minimums get a reply drafted; the rest go to Archived, where you can still
            draft one by hand.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <Slider id="relevance" label="Relevance" value={relevance} onChange={setRelevance} meaning={relevanceMeaning(relevance)} />
          <Slider id="intent" label="Intent" value={intent} onChange={setIntent} meaning={intentMeaning(intent)} />
          <div className="rounded-md border p-3 text-sm">
            {settings.archived.length === 0 ? (
              <p className="text-muted-foreground">No archived conversations from the last 7 days to compare against yet.</p>
            ) : (
              <>
                <p>
                  <span className="font-medium tabular-nums">{passing}</span> of the {settings.archived.length} conversations archived in the last 7 days
                  would pass.
                </p>
                {passing > 0 && (
                  <label className="mt-2 flex items-start gap-2">
                    <input type="checkbox" className="mt-0.5" checked={draftPassing} onChange={(e) => setDraftPassing(e.target.checked)} />
                    <span>
                      Draft replies for {passing > toDraft ? `the best ${toDraft}` : toDraft === 1 ? "it" : `those ${toDraft}`} now (about $
                      {(toDraft * DRAFT_COST_USD).toFixed(2)})
                    </span>
                  </label>
                )}
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => reset(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
