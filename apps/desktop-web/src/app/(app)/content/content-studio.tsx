"use client";

import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon, DownloadIcon, Loader2Icon, PlusIcon, RefreshCwIcon, SendIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type ActionResult, type Field } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseCampaign } from "@startica/core/content/campaign";
import {
  addVoiceSamples,
  buildVoice,
  createPiece,
  deletePiece,
  deleteVoiceProfile,
  deleteVoiceSource,
  importVoiceSamples,
  markPiecePosted,
  postPieceWithStartica,
  regeneratePiece,
  savePieceEdit,
  savePieceNotes,
  saveVoiceSource,
  suggestTopics,
} from "./actions";
import { channelLabel, contentChannelOptions } from "@/lib/channels";

export type VoiceGuideView = {
  summary: string;
  tone: string[];
  structure: string[];
  vocabulary: string[];
  dos: string[];
  donts: string[];
  example_openers: string[];
};
export type SourceView = { id: string; name: string; platform: string; handle: string | null; url: string | null; samples: number; importing: boolean };
export type ProfileView = { id: string; name: string; status: "building" | "ready" | "failed"; error: string | null; guide: VoiceGuideView | null; sources: string[] };
export type PieceView = {
  id: string;
  channel: string;
  format: string;
  topic: string;
  title: string | null;
  body: string;
  rationale: string | null;
  status: "drafting" | "draft" | "posted" | "failed";
  error: string | null;
  voice: string | null;
  postedUrl: string | null;
  /** Latest check of the post (Reddit and Hacker News links, every 6 hours for two weeks). */
  engagement: { replies: number | null; score: number | null; removed: boolean; checked: string } | null;
  /** GA4 visits through the piece's tracking link, when GA4 is connected and the piece links the product. */
  traffic: { visits: number; keyEvents: number } | null;
  notes: string | null;
  created: string;
  /** The desktop app can open this channel in its posting window (ARCHITECTURE.md 8.4). */
  canPost: boolean;
};
export type TopicView = { topic: string; channel: string; why: string };

const CHANNELS = contentChannelOptions;
const channelName = channelLabel;
const FORMATS = [
  { value: "post", label: "Post" },
  { value: "thread", label: "Thread" },
  { value: "article", label: "Article" },
  { value: "newsletter", label: "Newsletter issue" },
  { value: "campaign", label: "Email campaign" },
];
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

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

// --- Create --------------------------------------------------------------------------

export function CreatePanel({
  productId,
  profiles,
  topics,
  topicsPending,
}: {
  productId: string;
  profiles: ProfileView[];
  topics: TopicView[];
  topicsPending: boolean;
}) {
  const [topic, setTopic] = useState("");
  const [channel, setChannel] = useState("reddit");
  const [format, setFormat] = useState("post");
  const [pending, run] = useAction();
  const ready = profiles.filter((p) => p.status === "ready");

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>Write something</CardTitle>
          <CardDescription>The AI writes it for the channel&apos;s norms, in the voice you pick. It lands in the Library to edit and post.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={(fd) => run(() => createPiece(productId, fd), "Writing… it'll appear in the Library.")}
            className="grid gap-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label htmlFor="channel">Channel</Label>
                <select
                  id="channel"
                  name="channel"
                  className={selectClass}
                  value={channel}
                  onChange={(e) => {
                    setChannel(e.target.value);
                    // An email campaign is the email channel's format, and only its.
                    if (e.target.value === "email") setFormat("campaign");
                    else if (format === "campaign") setFormat("post");
                  }}
                >
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="format">Format</Label>
                <select
                  id="format"
                  name="format"
                  className={selectClass}
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value);
                    if (e.target.value === "campaign") setChannel("email");
                  }}
                >
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="voice">Voice</Label>
                <select id="voice" name="voice" className={selectClass} defaultValue={ready[0]?.id ?? ""}>
                  <option value="">Plain (no voice)</option>
                  {ready.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="topic">Topic</Label>
              <Textarea
                id="topic"
                name="topic"
                rows={3}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Three mistakes we made before our first 100 users"
              />
            </div>
            <div>
              <Button type="submit" disabled={pending || topic.trim().length < 3}>
                <SparklesIcon /> Write it
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ideas</CardTitle>
          <CardDescription>From the brief, personas and the conversations Startica found.</CardDescription>
          <CardAction>
            <Button size="sm" variant="outline" disabled={pending || topicsPending} onClick={() => run(() => suggestTopics(productId), "Thinking up ideas…")}>
              {topicsPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              {topics.length ? "New ideas" : "Suggest ideas"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ideas yet.</p>
          ) : (
            <ul className="grid gap-2">
              {topics.map((t, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="grid w-full gap-1 rounded-md border p-3 text-left text-sm hover:bg-muted/50"
                    onClick={() => {
                      setTopic(t.topic);
                      setChannel(t.channel);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Badge variant="outline">{channelName(t.channel)}</Badge>
                    </span>
                    <span className="font-medium">{t.topic}</span>
                    <span className="text-xs text-muted-foreground">{t.why}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Library -------------------------------------------------------------------------

function PieceCard({ piece }: { piece: PieceView }) {
  const [title, setTitle] = useState(piece.title ?? "");
  const [body, setBody] = useState(piece.body);
  const [pending, run] = useAction();
  const edited = title !== (piece.title ?? "") || body !== piece.body;
  const busy = piece.status === "drafting";

  async function copy() {
    try {
      await navigator.clipboard.writeText(title ? `${title}\n\n${body}` : body);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy; select the text instead");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{channelName(piece.channel)}</Badge>
          <Badge variant="outline">{piece.format}</Badge>
          {piece.voice && <Badge variant="secondary">{piece.voice}</Badge>}
          {piece.status === "posted" && <Badge>Posted</Badge>}
          <span>{piece.created}</span>
        </CardDescription>
        <CardTitle className="text-sm font-normal text-muted-foreground">{piece.topic}</CardTitle>
        <CardAction>
          <Button size="icon-sm" variant="ghost" aria-label="Delete" disabled={pending} onClick={() => window.confirm("Delete this piece?") && run(() => deletePiece(piece.id))}>
            <Trash2Icon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Writing…
          </p>
        )}
        {piece.status === "failed" && <p className="text-sm text-destructive">{piece.error}</p>}
        {!busy && piece.body && (
          <>
            {(piece.title || ["reddit", "hackernews", "discourse", "blog", "newsletter"].includes(piece.channel)) && (
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" />
            )}
            {piece.format === "campaign" && <CampaignEmails text={body} />}
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={Math.min(18, Math.max(6, body.split("\n").length + 2))}
              aria-label={piece.format === "campaign" ? "Edit the campaign" : "Body"}
            />
            {piece.rationale && <p className="text-xs text-muted-foreground">{piece.rationale}</p>}
            {piece.postedUrl && (
              <a href={piece.postedUrl} target="_blank" rel="noreferrer" className="text-sm underline-offset-4 hover:underline">
                View the post
              </a>
            )}
            {piece.status === "posted" && <PieceResults piece={piece} />}
            {piece.notes && (
              <p className="text-sm">
                <span className="font-medium">How it did: </span>
                {piece.notes}
              </p>
            )}
          </>
        )}
      </CardContent>
      {!busy && (
        <CardFooter className="flex flex-wrap gap-2">
          {piece.canPost && piece.status !== "posted" && piece.body && (
            <Button
              size="sm"
              disabled={pending || !body.trim()}
              onClick={() =>
                run(
                  () => postPieceWithStartica(piece.id, title, body),
                  "Posting window opened. Check the post, then press the site's own button. Startica records it when you do.",
                )
              }
            >
              <SendIcon /> Post…
            </Button>
          )}
          {piece.body && (
            <Button size="sm" variant={piece.canPost && piece.status !== "posted" ? "outline" : "default"} onClick={copy}>
              <CopyIcon /> Copy
            </Button>
          )}
          {edited && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => savePieceEdit(piece.id, title, body), "Saved")}>
              Save edits
            </Button>
          )}
          <FormDialog
            trigger={
              <Button size="sm" variant="ghost">
                <RefreshCwIcon /> Rewrite
              </Button>
            }
            title="Rewrite"
            fields={[{ name: "guidance", label: "What should change? (optional)", type: "textarea", placeholder: "Shorter. Funnier. Don't mention the product. Open with a question…" }]}
            submitLabel="Rewrite"
            action={(fd) => regeneratePiece(piece.id, fd)}
          />
          {piece.status === "posted" && !piece.postedUrl && (
            <FormDialog
              trigger={<Button size="sm" variant="ghost">Add link</Button>}
              title="Link to the post"
              description="With a link on Reddit, Hacker News, Bluesky, Mastodon and Discourse (or X, with an X API token), Startica tracks the replies it gets."
              fields={[{ name: "url", label: "Link to the post", type: "url", placeholder: "https://" }]}
              submitLabel="Save link"
              action={(fd) => markPiecePosted(piece.id, fd)}
            />
          )}
          {piece.status !== "posted" && piece.body && (
            <FormDialog
              trigger={
                <Button size="sm" variant="ghost">
                  <CheckIcon /> Mark posted
                </Button>
              }
              title="Mark as posted"
              fields={[{ name: "url", label: "Link to the post (optional; Reddit, Hacker News, Bluesky, Mastodon and Discourse links get their replies tracked)", type: "url", placeholder: "https://" }]}
              submitLabel="Mark posted"
              action={async (fd) => {
                if (edited) {
                  const saved = await savePieceEdit(piece.id, title, body);
                  if (saved.error) return saved;
                }
                return markPiecePosted(piece.id, fd);
              }}
            />
          )}
          {piece.status === "posted" && (
            <FormDialog
              trigger={<Button size="sm" variant="ghost">How did it do?</Button>}
              title="How did it do?"
              description="Likes, comments, signups… These notes help you (and the roadmap) see what works."
              fields={[{ name: "notes", label: "Notes", type: "textarea" }]}
              values={{ notes: piece.notes ?? "" }}
              action={(fd) => savePieceNotes(piece.id, fd)}
            />
          )}
        </CardFooter>
      )}
    </Card>
  );
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy; select the text instead");
  }
}

/** An email campaign, one email at a time, ready to paste into an email tool. Edits below show up here. */
function CampaignEmails({ text }: { text: string }) {
  const emails = parseCampaign(text);
  if (!emails) return <p className="text-xs text-muted-foreground">Keep the “## Email 1 · Day 0” headings to see each email separately.</p>;
  return (
    <ol className="grid gap-2">
      {emails.map((e, i) => (
        <li key={i} className="grid gap-1 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">Email {i + 1}</Badge>
            <span>{e.sendDay === 0 ? "Day 0 (first)" : `Day ${e.sendDay}`}</span>
            <span className="ml-auto flex gap-1">
              <Button size="xs" variant="ghost" onClick={() => copyText(e.subject, "Subject")}>
                <CopyIcon /> Subject
              </Button>
              <Button size="xs" variant="ghost" onClick={() => copyText(e.body, "Email")}>
                <CopyIcon /> Email
              </Button>
            </span>
          </div>
          <p className="text-sm font-medium">{e.subject || "(no subject)"}</p>
          {e.preview && <p className="text-xs text-muted-foreground">{e.preview}</p>}
          <p className="line-clamp-4 text-sm whitespace-pre-line">{e.body}</p>
        </li>
      ))}
    </ol>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function PieceResults({ piece }: { piece: PieceView }) {
  const e = piece.engagement;
  const parts = [
    e?.score != null && plural(e.score, "point"),
    e?.replies != null && plural(e.replies, "reply", "replies"),
    piece.traffic && plural(piece.traffic.visits, "visit"),
    piece.traffic && plural(piece.traffic.keyEvents, "key event"),
  ].filter(Boolean);
  if (!e && !piece.traffic) {
    return (
      <p className="text-xs text-muted-foreground">
        {piece.postedUrl ? "Startica checks Reddit, Hacker News, Bluesky, Mastodon and Discourse links (and X, with an X API token) every 6 hours." : "Add the post's link to track replies."}
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      {e?.removed && <Badge variant="destructive">Removed</Badge>}
      {parts.length > 0 && <span>{parts.join(" · ")}</span>}
      {e && <span className="text-xs text-muted-foreground">checked {e.checked}</span>}
    </p>
  );
}

export function LibraryPanel({ pieces }: { pieces: PieceView[] }) {
  if (pieces.length === 0) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nothing written yet. Start in the Create tab.</p>;
  }
  return (
    <div className="grid max-w-4xl gap-4">
      {pieces.map((p) => (
        <PieceCard key={`${p.id}-${p.status}-${p.body.length}`} piece={p} />
      ))}
    </div>
  );
}

// --- Voices --------------------------------------------------------------------------

const sourceFields: Field[] = [
  { name: "name", label: "Creator or account", type: "text", required: true, placeholder: "e.g. a writer your audience follows" },
  { name: "platform", label: "Where they write", type: "select", options: CHANNELS },
  { name: "handle", label: "Username (Reddit or HN: samples import automatically)", type: "text", placeholder: "username" },
  { name: "url", label: "Profile link (optional)", type: "url", placeholder: "https://" },
  { name: "notes", label: "What you like about their writing (optional)", type: "textarea", rows: 2 },
];

function Guide({ guide }: { guide: VoiceGuideView }) {
  const section = (label: string, items: string[]) =>
    items.length > 0 && (
      <div className="grid content-start gap-1">
        <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h4>
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="grid gap-3">
      <p className="text-sm">{guide.summary}</p>
      <div className="grid items-start gap-3 md:grid-cols-2">
        {section("Tone", guide.tone)}
        {section("Structure", guide.structure)}
        {section("Do", guide.dos)}
        {section("Don't", guide.donts)}
        {section("Vocabulary", guide.vocabulary)}
        {section("Example openers", guide.example_openers)}
      </div>
    </div>
  );
}

export function VoicesPanel({ productId, sources, profiles }: { productId: string; sources: SourceView[]; profiles: ProfileView[] }) {
  const [pending, run] = useAction();
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
          <CardDescription>Creators whose writing your audience already likes. Add 10+ samples each for a good voice.</CardDescription>
          <CardAction>
            <FormDialog
              trigger={
                <Button size="sm">
                  <PlusIcon /> Add source
                </Button>
              }
              title="Add a voice source"
              fields={sourceFields}
              values={{ platform: "reddit" }}
              action={(fd) => saveVoiceSource(productId, fd)}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {sources.length === 0 && <p className="text-sm text-muted-foreground">No sources yet.</p>}
          {sources.map((s) => (
            <div key={s.id} className="grid gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.name}</span>
                <Badge variant="outline">{channelName(s.platform)}</Badge>
                {s.handle && <span className="text-sm text-muted-foreground">{s.handle}</span>}
                <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                  {s.importing ? (
                    <span className="flex items-center gap-1">
                      <Loader2Icon className="size-3 animate-spin" /> importing…
                    </span>
                  ) : (
                    `${s.samples} samples`
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                <FormDialog
                  trigger={
                    <Button size="xs" variant="outline">
                      <PlusIcon /> Paste samples
                    </Button>
                  }
                  title={`Samples from ${s.name}`}
                  description="Paste posts or comments. Separate samples with a line containing only ---"
                  fields={[{ name: "samples", label: "Samples", type: "textarea", rows: 10 }]}
                  action={(fd) => addVoiceSamples(s.id, fd)}
                />
                {s.handle && (s.platform === "reddit" || s.platform === "hackernews") && (
                  <Button size="xs" variant="outline" disabled={pending || s.importing} onClick={() => run(() => importVoiceSamples(s.id), "Importing… Reddit takes about 2 minutes.")}>
                    <DownloadIcon /> Import
                  </Button>
                )}
                <Button size="xs" variant="outline" disabled={pending || s.samples < 3} onClick={() => run(() => buildVoice(productId, s.id, s.name), "Building the voice…")}>
                  <SparklesIcon /> Build voice
                </Button>
                <Button size="xs" variant="ghost" disabled={pending} onClick={() => window.confirm(`Delete ${s.name} and its samples?`) && run(() => deleteVoiceSource(s.id))}>
                  <Trash2Icon />
                </Button>
              </div>
            </div>
          ))}
          {sources.length > 1 && (
            <Button
              variant="outline"
              disabled={pending || sources.reduce((n, s) => n + s.samples, 0) < 3}
              onClick={() => run(() => buildVoice(productId, null, "Blend of all sources"), "Building a blended voice…")}
            >
              <SparklesIcon /> Build one voice from all sources
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        {profiles.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Voices</CardTitle>
              <CardDescription>Built voices appear here: a style guide the AI follows when writing.</CardDescription>
            </CardHeader>
          </Card>
        )}
        {profiles.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {p.name}
                {p.status === "building" && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
                {p.status === "failed" && <Badge variant="destructive">Failed</Badge>}
              </CardTitle>
              <CardDescription>From: {p.sources.join(", ") || "(deleted sources)"}</CardDescription>
              <CardAction>
                <Button size="icon-sm" variant="ghost" aria-label="Delete voice" disabled={pending} onClick={() => run(() => deleteVoiceProfile(p.id))}>
                  <Trash2Icon />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {p.status === "failed" && <p className="text-sm text-destructive">{p.error}</p>}
              {p.guide && <Guide guide={p.guide} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
