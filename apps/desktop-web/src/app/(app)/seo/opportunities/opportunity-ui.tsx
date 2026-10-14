"use client";

import { useTransition } from "react";
import { CalendarPlusIcon, CheckIcon, CopyIcon, Loader2Icon, MapIcon, PenSquareIcon, RotateCcwIcon, SparklesIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { ActionResult } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OpportunityDraft } from "@startica/db/schema";
import { cn } from "@/lib/utils";
import { draftFix, setStatus, toContent, toRoadmap, toToday } from "./actions";

export type OpportunityView = {
  key: string;
  area: "search" | "site" | "ai";
  title: string;
  why: string;
  action: string;
  impact: string;
  href: string;
  status: "open" | "done" | "dismissed";
  draftKind: string | null;
  hasBrief: boolean;
  draft: OpportunityDraft | null;
  draftStatus: "drafting" | "ready" | "failed" | null;
  draftError: string | null;
  onRoadmap: boolean;
  onToday: boolean;
  contentPieceId: string | null;
};

const AREA: Record<OpportunityView["area"], string> = { search: "Search", site: "Site health", ai: "AI answers" };
const DRAFT_LABEL: Record<string, string> = {
  meta: "Draft title and description",
  jsonld: "Draft structured data",
  llms_txt: "Draft llms.txt",
  faq: "Draft an FAQ answer",
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

function DraftView({ draft }: { draft: OpportunityDraft }) {
  const copy = () =>
    navigator.clipboard.writeText(draft.text).then(
      () => toast.success("Copied"),
      () => toast.error("Couldn't copy"),
    );
  return (
    <div className="grid gap-2">
      {draft.problems.length > 0 ? (
        <ul className="grid gap-0.5 text-xs text-amber-700 dark:text-amber-400">
          {draft.problems.map((p) => (
            <li key={p} className="flex items-start gap-1">
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {p}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckIcon className="size-3.5" aria-hidden /> Passed Startica&apos;s checks
        </p>
      )}
      {draft.pages && draft.pages.length > 0 && (
        <div className="grid gap-2">
          {draft.pages.map((p) => (
            <div key={p.url} className="grid gap-0.5 rounded-md border p-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{p.url}</span>
              <span className="font-medium text-[#1a0dab] dark:text-[#8ab4f8]">{p.title}</span>
              <span className="text-muted-foreground">{p.description}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {p.title.length}/60 · {p.description.length}/160
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="relative">
        <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{draft.text}</pre>
        <Button size="sm" variant="outline" className="absolute top-2 right-2" onClick={copy}>
          <CopyIcon /> Copy
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Drafted by {draft.model}. Startica doesn&apos;t change your site: review it, then add it where it belongs.</p>
    </div>
  );
}

export function OpportunityCard({ productId, o, aiBlocked }: { productId: string; o: OpportunityView; aiBlocked: string | null }) {
  const [pending, run] = useAction();
  const closed = o.status !== "open";
  const drafting = o.draftStatus === "drafting";
  return (
    <Card id={o.key} className={cn("scroll-mt-20 target:ring-2 target:ring-(--module)", closed && "opacity-70")}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {o.title}
          <Badge variant="outline">{AREA[o.area]}</Badge>
          {o.status === "done" && <Badge variant="secondary">Done</Badge>}
          {o.status === "dismissed" && <Badge variant="secondary">Dismissed</Badge>}
        </CardTitle>
        <CardDescription>{o.why}</CardDescription>
        <CardAction className="text-right text-sm font-medium tabular-nums">{o.impact}</CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p>
          <span className="font-medium">What to do: </span>
          {o.action}{" "}
          <Link href={o.href} className="text-xs underline" target={o.href.startsWith("http") ? "_blank" : undefined}>
            See the evidence
          </Link>
        </p>
        {o.draftStatus === "failed" && o.draftError && <p className="text-xs text-destructive">The draft didn&apos;t finish: {o.draftError}</p>}
        {o.draft && <DraftView draft={o.draft} />}
        <div className="flex flex-wrap items-center gap-1">
          {o.draftKind && !closed && (
            <Button size="sm" variant={o.draft ? "outline" : "default"} disabled={pending || drafting || Boolean(aiBlocked)} title={aiBlocked ?? undefined} onClick={() => run(() => draftFix(productId, o.key), "Drafting…")}>
              {drafting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              {drafting ? "Drafting…" : o.draft ? "Draft again" : DRAFT_LABEL[o.draftKind]}
            </Button>
          )}
          {o.hasBrief && !closed && (
            o.contentPieceId ? (
              <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/content?tab=library" />}>
                <PenSquareIcon /> In Content Studio
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={pending || Boolean(aiBlocked)} title={aiBlocked ?? undefined} onClick={() => run(() => toContent(productId, o.key), "Writing it in Content Studio")}>
                <PenSquareIcon /> Write it in Content Studio
              </Button>
            )
          )}
          {!closed && (
            <>
              <Button size="sm" variant="ghost" disabled={pending || o.onRoadmap} onClick={() => run(() => toRoadmap(productId, o.key), "Added to the Roadmap")}>
                <MapIcon /> {o.onRoadmap ? "On the Roadmap" : "Roadmap"}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending || o.onToday} onClick={() => run(() => toToday(productId, o.key), "Added to Today")}>
                <CalendarPlusIcon /> {o.onToday ? "On Today" : "Today"}
              </Button>
            </>
          )}
          <span className="ml-auto flex gap-1">
            {closed ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setStatus(productId, o.key, "open"))}>
                <RotateCcwIcon /> Reopen
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setStatus(productId, o.key, "done"), "Marked done")}>
                  <CheckIcon /> Done
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setStatus(productId, o.key, "dismissed"))}>
                  <XIcon /> Dismiss
                </Button>
              </>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
