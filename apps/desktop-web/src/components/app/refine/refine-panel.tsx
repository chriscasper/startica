"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { ArrowLeftIcon, ArrowUpIcon, CheckIcon, GlobeIcon, Loader2Icon, MessageSquareTextIcon, RotateCcwIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import type { ChatMessageView, ChatSnapshot } from "@startica/core/chat/threads";
import type { ChatSubjectKind } from "@startica/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { applyRefineRevision, retryRefineReply, sendRefineMessage, setRefineWebSearch, startRefineOver, stopRefineReply } from "./actions";
import { ChatText } from "./chat-text";
import { RevisionView } from "./revision-view";

/**
 * Refine (ARCHITECTURE.md section 5.1): a chat beside the page about one suggestion. The panel
 * reads the chat from /api/chat and reads it again when /api/events reports a change, so the
 * reply appears as the chat_reply job writes it. A reply that changes the suggestion carries a
 * revision with Apply; applying it ends the chat.
 */

const STARTERS: Record<ChatSubjectKind, string[]> = {
  security_help: ["Why does this matter for my site?", "Make the steps shorter", "We host on a different platform: here's what we use…", "Will this break anything?"],
  a11y_fix: ["Who does this affect, and how?", "It's a React component: show the JSX", "Explain the fix more simply", "What should the alt text say?"],
};

const WATCHED = new Set(["chat_messages", "chat_threads", "ai_runs"]);

export function RefineButton({ kind, subjectId, disabled }: { kind: ChatSubjectKind; subjectId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen} modal={false} disablePointerDismissal>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        <MessageSquareTextIcon />
        Refine
      </Button>
      <SheetContent showOverlay={false} className="w-full gap-0 data-[side=right]:sm:max-w-lg">
        {open && <RefineChat kind={kind} subjectId={subjectId} />}
      </SheetContent>
    </Sheet>
  );
}

type Loaded = { snapshot?: ChatSnapshot; error?: string };

async function fetchChat(kind: ChatSubjectKind, subjectId: string): Promise<Loaded> {
  try {
    const data = (await (await fetch(`/api/chat?kind=${kind}&id=${encodeURIComponent(subjectId)}`, { cache: "no-store" })).json()) as ChatSnapshot & { error?: string };
    return data.error ? { error: data.error } : { snapshot: data };
  } catch {
    return { error: "Couldn't load the chat" };
  }
}

function useChat(kind: ChatSubjectKind, subjectId: string) {
  const [state, setState] = useState<{ snapshot: ChatSnapshot | null; error: string | null }>({ snapshot: null, error: null });
  const apply = useCallback((loaded: Loaded) => setState((prev) => (loaded.snapshot ? { snapshot: loaded.snapshot, error: null } : { snapshot: prev.snapshot, error: loaded.error ?? null })), []);
  const load = useCallback(() => fetchChat(kind, subjectId).then(apply), [kind, subjectId, apply]);

  useEffect(() => {
    let live = true;
    const refresh = () => fetchChat(kind, subjectId).then((loaded) => live && apply(loaded));
    void refresh();
    const source = new EventSource("/api/events");
    let timer: ReturnType<typeof setTimeout> | null = null;
    source.onmessage = (message) => {
      const { table } = JSON.parse(message.data) as { table: string };
      if (!WATCHED.has(table)) return;
      timer ??= setTimeout(() => {
        timer = null;
        void refresh();
      }, 100);
    };
    return () => {
      live = false;
      source.close();
      if (timer) clearTimeout(timer);
    };
  }, [kind, subjectId, apply]);

  return { ...state, load };
}

function RefineChat({ kind, subjectId }: { kind: ChatSubjectKind; subjectId: string }) {
  const { snapshot, error, load } = useChat(kind, subjectId);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [earlier, setEarlier] = useState<{ id: string; messages: ChatMessageView[] } | null>(null);
  const [applied, setApplied] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const messages = snapshot?.messages ?? [];
  const lastBody = messages.at(-1)?.body.length ?? 0;

  // Follow the reply as it streams, unless the owner scrolled up to read.
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastBody]);

  const run = (fn: () => Promise<{ error: string | null }>, then?: () => void) =>
    start(async () => {
      const result = await fn();
      if (result.error) toast.error(result.error);
      else then?.();
      await load();
    });

  const send = (text: string) => {
    if (!text.trim() || pending || snapshot?.busy) return;
    setApplied(false);
    run(() => sendRefineMessage(kind, subjectId, text), () => setDraft(""));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  const latestProposal = [...messages].reverse().find((m) => m.proposal)?.id;
  const busyMessage = messages.find((m) => m.status === "pending" || m.status === "streaming");
  const noun = snapshot?.noun ?? "suggestion";

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle>Refine the {noun}</SheetTitle>
        <SheetDescription className="line-clamp-2">{snapshot?.title ?? "Loading…"}</SheetDescription>
        {snapshot && snapshot.earlier.length > 0 && !earlier && (
          <div className="flex flex-wrap items-center gap-1 pt-1 text-xs text-muted-foreground">
            Earlier chats:
            {snapshot.earlier.map((t) => (
              <Button
                key={t.id}
                size="xs"
                variant="ghost"
                onClick={async () => {
                  const data = (await (await fetch(`/api/chat?thread=${t.id}`, { cache: "no-store" })).json()) as { messages?: ChatMessageView[]; error?: string };
                  if (data.messages) setEarlier({ id: t.id, messages: data.messages });
                  else toast.error(data.error ?? "Couldn't load that chat");
                }}
              >
                {t.createdAt.slice(0, 10)} ({t.status === "applied" ? "applied" : "ended"})
              </Button>
            ))}
          </div>
        )}
      </SheetHeader>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm" aria-live="polite">
        {error && <p className="text-destructive">{error}</p>}
        {earlier ? (
          <>
            <Button size="sm" variant="ghost" className="w-fit" onClick={() => setEarlier(null)}>
              <ArrowLeftIcon />
              Back to the current chat
            </Button>
            {earlier.messages.map((m) => (
              <Message key={m.id} kind={kind} message={m} noun={noun} readOnly />
            ))}
          </>
        ) : !snapshot ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            {applied && (
              <p className="rounded-md border border-emerald-600/30 bg-emerald-600/5 p-3">
                Applied. The page shows the new {noun}, and the old ones are under Versions. Write again to keep refining in a new chat.
              </p>
            )}
            <p className="text-muted-foreground">
              Ask about the {noun}, push back, or tell it about your setup. When it changes them, you&apos;ll see the revised {noun} with an Apply button: nothing changes until you apply.
            </p>
            <div className="flex flex-col items-start gap-1.5">
              {STARTERS[kind].map((s) => (
                <Button key={s} size="sm" variant="outline" className="h-auto py-1.5 text-left whitespace-normal" disabled={pending} onClick={() => (s.endsWith("…") ? setDraft(s.slice(0, -1)) : send(s))}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <Message
              key={m.id}
              kind={kind}
              message={m}
              noun={noun}
              superseded={Boolean(m.proposal) && m.id !== latestProposal}
              last={i === messages.length - 1}
              busy={pending}
              onApply={() =>
                run(
                  () => applyRefineRevision(m.id),
                  () => {
                    setApplied(true);
                    toast.success(`Applied. The previous ${noun} are under Versions.`);
                  },
                )
              }
              onRetry={() => run(() => retryRefineReply(m.id))}
            />
          ))
        )}
      </div>

      {!earlier && (
        <div className="flex flex-col gap-2 border-t p-4">
          <div className="relative">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={messages.length ? "Reply, or ask for another change…" : `Ask about the ${noun} or say what to change…`}
              aria-label="Message"
              className="max-h-48 min-h-20 resize-none pr-12"
              maxLength={4000}
              disabled={!snapshot}
            />
            {busyMessage ? (
              <Button size="icon-sm" variant="outline" className="absolute right-2 bottom-2" aria-label="Stop the reply" onClick={() => run(() => stopRefineReply(busyMessage.id))}>
                <SquareIcon />
              </Button>
            ) : (
              <Button size="icon-sm" className="absolute right-2 bottom-2" aria-label="Send" disabled={!draft.trim() || pending || !snapshot} onClick={() => send(draft)}>
                {pending ? <Loader2Icon className="animate-spin" /> : <ArrowUpIcon />}
              </Button>
            )}
          </div>
          {snapshot && (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <label className="flex w-fit cursor-pointer items-center gap-1.5">
                <input type="checkbox" className="accent-primary" checked={snapshot.webSearch} disabled={pending} onChange={(e) => run(() => setRefineWebSearch(e.target.checked))} />
                <GlobeIcon className="size-3.5" aria-hidden />
                Search the web
              </label>
              <p>
                {snapshot.webSearch
                  ? "On by default: the AI may look up documentation and config syntax before it answers (about $0.01 a search, up to 3 a reply). Untick to turn it off."
                  : "Off: replies use only what the AI already knows. Tick to let it check documentation on the web."}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span>{snapshot.threadId ? `This chat so far: $${snapshot.costUsd.toFixed(snapshot.costUsd < 0.1 ? 3 : 2)}` : "Each reply costs about $0.01–0.03."}</span>
                {snapshot.threadId && (
                  <Button size="xs" variant="ghost" disabled={pending || snapshot.busy} onClick={() => run(() => startRefineOver(kind, subjectId))}>
                    <RotateCcwIcon />
                    Start over
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Message({
  kind,
  message: m,
  noun,
  readOnly,
  superseded,
  last,
  busy,
  onApply,
  onRetry,
}: {
  kind: ChatSubjectKind;
  message: ChatMessageView;
  noun: string;
  readOnly?: boolean;
  superseded?: boolean;
  last?: boolean;
  busy?: boolean;
  onApply?: () => void;
  onRetry?: () => void;
}) {
  if (m.role === "user") {
    return <div className="max-w-[85%] self-end rounded-lg bg-muted px-3 py-2 whitespace-pre-wrap">{m.body}</div>;
  }
  const working = m.status === "pending" || m.status === "streaming";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {m.body ? <ChatText text={m.body} /> : null}
      {working && (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
          {m.status === "pending" ? "Waiting to start…" : m.body ? "Writing…" : m.webSearch ? "Thinking (and maybe searching the web)…" : "Thinking…"}
        </p>
      )}
      {(m.status === "failed" || m.status === "cancelled") && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={m.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{m.status === "failed" ? `Couldn't reply: ${m.error}` : "Stopped."}</span>
          {last && !readOnly && (
            <Button size="xs" variant="outline" disabled={busy} onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      )}
      {m.proposal && (
        <div className={`flex min-w-0 flex-col gap-3 rounded-lg border p-3 ${superseded && m.proposalStatus !== "applied" ? "opacity-70" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">Revised {noun}</span>
            {m.proposalStatus === "applied" ? (
              <Badge variant="secondary">
                <CheckIcon />
                Applied
              </Badge>
            ) : superseded ? (
              <span className="text-xs text-muted-foreground">A newer revision is below</span>
            ) : null}
          </div>
          <RevisionView kind={kind} value={m.proposal} />
          {!readOnly && m.proposalStatus !== "applied" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={busy} onClick={onApply}>
                <CheckIcon />
                Apply
              </Button>
              <span className="text-xs text-muted-foreground">Replaces the current {noun} and ends this chat. You can go back under Versions.</span>
            </div>
          )}
        </div>
      )}
      {m.sources.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Sources ({m.sources.length})</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {m.sources.map((s) => (
              <li key={s.url} className="truncate">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      {m.status === "done" && m.model && <span className="text-[0.7rem] text-muted-foreground">{m.model}</span>}
    </div>
  );
}
