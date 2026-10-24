"use client";

import { useTransition, type ReactNode } from "react";
import { CheckIcon, EyeIcon, ExternalLinkIcon, Loader2Icon, PenLineIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { ActionResult } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { draftAnswer, setRepliesStatus } from "./actions";

export type ReplyView = {
  id: string;
  channelLabel: string;
  url: string;
  author: string | null;
  body: string;
  postedAgo: string | null;
  status: "new" | "seen" | "answered" | "dismissed";
  /** An answer is being drafted or was drafted (its opportunity card is shown below). */
  hasAnswer: boolean;
  post: { kind: "reply" | "piece"; label: string; url: string | null };
};

const statusLabel: Record<ReplyView["status"], string> = { new: "New", seen: "Seen", answered: "Answered", dismissed: "Dismissed" };

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>, success?: string) =>
    startTransition(async () => {
      const { error } = await fn();
      if (error) toast.error(error);
      else if (success) toast.success(success);
    });
  return [pending, run] as const;
}

/** Marks every new reply on this page seen. */
export function MarkAllSeen({ ids }: { ids: string[] }) {
  const [pending, run] = useAction();
  if (!ids.length) return null;
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => setRepliesStatus(ids, "seen"))}>
      {pending ? <Loader2Icon className="animate-spin" /> : <EyeIcon />}
      Mark all seen
    </Button>
  );
}

/** One reply to something the owner posted; `answer` is its drafted answer's card, if any. */
export function ReplyCard({ reply, answer }: { reply: ReplyView; answer?: ReactNode }) {
  const [pending, run] = useAction();
  const set = (status: ReplyView["status"], message?: string) => run(() => setRepliesStatus([reply.id], status), message);
  const open = reply.status === "new" || reply.status === "seen";
  return (
    <div className="grid gap-2">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {reply.author ?? "Someone"} replied on {reply.channelLabel}
            {reply.postedAgo && <span className="font-normal text-muted-foreground"> · {reply.postedAgo}</span>}
          </CardTitle>
          <CardDescription>
            To your {reply.post.kind === "reply" ? "reply" : "post"}
            {reply.post.label && <>: “{reply.post.label}”</>}
            {reply.post.url && (
              <>
                {" "}
                <a href={reply.post.url} target="_blank" rel="noreferrer" className="underline">
                  open yours
                </a>
              </>
            )}
          </CardDescription>
          <CardAction>
            <Badge variant={reply.status === "new" ? "default" : "outline"}>{statusLabel[reply.status]}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{reply.body.length > 1500 ? `${reply.body.slice(0, 1500)}…` : reply.body}</p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {open && !reply.hasAnswer && (
            <Button size="sm" disabled={pending} onClick={() => run(() => draftAnswer(reply.id), "Drafting an answer. It appears below this reply in a moment.")}>
              {pending ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />}
              Draft an answer
            </Button>
          )}
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={reply.url} target="_blank" rel="noreferrer" />}>
            <ExternalLinkIcon />
            Open
          </Button>
          {reply.status === "new" && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => set("seen")}>
              <EyeIcon />
              Mark seen
            </Button>
          )}
          {open && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => set("answered", "Marked answered.")}>
              <CheckIcon />
              I answered it
            </Button>
          )}
          {open && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => set("dismissed")}>
              <XIcon />
              Dismiss
            </Button>
          )}
          {!open && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => set("seen")}>
              <RotateCcwIcon />
              Reopen
            </Button>
          )}
        </CardFooter>
      </Card>
      {answer && <div className="ml-6 border-l pl-4">{answer}</div>}
    </div>
  );
}
