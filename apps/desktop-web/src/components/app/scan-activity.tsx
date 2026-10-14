"use client";

import { useCallback, useSyncExternalStore, useTransition } from "react";
import { SquareIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { ScanActivity } from "@startica/core/jobs/activity";
import type { BackgroundTask } from "@startica/core/jobs/background";
import { Button } from "@/components/ui/button";
import { stopJobAction, stopJobsAction, stopSiteScanAction } from "@/lib/job-actions";

/** A product's scans, plus every background job in the workspace (the header's status indicator). */
export type Activity = ScanActivity & { tasks: BackgroundTask[] };

const IDLE: Activity = { scan: null, scoring: 0, drafting: 0, siteScan: null, tasks: [] };
const WATCHED = new Set(["jobs", "job_runs", "site_scans", "site_pages"]);
const TICK_MS = 30_000; // refreshes "4 min" while something is running

// One shared store per page: every indicator and Scan button for a product reads
// the same snapshot, fed by a single /api/events stream. Keyed by product id ("" for none).
const snapshots = new Map<string, Activity>();
const subscribers = new Map<string, Set<() => void>>();
let source: EventSource | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
let tick: ReturnType<typeof setInterval> | null = null;

async function load(productId: string) {
  try {
    const response = await fetch(productId ? `/api/activity?productId=${encodeURIComponent(productId)}` : "/api/activity", { cache: "no-store" });
    if (!response.ok) return;
    snapshots.set(productId, (await response.json()) as Activity);
  } catch {
    return; // the server restarting; the next event or tick retries
  }
  for (const notify of subscribers.get(productId) ?? []) notify();
  const busy = [...snapshots.values()].some((a) => a.scan || a.scoring || a.drafting || a.siteScan || a.tasks.length > 0);
  if (busy && !tick) tick = setInterval(reloadAll, TICK_MS);
  if (!busy && tick) {
    clearInterval(tick);
    tick = null;
  }
}

function reloadAll() {
  for (const productId of subscribers.keys()) void load(productId);
}

function subscribe(productId: string, notify: () => void) {
  const set = subscribers.get(productId) ?? new Set();
  subscribers.set(productId, set);
  set.add(notify);
  if (set.size === 1) void load(productId);
  if (!source) {
    source = new EventSource("/api/events");
    source.onmessage = (message) => {
      const { table } = JSON.parse(message.data) as { table: string };
      if (!WATCHED.has(table)) return;
      reloadTimer ??= setTimeout(() => {
        reloadTimer = null;
        reloadAll();
      }, 300);
    };
  }
  return () => {
    set.delete(notify);
    if (set.size === 0) {
      subscribers.delete(productId);
      snapshots.delete(productId);
    }
    if (subscribers.size === 0) {
      source?.close();
      source = null;
      if (tick) clearInterval(tick);
      tick = null;
    }
  };
}

/** Live scan state for a product (whether a scan is running, what's waiting to be scored or drafted) and every background task. */
export function useScanActivity(productId: string | null): Activity {
  const key = productId ?? "";
  const subscribeTo = useCallback((notify: () => void) => subscribe(key, notify), [key]);
  return useSyncExternalStore(subscribeTo, () => snapshots.get(key) ?? IDLE, () => IDLE);
}

/** Asks for a fresh snapshot now (after enqueueing a scan), instead of waiting for the event. */
export function refreshScanActivity() {
  reloadAll();
}


export function useNow(active: boolean) {
  const subscribeToClock = useCallback(
    (notify: () => void) => {
      if (!active) return () => {};
      const timer = setInterval(notify, TICK_MS);
      return () => clearInterval(timer);
    },
    [active],
  );
  const now = useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / 1000) * 1000, // stable within a render
    () => 0,
  );
  return now;
}

/** Stops a job or an accessibility scan (results so far are kept). */
export function StopButton({ target, label = "Stop", compact = false }: { target: { job: string } | { jobIds: string[] } | { siteScan: string }; label?: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const stop = () =>
    start(async () => {
      const { error } = "job" in target ? await stopJobAction(target.job) : "jobIds" in target ? await stopJobsAction(target.jobIds) : await stopSiteScanAction(target.siteScan);
      refreshScanActivity();
      if (error) toast.error(error);
      else toast.success("Stopping… anything already finished is kept.");
    });
  if (compact) {
    return (
      <button
        type="button"
        onClick={stop}
        disabled={pending}
        aria-label={label}
        title={label}
        className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
      >
        <XIcon className="size-3.5" aria-hidden />
      </button>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={stop} disabled={pending}>
      <SquareIcon />
      {label}
    </Button>
  );
}
