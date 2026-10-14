"use client";

import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, Loader2Icon, RefreshCwIcon, SendIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type ActionResult, type Field } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { addReplyLink, dismissOpportunity, draftAnyway, markPosted, postWithStartica, regenerateDraft, saveDraftEdit } from "./actions";
import { channelLabel } from "@/lib/channels";

export type OpportunityView = {
  id: string;
  status: string;
  relevance: number | null;
  intent: number | null;
  reasoning: string | null;
  angle: string | null;
  error: string | null;
  dismissReason: string | null;
  conversation: {
    channel: string;
    community: string | null;
    kind: string;
    url: string;
    title: string | null;
    threadTitle: string | null;
    body: string;
    author: string | null;
    postedAgo: string | null;
  };
  draft: {
    version: number;
    body: string;
    mentionsProduct: boolean;
    rationale: string | null;
    source: string;
  } | null;
  promo: { total: number; mentions: number } | null;
  /** The desktop app can open this thread in its posting window (ARCHITECTURE.md 8.4). */
  canPost: boolean;
  /** Posted: the link to the user's reply, if known. */
  postedUrl: string | null;
};


const dismissFields: Field[] = [
  {
    name: "reason",
    label: "Why isn't this a fit?",
    type: "select",
    options: [
      { value: "off_topic", label: "Off topic" },
      { value: "wrong_audience", label: "Wrong audience" },
      { value: "too_old", label: "Too old / thread is dead" },
      { value: "rules_forbid", label: "Community rules don't allow it" },
      { value: "already_answered", label: "Already well answered" },
      { value: "other", label: "Other" },
    ],
  },
];

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

function Score({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  return (
    <Badge variant={value >= 0.7 ? "secondary" : "outline"} className="tabular-nums">
      {label} {pct}%
    </Badge>
  );
}

export function OpportunityCard({ opportunity: o }: { opportunity: OpportunityView }) {
  const c = o.conversation;
  const [text, setText] = useState(o.draft?.body ?? "");
  const [expanded, setExpanded] = useState(false);
  const [pending, run] = useAction();
  const edited = o.draft != null && text.trim() !== o.draft.body.trim();
  const busy = o.status === "new" || o.status === "drafting";
  const where = c.channel === "reddit" && c.community ? `r/${c.community}` : (c.community ?? channelLabel(c.channel));
  const heading = c.title ?? (c.threadTitle ? `Comment in “${c.threadTitle}”` : `${channelLabel(c.channel)} ${c.kind}`);

  async function copyAndOpen() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Reply copied. Paste it in the thread, then mark it as posted.");
    } catch {
      toast.error("Couldn't copy automatically; select the text and copy it.");
    }
    window.open(c.url, "_blank", "noopener,noreferrer");
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{channelLabel(c.channel)}</Badge>
          <span>{where}</span>
          {c.author && <span>· {c.author}</span>}
          {c.postedAgo && <span>· {c.postedAgo}</span>}
        </CardDescription>
        <CardTitle className="leading-snug">
          <a href={c.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
            {heading}
          </a>
        </CardTitle>
        <CardAction className="flex gap-1">
          <Score label="Relevance" value={o.relevance} />
          <Score label="Intent" value={o.intent} />
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-4">
        {c.body && (
          <div className="grid gap-1">
            <p className={`text-sm whitespace-pre-line text-muted-foreground ${expanded ? "" : "line-clamp-4"}`}>{c.body}</p>
            {c.body.length > 300 && (
              <button type="button" className="justify-self-start text-xs underline" onClick={() => setExpanded(!expanded)}>
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}

        {o.reasoning && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Why it matched: </span>
            {o.reasoning}
          </p>
        )}

        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            {o.status === "new" ? "Scoring…" : "Writing a draft…"}
          </p>
        )}
        {o.status === "failed" && o.error && <p className="text-sm text-destructive">Draft failed: {o.error}</p>}

        {o.draft && !busy && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Draft v{o.draft.version}</span>
              {o.draft.source === "owner" && <Badge variant="secondary">Edited by you</Badge>}
              {o.draft.mentionsProduct ? (
                <Badge variant="outline">Mentions the product</Badge>
              ) : (
                <Badge variant="outline">No product mention</Badge>
              )}
              {o.promo && o.promo.total > 0 && (
                <span>
                  You&apos;ve mentioned the product in {o.promo.mentions} of your last {o.promo.total} replies here.
                </span>
              )}
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(14, Math.max(5, text.split("\n").length + 2))}
              disabled={o.status === "posted"}
            />
            {o.draft.rationale && <p className="text-xs text-muted-foreground">{o.draft.rationale}</p>}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {o.status === "drafted" && (
          <>
            {o.canPost && (
              <Button
                size="sm"
                disabled={pending || !text.trim()}
                onClick={() =>
                  run(
                    () => postWithStartica(o.id, text),
                    "Posting window opened. Check the reply, then press the site's own button. Startica records it when you do.",
                  )
                }
              >
                <SendIcon />
                Post…
              </Button>
            )}
            <Button size="sm" variant={o.canPost ? "outline" : "default"} onClick={copyAndOpen} disabled={!text.trim()}>
              <CopyIcon />
              Copy & open thread
            </Button>
            <FormDialog
              trigger={
                <Button size="sm" variant="outline">
                  <CheckIcon />
                  Mark as posted
                </Button>
              }
              title="Mark as posted"
              description="Add the link to your reply if you have it; Startica uses it to track replies and upvotes."
              fields={[{ name: "url", label: "Link to your reply (optional)", type: "url", placeholder: "https://" }]}
              submitLabel="Mark as posted"
              action={async (fd) => {
                if (edited) {
                  const saved = await saveDraftEdit(o.id, text);
                  if (saved.error) return saved;
                }
                return markPosted(o.id, fd);
              }}
            />
            {edited && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => saveDraftEdit(o.id, text), "Saved")}>
                Save edits
              </Button>
            )}
          </>
        )}
        {(o.status === "drafted" || o.status === "failed") && (
          <FormDialog
            trigger={
              <Button size="sm" variant="ghost">
                <RefreshCwIcon />
                Regenerate
              </Button>
            }
            title="Regenerate draft"
            fields={[
              {
                name: "guidance",
                label: "Anything to change? (optional)",
                type: "textarea",
                placeholder: "Shorter. Don't mention the product. Mention the free plan…",
              },
            ]}
            submitLabel="Regenerate"
            action={(fd) => regenerateDraft(o.id, fd)}
          />
        )}
        {o.status === "archived" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => draftAnyway(o.id), "Drafting…")}>
            Draft a reply anyway
          </Button>
        )}
        {["drafted", "failed", "archived"].includes(o.status) && (
          <FormDialog
            trigger={
              <Button size="sm" variant="ghost" className="ml-auto">
                <XIcon />
                Dismiss
              </Button>
            }
            title="Dismiss"
            description="The reason helps tune what Startica surfaces."
            fields={dismissFields}
            values={{ reason: "off_topic" }}
            submitLabel="Dismiss"
            action={(fd) => dismissOpportunity(o.id, fd)}
          />
        )}
        {o.status === "posted" && (
          <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm underline-offset-4 hover:underline">
            <ExternalLinkIcon className="size-4" />
            Open thread
          </a>
        )}
        {o.status === "posted" && o.postedUrl && (
          <a href={o.postedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm underline-offset-4 hover:underline">
            <ExternalLinkIcon className="size-4" />
            Open your reply
          </a>
        )}
        {o.status === "posted" && !o.postedUrl && (
          <FormDialog
            trigger={<Button size="sm" variant="ghost">Add link</Button>}
            title="Link to your reply"
            description="With the link, Startica tracks the replies it gets (Reddit, Hacker News, Bluesky, Mastodon, Discourse, and X with an X API token)."
            fields={[{ name: "url", label: "Link to your reply", type: "url", placeholder: "https://" }]}
            submitLabel="Save link"
            action={(fd) => addReplyLink(o.id, fd)}
          />
        )}
        {o.status === "dismissed" && o.dismissReason && (
          <span className="text-xs text-muted-foreground">Dismissed: {o.dismissReason.replace("_", " ")}</span>
        )}
      </CardFooter>
    </Card>
  );
}
