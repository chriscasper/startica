"use client";

import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import type { BackgroundTask } from "@startica/core/jobs/background";
import { channelLabel } from "@/lib/channels";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { StopButton, useNow, useScanActivity } from "./scan-activity";

// Longer notes for the slow ones, so a 15-minute scan doesn't look stuck.
const NOTES: Record<string, string> = {
  listen_scan: "Reddit allows about one request a minute, so a full scan can take up to 15 minutes. New conversations appear in the Inbox as they're scored.",
  site_scan: "Pages are checked one a second, two at a time. Results appear under Accessibility as each page is checked.",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The task's name in words, with what it's on: "Scoring 12 conversations", "Finding conversations on Reddit". */
export function taskTitle(t: BackgroundTask): string {
  if (t.queue === "opportunity_score" && t.items) return `Scoring ${plural(t.items, "conversation", "conversations")}`;
  if (t.queue === "draft_generate") return `Drafting ${plural(t.count, "reply", "replies")}`;
  if (t.queue === "ad_creative_render" && t.count > 1) return `Rendering ${t.count} creatives`;
  if (t.progress?.channel) return `${t.label} on ${channelLabel(t.progress.channel)}`;
  return t.label;
}

/** Where it is: "Running 4 min · 3 of 40 pages", "Waiting", "Stopping…". */
export function taskState(t: BackgroundTask, now: number): string {
  if (t.status === "stopping") return "Stopping…";
  const minutes = now ? Math.max(0, Math.floor((now - t.since) / 60_000)) : 0;
  const pages = t.progress?.pagesTotal ? ` · ${t.progress.pagesDone ?? 0} of ${plural(t.progress.pagesTotal, "page", "pages")}` : "";
  if (t.status === "waiting") return `Waiting${minutes >= 1 ? ` ${minutes} min` : ""}${pages}`;
  return `Running${minutes >= 1 ? ` ${minutes} min` : ""}${pages}`;
}

function TaskRow({ task, now }: { task: BackgroundTask; now: number }) {
  const title = taskTitle(task);
  return (
    <li className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium">
          {task.href ? (
            <Link href={task.href} className="hover:underline">
              {title}
            </Link>
          ) : (
            title
          )}
          {task.subject && <span className="font-normal text-muted-foreground"> · {task.subject}</span>}
        </p>
        <p className="text-xs text-muted-foreground">{taskState(task, now)}</p>
        <p className="text-xs text-muted-foreground">{task.why}</p>
        {NOTES[task.queue] && task.status === "running" && <p className="text-xs text-muted-foreground">{NOTES[task.queue]}</p>}
      </div>
      {task.status !== "stopping" && (
        <div className="shrink-0">
          <StopButton target={task.stop} label={`Stop ${title.charAt(0).toLowerCase()}${title.slice(1)}`} compact />
        </div>
      )}
    </li>
  );
}

/**
 * Top-right status indicator: shown while anything runs in the background. Hover (or
 * click, or focus and Enter) to see each task, why it's running, and to stop it.
 */
export function BackgroundActivity({ productId }: { productId: string | null }) {
  const { tasks } = useScanActivity(productId);
  const now = useNow(tasks.length > 0);
  if (tasks.length === 0) return null;
  const lead = tasks[0]!;
  const running = tasks.filter((t) => t.status !== "waiting").length;
  const headline = `${taskTitle(lead)}${lead.status === "running" ? "…" : lead.status === "waiting" ? ": waiting" : ": stopping"}`;
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={100}
        closeDelay={250}
        className="ml-auto inline-flex max-w-[60vw] items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:text-foreground"
      >
        <Loader2Icon className="size-3.5 shrink-0 animate-spin" aria-hidden />
        <span className="truncate" aria-live="polite">
          {headline}
        </span>
        {tasks.length > 1 && (
          <span className="shrink-0 rounded-full bg-background px-1.5 py-px tabular-nums ring-1 ring-border">
            +{tasks.length - 1}
            <span className="sr-only"> more</span>
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <div className="mb-3 space-y-0.5">
          <PopoverTitle>Running in the background</PopoverTitle>
          <PopoverDescription>
            {plural(running, "task", "tasks")} running{tasks.length > running ? `, ${tasks.length - running} waiting` : ""}. Stopping keeps anything already finished.
          </PopoverDescription>
        </div>
        <ul className="max-h-[60vh] divide-y overflow-y-auto">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} now={now} />
          ))}
        </ul>
        <Link href="/system" className="mt-3 block border-t pt-2 text-xs text-muted-foreground hover:text-foreground hover:underline">
          Job history on the System page
        </Link>
      </PopoverContent>
    </Popover>
  );
}
