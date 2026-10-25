"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCheckIcon, ExternalLinkIcon, Loader2Icon, PencilIcon, PlusIcon, RefreshCwIcon, RssIcon, SearchIcon, Trash2Icon, UserPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type ActionResult, type Field } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { briefSeen, deletePerson, editPerson, follow, followLink, followLinkForm, ignore, markSeen, newPerson, research, saveSettings, unfollowAccount, updateNow } from "./competitor-actions";

/** Competitor watch (ARCHITECTURE.md section 3): the client pieces of the competitor page and Intel → Following. */

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult & { warning?: string }>, ok?: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) toast.error(result.error);
      else if (result.warning) toast.warning(result.warning);
      else if (ok) toast.success(ok);
    });
  return [pending, run] as const;
}

/** A disabled button gets no pointer events, so its reason sits on a wrapper. */
function Why({ why, children }: { why?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex" title={why}>
      {children}
    </span>
  );
}

export function ResearchButton({ competitorId, again, working, why }: { competitorId: string; again: boolean; working: boolean; why?: string }) {
  const [pending, run] = useAction();
  return (
    <Why why={why}>
      <Button size="sm" variant={again ? "outline" : "default"} disabled={pending || working || Boolean(why)} onClick={() => run(() => research(competitorId), "Researching. It takes a few minutes.")}>
        {working || pending ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
        {working ? "Researching…" : again ? "Research again" : "Research in depth"}
      </Button>
    </Why>
  );
}

// --- People -------------------------------------------------------------------------------------

type LinkBriefView = { summary: string; covers: string[]; recent: string[]; lastChange: string; from: "read" | "web_search"; urls: string[] };
type PersonBriefView = { summary: string; topics: string[]; hints: string[]; activity: string; urls: string[] };

/** A profile link and how Startica follows it ("posts", "changes on the page", "web search…"). */
export type LinkView = { kind: string; label: string; url: string; how: string };
export type AccountView = {
  id: string;
  channel: string;
  label: string;
  handle: string;
  url: string | null;
  status: "untested" | "ok" | "error";
  lastError: string | null;
  checked: string | null;
  brief: LinkBriefView | null;
  briefed: string | null;
};
export type PersonView = {
  id: string;
  name: string;
  role: string;
  why: string;
  status: "suggested" | "following" | "ignored";
  source: "ai" | "owner";
  links: LinkView[];
  accounts: AccountView[];
  brief: PersonBriefView | null;
};

const personFields: Field[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "role", label: "Role", type: "text", placeholder: "Co-founder, Head of product…" },
  { name: "why", label: "Why follow them (optional)", type: "text" },
  {
    name: "links",
    label: "Profile links, one per line",
    type: "textarea",
    rows: 4,
    placeholder: "https://bsky.app/profile/name.example\nhttps://social.example/@name\nhttps://name.example/blog\nhttps://www.linkedin.com/in/name",
    hint: "Startica reads Bluesky, Mastodon, Reddit and Hacker News posts and blog or newsletter feeds, and watches other pages (GitHub, YouTube, a site) for changes. LinkedIn and X are never opened: Startica briefs them from web search.",
  },
];

function Urls({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <span className="flex flex-wrap gap-2 text-xs">
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
          {shortUrl(u)}
        </a>
      ))}
    </span>
  );
}

function LinkBrief({ brief, briefed }: { brief: LinkBriefView; briefed: string | null }) {
  const [open, setOpen] = useState(false);
  const more = brief.covers.length + brief.recent.length > 0 || Boolean(brief.lastChange);
  return (
    <div className="flex w-full flex-col gap-1 pl-1 text-xs text-muted-foreground">
      <p>
        {brief.summary}
        {more && (
          <button type="button" className="ml-1 underline" onClick={() => setOpen(!open)}>
            {open ? "Less" : "More"}
          </button>
        )}
      </p>
      {open && (
        <div className="flex flex-col gap-1">
          {brief.lastChange && <p>Latest: {brief.lastChange}</p>}
          {brief.covers.length > 0 && <p>Covers: {brief.covers.join("; ")}</p>}
          {brief.recent.length > 0 && <p>Lately: {brief.recent.join("; ")}</p>}
          <Urls urls={brief.urls} />
          <p>
            {brief.from === "web_search" ? "From web search, not read directly" : "Written by AI from what Startica read"}
            {briefed && `, ${briefed}`}.
          </p>
        </div>
      )}
    </div>
  );
}

function AccountLine({ a }: { a: AccountView }) {
  const [pending, run] = useAction();
  const status =
    a.channel === "search" ? (a.brief ? null : "brief coming") : a.status === "untested" ? "not read yet" : `read ${a.checked}`;
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="outline">{a.label}</Badge>
      {a.url ? (
        <a href={a.url} target="_blank" rel="noreferrer" className="truncate underline-offset-4 hover:underline">
          {a.handle}
        </a>
      ) : (
        <span className="truncate">{a.handle}</span>
      )}
      {a.status === "error" ? <span className="text-xs text-destructive">{a.lastError}</span> : status && <span className="text-xs text-muted-foreground">{status}</span>}
      <Button size="xs" variant="ghost" className="ml-auto" disabled={pending} onClick={() => run(() => unfollowAccount(a.id))}>
        Unfollow
      </Button>
      {a.brief && <LinkBrief brief={a.brief} briefed={a.briefed} />}
    </li>
  );
}

function PersonCard({ p }: { p: PersonView }) {
  const [pending, run] = useAction();
  // Links that aren't followed (one that couldn't be): a button to open each.
  const followed = new Set(p.accounts.flatMap((a) => [a.url, a.handle]));
  const unread = p.links.filter((l) => !followed.has(l.url));
  return (
    <li className={`flex flex-col gap-2 rounded-lg border p-3 ${p.status === "ignored" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{p.name}</span>
        {p.role && <span className="text-sm text-muted-foreground">{p.role}</span>}
        {p.status === "suggested" && <Badge variant="outline">Suggested by the research</Badge>}
        {p.status === "following" && <Badge variant="secondary">Following</Badge>}
        {p.status === "ignored" && <Badge variant="outline">Not followed</Badge>}
        <span className="ml-auto flex gap-1">
          {p.status !== "following" && (
            <Button size="xs" disabled={pending} onClick={() => run(() => follow(p.id), `Following ${p.name}`)}>
              <UserPlusIcon /> Follow
            </Button>
          )}
          {p.status !== "ignored" && (
            <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => ignore(p.id))}>
              <XIcon /> {p.status === "suggested" ? "Dismiss" : "Unfollow"}
            </Button>
          )}
          <FormDialog
            trigger={
              <Button size="icon-xs" variant="ghost" aria-label={`Edit ${p.name}`}>
                <PencilIcon />
              </Button>
            }
            title={`Edit ${p.name}`}
            fields={personFields}
            values={{ name: p.name, role: p.role, why: p.why, links: p.links.map((l) => l.url).join("\n") }}
            action={async (fd) => {
              const r = await editPerson(p.id, fd);
              if (r.warning) toast.warning(r.warning);
              return r;
            }}
          />
          <Button size="icon-xs" variant="ghost" aria-label={`Delete ${p.name}`} disabled={pending} onClick={() => confirm(`Delete ${p.name} and what Startica read from them?`) && run(() => deletePerson(p.id))}>
            <Trash2Icon />
          </Button>
        </span>
      </div>
      {p.why && <p className="text-sm text-muted-foreground">{p.why}</p>}
      {p.brief && (
        <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-2 text-sm">
          <p>{p.brief.summary}</p>
          {p.brief.topics.length > 0 && <p className="text-xs text-muted-foreground">Talks about: {p.brief.topics.join("; ")}</p>}
          {p.brief.hints.length > 0 && <p className="text-xs">Hints: {p.brief.hints.join("; ")}</p>}
          {p.brief.activity && <p className="text-xs text-muted-foreground">{p.brief.activity}</p>}
          <Urls urls={p.brief.urls} />
        </div>
      )}
      {p.status === "following" && p.accounts.length > 0 && (
        <ul className="flex flex-col gap-1">
          {p.accounts.map((a) => (
            <AccountLine key={a.id} a={a} />
          ))}
        </ul>
      )}
      {p.status === "following" && p.accounts.length === 0 && (
        <p className="text-xs text-muted-foreground">No links yet: add their profiles, blog or site under Edit.</p>
      )}
      {(p.status !== "following" ? p.links : unread).length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {p.status === "following" && <span className="text-xs text-muted-foreground">Not followed:</span>}
          {(p.status !== "following" ? p.links : unread).map((l) => (
            <Button key={l.url} size="xs" variant="outline" nativeButton={false} render={<a href={l.url} target="_blank" rel="noreferrer" />}>
              <ExternalLinkIcon /> {l.label}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}

export function PeopleSection({ competitorId, people }: { competitorId: string; people: PersonView[] }) {
  const shown = [...people].sort((a, b) => order(a.status) - order(b.status));
  return (
    <div className="flex flex-col gap-3">
      <div>
        <FormDialog
          trigger={
            <Button size="sm" variant="outline">
              <PlusIcon /> Add a person
            </Button>
          }
          title="Follow someone at this competitor"
          description="Founders and the people who speak for the company. Public, work-related profiles only."
          fields={personFields}
          submitLabel="Follow"
          action={async (fd) => {
            const r = await newPerson(competitorId, fd);
            if (r.warning) toast.warning(r.warning);
            return r;
          }}
        />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one yet. Research the competitor to get suggestions, or add someone yourself.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((p) => (
            <PersonCard key={p.id} p={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

const order = (s: PersonView["status"]) => ({ following: 0, suggested: 1, ignored: 2 })[s];

// --- The company's own accounts -----------------------------------------------------------------

export function CompanyAccounts({ competitorId, accounts, suggestions }: { competitorId: string; accounts: AccountView[]; suggestions: LinkView[] }) {
  const [pending, run] = useAction();
  return (
    <div className="flex flex-col gap-3">
      {accounts.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {accounts.map((a) => (
            <AccountLine key={a.id} a={a} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Not following any of its accounts yet.</p>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Found by the research:</span>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((l) => (
              <Button key={l.url} size="xs" variant="outline" title={`Startica follows ${l.how}`} disabled={pending} onClick={() => run(() => followLink(competitorId, l.url), "Following. Startica reads it and writes a brief shortly.")}>
                <PlusIcon /> Follow {l.label}: {shortUrl(l.url)}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div>
        <FormDialog
          trigger={
            <Button size="sm" variant="outline">
              <RssIcon /> Follow a link
            </Button>
          }
          title="Follow the company's account, blog or page"
          description="A Bluesky, Mastodon, Reddit or Hacker News profile, its blog or newsletter (Startica finds the feed), or any page to watch for changes: pricing, changelog, careers, docs, GitHub, YouTube. A LinkedIn or X link is briefed from web search."
          fields={[{ name: "url", label: "Address", type: "text", required: true, placeholder: "https://example.com/pricing" }]}
          submitLabel="Follow"
          action={(fd) => followLinkForm(competitorId, fd)}
        />
      </div>
    </div>
  );
}

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 48);

// --- Activity -----------------------------------------------------------------------------------

export type ActivityView = {
  id: string;
  competitorId: string | null;
  competitor: string | null;
  who: string;
  channel: string;
  url: string;
  title: string | null;
  text: string;
  when: string | null;
  engagement: number | null;
  seen: boolean;
  kind: string;
  relevance: "high" | "medium" | "low" | null;
  relevanceWhy: string | null;
};

function ActivityItem({ item, showCompetitor }: { item: ActivityView; showCompetitor: boolean }) {
  const [open, setOpen] = useState(false);
  const long = item.text.length > 280;
  return (
    <li className={`flex flex-col gap-1 border-l-2 py-1 pl-3 ${item.seen ? "border-transparent" : "border-primary"}`}>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {!item.seen && <span className="font-medium text-primary">New</span>}
        {item.relevance === "high" && (
          <Badge variant="secondary" title={item.relevanceWhy ?? undefined}>
            Matters
          </Badge>
        )}
        {showCompetitor && item.competitor && <span className="font-medium text-foreground">{item.competitor}</span>}
        {/* The company's own posts: its name once. */}
        {!(showCompetitor && item.who === item.competitor) && <span>{item.who}</span>}
        <span>· {item.kind === "change" ? "Page changed" : item.channel}</span>
        {item.when && <span>· {item.when}</span>}
        {item.engagement != null && item.engagement > 0 && <span>· {item.engagement} reactions</span>}
        <a href={item.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 underline-offset-4 hover:underline">
          Open <ExternalLinkIcon className="size-3" />
        </a>
      </div>
      {item.title && <p className="text-sm font-medium">{item.title}</p>}
      {item.text && (
        <p className="text-sm break-words whitespace-pre-wrap">
          {long && !open ? `${item.text.slice(0, 279)}…` : item.text}
          {long && (
            <button type="button" className="ml-1 text-xs underline" onClick={() => setOpen(!open)}>
              {open ? "Less" : "More"}
            </button>
          )}
        </p>
      )}
    </li>
  );
}

export function ActivityFeed({ productId, competitorId, items, showCompetitor = false }: { productId: string; competitorId?: string; items: ActivityView[]; showCompetitor?: boolean }) {
  const [pending, run] = useAction();
  const unseen = items.filter((i) => !i.seen).length;
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing yet. Follow the company&apos;s accounts, blog or pages, or people at it; Startica reads them daily (or as often as you set) and when you add one.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {unseen > 0 && (
        <div>
          <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => markSeen(productId, competitorId))}>
            <CheckCheckIcon /> Mark {unseen} as seen
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <ActivityItem key={i.id} item={i} showCompetitor={showCompetitor} />
        ))}
      </ul>
    </div>
  );
}

// --- Briefs -------------------------------------------------------------------------------------

type Digest = { headline: string; items: { competitor: string; what: string; whyItMatters: string; urls: string[] }[]; suggestions: string[]; quiet: string[]; sinceLast?: string[] };

export type BriefView = {
  id: string;
  period: "day" | "week" | "month" | "year";
  title: string;
  status: "working" | "ready" | "failed";
  error: string | null;
  updated: string;
  posts: number;
  seen: boolean;
  closed: boolean;
  digest: Digest | null;
};

const PERIOD_WORD: Record<BriefView["period"], string> = { day: "day", week: "week", month: "month", year: "year" };

/** Today / This week / This month / This year, as links (the page reads `?brief=`). */
export function BriefSwitcher({ periods, active }: { periods: { period: string; label: string; unread: boolean }[]; active: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Brief period">
      {periods.map((p) => (
        <Button key={p.period} size="sm" variant={p.period === active ? "secondary" : "ghost"} role="tab" aria-selected={p.period === active} nativeButton={false} render={<Link href={`/intel?tab=following&brief=${p.period}`} scroll={false} />}>
          {p.label}
          {p.unread && <span className="size-1.5 rounded-full bg-primary" aria-label="unread" />}
        </Button>
      ))}
    </div>
  );
}

export function UpdateNowButton({ productId, period, working, why }: { productId: string; period: string; working: boolean; why?: string }) {
  const [pending, run] = useAction();
  return (
    <Why why={why}>
      <Button size="sm" variant="outline" disabled={pending || working || Boolean(why)} onClick={() => run(() => updateNow(productId, period), "Updating the brief…")}>
        {working || pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
        {working ? "Updating…" : "Update now"}
      </Button>
    </Why>
  );
}

export function BriefBody({ brief }: { brief: BriefView }) {
  const [pending, run] = useAction();
  if (brief.status === "failed") return <p className="text-sm text-destructive">The brief failed: {brief.error}</p>;
  if (brief.status === "working" || !brief.digest) return <p className="text-sm text-muted-foreground">Writing the brief…</p>;
  const d = brief.digest;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-medium">{d.headline}</p>
      {d.sinceLast && d.sinceLast.length > 0 && (
        <div className="rounded-md bg-muted/50 p-2">
          <p className="text-xs font-medium">New since the last update</p>
          <ul className="list-disc pl-5 text-xs">
            {d.sinceLast.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {d.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {d.items.map((item, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <span>
                <span className="font-medium">{item.competitor}:</span> {item.what}
              </span>
              <span className="text-muted-foreground">{item.whyItMatters}</span>
              <Urls urls={item.urls} />
            </li>
          ))}
        </ul>
      )}
      {d.suggestions.length > 0 && (
        <div>
          <p className="font-medium">What you could do</p>
          <ul className="list-disc pl-5">
            {d.suggestions.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {d.quiet.length > 0 && <p className="text-xs text-muted-foreground">Quiet: {d.quiet.join(", ")}.</p>}
      {brief.error && <p className="text-xs text-destructive">The last update failed: {brief.error}</p>}
      <p className="text-xs text-muted-foreground">
        {brief.title}. Written by AI from {brief.posts} {brief.posts === 1 ? "post" : "posts"}
        {brief.closed ? `; final, ${brief.updated}.` : `; updated ${brief.updated} and again as new posts and changes arrive this ${PERIOD_WORD[brief.period]}.`} Check the links before acting on it.
        {!brief.seen && (
          <Button size="xs" variant="ghost" className="ml-2" disabled={pending} onClick={() => run(() => briefSeen(brief.id))}>
            Mark as read
          </Button>
        )}
      </p>
    </div>
  );
}

// --- Settings -----------------------------------------------------------------------------------

type Option = { value: string; label: string };
export type WatchSettingsView = {
  settings: { periods: string[]; checkEvery: string; researchEvery: string };
  checkOptions: Option[];
  researchOptions: Option[];
  periodOptions: Option[];
  lines: { label: string; usd: string }[];
  monthly: string;
  researchRun: string | null;
  nextResearch: string | null;
  lastRead: string | null;
};

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function WatchSettingsForm({ productId, view }: { productId: string; view: WatchSettingsView }) {
  const [pending, run] = useAction();
  // Shown as chosen right away; the estimate catches up when the page refreshes.
  const [settings, setSettings] = useState(view.settings);
  const save = (patch: Partial<WatchSettingsView["settings"]>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    run(async () => {
      const result = await saveSettings(productId, next);
      if (result.error) setSettings(view.settings);
      return result;
    }, "Saved");
  };
  return (
    <div className="flex flex-col gap-4 text-sm">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Briefs to write</legend>
        <div className="flex flex-wrap gap-4">
          {view.periodOptions.map((o) => (
            <label key={o.value} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={settings.periods.includes(o.value)}
                disabled={pending}
                onChange={(e) => save({ periods: e.target.checked ? [...settings.periods, o.value] : settings.periods.filter((p) => p !== o.value) })}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Read links and update briefs</span>
          <select className={selectClass} value={settings.checkEvery} disabled={pending} onChange={(e) => save({ checkEvery: e.target.value })}>
            {view.checkOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">{view.lastRead ? `Last read ${view.lastRead}.` : "Not read yet."} Only while Startica is open; a missed read runs when it opens.</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Research competitors again</span>
          <select className={selectClass} value={settings.researchEvery} disabled={pending} onChange={(e) => save({ researchEvery: e.target.value })}>
            {view.researchOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {view.researchRun ? `Each round: ${view.researchRun}.` : "Only competitors you've researched once are researched again."}
            {view.nextResearch && settings.researchEvery !== "never" && ` Next: ${view.nextResearch}.`}
          </span>
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">Estimated cost: up to {view.monthly} a month</p>
        {view.lines.length > 0 ? (
          <ul className="text-xs text-muted-foreground">
            {view.lines.map((l) => (
              <li key={l.label} className="flex justify-between gap-4 sm:max-w-md">
                <span>{l.label}</span>
                <span className="tabular-nums">{l.usd}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nothing to brief yet: follow a competitor&apos;s links or people.</p>
        )}
        <p className="text-xs text-muted-foreground">An upper bound for what you follow now, from your AI models&apos; prices: briefs are only rewritten when something new arrived. It counts toward your monthly AI budget.</p>
      </div>
    </div>
  );
}
