"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckIcon, CircleIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { requestIntelBuild } from "@/app/(app)/intel/actions";
import { scanNow } from "@/app/(app)/inbox/actions";
import { refreshScanActivity, useScanActivity } from "@/components/app/scan-activity";
import { channelLabel } from "@/lib/channels";
import { dismissChecklist, watchSuggested } from "@/lib/setup-actions";

const DOCS = "https://docs.mystartica.com";

export type ChecklistStatus = {
  hasKey: boolean;
  intel: "none" | "building" | "ready" | "failed";
  watching: number;
  scanned: boolean;
  analytics: boolean;
  posted: boolean;
};
export type SuggestionView = { id: string; channel: string; name: string; why: string; preselected: boolean };

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error: string | null }>, success?: string) =>
    start(async () => {
      const { error } = await fn();
      if (error) toast.error(error);
      else if (success) toast.success(success);
    });
  return [pending, run] as const;
}

/** Step 4: intel's suggestions, the strongest few already ticked; one click to start listening. */
function PickCommunities({ productId, suggestions }: { productId: string; suggestions: SuggestionView[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set(suggestions.filter((s) => s.preselected).map((s) => s.id)));
  const [pending, run] = useRun();
  const label = (s: SuggestionView) => (s.channel === "reddit" ? `r/${s.name}` : s.name);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Review suggestions</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Communities to watch</DialogTitle>
          <DialogDescription>
            From intel, strongest first. Startica scans the ones you keep ticked every hour for conversations worth joining. Change them anytime on
            Intel.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-[50vh] gap-2 overflow-y-auto">
          {suggestions.map((s) => (
            <li key={s.id}>
              <label className="flex items-start gap-2 rounded-md border p-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-foreground"
                  checked={picked.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    setPicked(next);
                  }}
                />
                <span className="grid gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {label(s)} <Badge variant="outline">{channelLabel(s.channel)}</Badge>
                  </span>
                  {s.why && <span className="text-muted-foreground">{s.why}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            disabled={pending || picked.size === 0}
            onClick={() =>
              run(async () => {
                const result = await watchSuggested(productId, [...picked]);
                if (!result.error) setOpen(false);
                return result;
              }, "Watching them. The first scan is running.")
            }
          >
            {pending && <Loader2Icon className="animate-spin" />} Watch {picked.size} {picked.size === 1 ? "community" : "communities"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Item = { done: boolean; title: string; detail: string; action?: React.ReactNode; optional?: boolean };

/** The rest of setup, after the welcome wizard. Hides itself once everything is done. */
export function GettingStarted({ productId, status, suggestions }: { productId: string; status: ChecklistStatus; suggestions: SuggestionView[] }) {
  const [pending, run] = useRun();
  const { scan } = useScanActivity(productId);
  const items: Item[] = [
    {
      done: status.hasKey,
      title: "Connect AI",
      detail: "A Claude or OpenAI API key powers intel, scoring and drafts.",
      action: (
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/settings" />}>
          Add key
        </Button>
      ),
    },
    {
      done: status.intel === "ready",
      title: "Build intel",
      detail:
        status.intel === "building"
          ? "Researching your product (3–4 minutes)…"
          : status.intel === "failed"
            ? "The last build didn't finish."
            : "A brief, personas, keywords and suggested communities, from your site and the market.",
      action:
        status.intel === "building" ? (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <Button size="sm" variant="outline" disabled={pending || !status.hasKey} onClick={() => run(() => requestIntelBuild(productId), "Building intel…")}>
            {status.intel === "failed" ? "Retry" : "Build intel"}
          </Button>
        ),
    },
    {
      done: status.watching > 0,
      title: "Pick communities to watch",
      detail: status.intel === "ready" ? "Startica picked the strongest suggestions; check them and start listening." : "Available once intel is ready.",
      action: status.intel === "ready" && suggestions.length > 0 ? <PickCommunities productId={productId} suggestions={suggestions} /> : (
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/intel" />}>
          Open Intel
        </Button>
      ),
    },
    {
      done: status.scanned,
      title: "Run a first scan",
      detail: "Finds conversations to reply to (it also runs every hour on its own).",
      action: (
        <Button
          size="sm"
          variant="outline"
          disabled={pending || Boolean(scan) || (status.watching === 0 && status.intel !== "ready")}
          onClick={() => run(() => scanNow(productId).finally(refreshScanActivity), "Scan started. Follow it at the top of the window.")}
        >
          {scan && <Loader2Icon className="animate-spin" />}
          {scan ? (scan.running ? "Scanning…" : "Scan queued") : "Scan now"}
        </Button>
      ),
    },
    {
      done: status.analytics,
      optional: true,
      title: "Connect analytics (optional)",
      detail: "Google Analytics, Stripe or your product's database, to see what your posts bring in.",
      action: (
        <span className="flex gap-1">
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/settings?tab=products" />}>
            Settings
          </Button>
          <Button size="sm" variant="ghost" nativeButton={false} render={<a href={`${DOCS}/credentials/`} target="_blank" rel="noreferrer" />}>
            Guides
          </Button>
        </span>
      ),
    },
    {
      done: status.posted,
      title: "Post your first reply",
      detail: "Review a draft in the Inbox and post it (Post… fills it in on the site; you press its button).",
      action: (
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/inbox" />}>
          Open Inbox
        </Button>
      ),
    },
  ];
  const required = items.filter((i) => !i.optional);
  const doneCount = required.filter((i) => i.done).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Getting started</CardTitle>
        <CardDescription>
          {doneCount} of {required.length} done (analytics is optional).{" "}
          <a className="underline" href={`${DOCS}/getting-started/first-day/`} target="_blank" rel="noreferrer">
            Your first day with Startica
          </a>
        </CardDescription>
        <CardAction>
          <Button size="icon-sm" variant="ghost" aria-label="Hide the checklist" disabled={pending} onClick={() => run(dismissChecklist)}>
            <XIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3">
          {items.map((item) => (
            <li key={item.title} className="flex items-center gap-3">
              {item.done ? <CheckIcon className="size-5 shrink-0 text-foreground" aria-label="Done" /> : <CircleIcon className="size-5 shrink-0 text-muted-foreground" aria-label="To do" />}
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className={`text-sm font-medium ${item.done ? "text-muted-foreground line-through" : ""}`}>{item.title}</span>
                {!item.done && <span className="text-xs text-muted-foreground">{item.detail}</span>}
              </div>
              {!item.done && item.action}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
