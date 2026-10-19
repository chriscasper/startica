"use client";

import { useOptimistic, useTransition } from "react";
import { PauseIcon, PlayIcon, RadarIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { pauseChannel, pauseListening } from "./actions";

export type ListeningView = {
  paused: boolean;
  /** When a timed pause ends (ISO), or null. */
  until: string | null;
  sources: { channel: string; label: string; paused: boolean; note?: string }[];
};

const untilText = (until: string | null) =>
  until ? `until ${new Date(until).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "until you resume it";

/** The Inbox's Searching control: pause the hourly search, or turn single sources off. */
export function ListeningControl({ productId, state }: { productId: string; state: ListeningView }) {
  const [pending, startTransition] = useTransition();
  // Ticks change at once; the server's answer replaces them when the page refreshes.
  const [sources, setSource] = useOptimistic(state.sources, (current, change: { channel: string; paused: boolean }) =>
    current.map((s) => (s.channel === change.channel ? { ...s, paused: change.paused } : s)),
  );
  const run = (fn: () => Promise<{ error: string | null }>, ok: string, before?: () => void) =>
    startTransition(async () => {
      before?.();
      const { error } = await fn();
      if (error) toast.error(error);
      else toast.success(ok);
    });
  const off = sources.filter((s) => s.paused);
  const label = state.paused ? "Search paused" : off.length === sources.length ? "All sources off" : off.length ? `Searching, ${off.length} off` : "Searching hourly";

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        {state.paused ? <PauseIcon /> : <RadarIcon />}
        {label}
      </PopoverTrigger>
      <PopoverContent className="grid w-88 gap-3">
        <div className="grid gap-1">
          <PopoverTitle>Hourly search</PopoverTitle>
          <PopoverDescription>
            {state.paused
              ? `Paused ${untilText(state.until)}. Scan now still searches once.`
              : "While Startica is open it looks for new conversations every hour, on the sources ticked below."}
          </PopoverDescription>
        </div>
        {state.paused ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => pauseListening(productId, "resume"), "Hourly search is back on")}>
            <PlayIcon />
            Resume
          </Button>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => pauseListening(productId, "day"), "Paused for a day")}>
              Pause for a day
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => pauseListening(productId, "week"), "Paused for a week")}>
              For a week
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => pauseListening(productId, "forever"), "Paused until you resume it")}>
              Until I resume
            </Button>
          </div>
        )}
        <fieldset className="grid gap-1.5 border-t pt-3">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Search on</legend>
          {sources.map((s) => (
            <label key={s.channel} className="flex items-baseline gap-2">
              <input
                type="checkbox"
                className="translate-y-0.5 accent-(--primary)"
                checked={!s.paused}
                onChange={(e) => {
                  const on = e.target.checked;
                  run(() => pauseChannel(productId, s.channel, !on), on ? `${s.label} is searched again` : `${s.label} is off`, () => setSource({ channel: s.channel, paused: !on }));
                }}
              />
              <span>
                {s.label}
                {s.note && <span className="ml-1.5 text-xs text-muted-foreground">{s.note}</span>}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-muted-foreground">Sources you turn off are skipped by Scan now too. Pasted links, drafts and the reply checks on what you posted keep working.</p>
      </PopoverContent>
    </Popover>
  );
}
