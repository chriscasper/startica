"use client";

import { useState, useTransition } from "react";
import { CheckCheckIcon, ExternalLinkIcon, Loader2Icon, PencilIcon, PlusIcon, RssIcon, SearchIcon, SparklesIcon, Trash2Icon, UserPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type ActionResult, type Field } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deletePerson, digestSeen, editPerson, follow, followLink, followLinkForm, ignore, markSeen, newPerson, research, setWeekly, summarizeNow, unfollowAccount } from "./competitor-actions";

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

export type LinkView = { kind: string; label: string; url: string; readable: boolean };
export type AccountView = { id: string; channel: string; label: string; handle: string; url: string | null; status: "untested" | "ok" | "error"; lastError: string | null; checked: string | null };
export type PersonView = {
  id: string;
  name: string;
  role: string;
  why: string;
  status: "suggested" | "following" | "ignored";
  source: "ai" | "owner";
  links: LinkView[];
  accounts: AccountView[];
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
    hint: "Startica reads Bluesky, Mastodon, Reddit and Hacker News profiles and blog or newsletter feeds. LinkedIn, X and other links are kept so you can open them.",
  },
];

function AccountLine({ a }: { a: AccountView }) {
  const [pending, run] = useAction();
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
      {a.status === "error" ? (
        <span className="text-xs text-destructive">{a.lastError}</span>
      ) : (
        <span className="text-xs text-muted-foreground">{a.status === "untested" ? "not read yet" : `read ${a.checked}`}</span>
      )}
      <Button size="xs" variant="ghost" className="ml-auto" disabled={pending} onClick={() => run(() => unfollowAccount(a.id))}>
        Unfollow
      </Button>
    </li>
  );
}

function PersonCard({ p }: { p: PersonView }) {
  const [pending, run] = useAction();
  const unread = p.links.filter((l) => !l.readable);
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
      {p.status === "following" && p.accounts.length > 0 && (
        <ul className="flex flex-col gap-1">
          {p.accounts.map((a) => (
            <AccountLine key={a.id} a={a} />
          ))}
        </ul>
      )}
      {p.status === "following" && p.accounts.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing Startica can read yet: add a Bluesky, Mastodon, Reddit or Hacker News profile, or a blog, under Edit.</p>
      )}
      {(p.status !== "following" ? p.links : unread).length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {p.status === "following" && <span className="text-xs text-muted-foreground">Check yourself:</span>}
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
            {suggestions.map((l) =>
              l.readable ? (
                <Button key={l.url} size="xs" variant="outline" disabled={pending} onClick={() => run(() => followLink(competitorId, l.url), "Following. Startica reads it shortly.")}>
                  <PlusIcon /> Follow {l.label}: {shortUrl(l.url)}
                </Button>
              ) : (
                <Button key={l.url} size="xs" variant="ghost" nativeButton={false} render={<a href={l.url} target="_blank" rel="noreferrer" />}>
                  <ExternalLinkIcon /> {l.label}
                </Button>
              ),
            )}
          </div>
        </div>
      )}
      <div>
        <FormDialog
          trigger={
            <Button size="sm" variant="outline">
              <RssIcon /> Follow an account or blog
            </Button>
          }
          title="Follow the company's account or blog"
          description="A Bluesky, Mastodon, Reddit or Hacker News profile, or the address of its blog, changelog or newsletter (Startica finds the feed)."
          fields={[{ name: "url", label: "Address", type: "text", required: true, placeholder: "https://blog.example.com" }]}
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
};

function ActivityItem({ item, showCompetitor }: { item: ActivityView; showCompetitor: boolean }) {
  const [open, setOpen] = useState(false);
  const long = item.text.length > 280;
  return (
    <li className={`flex flex-col gap-1 border-l-2 py-1 pl-3 ${item.seen ? "border-transparent" : "border-primary"}`}>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {!item.seen && <span className="font-medium text-primary">New</span>}
        {showCompetitor && item.competitor && <span className="font-medium text-foreground">{item.competitor}</span>}
        {/* The company's own posts: its name once. */}
        {!(showCompetitor && item.who === item.competitor) && <span>{item.who}</span>}
        <span>· {item.channel}</span>
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
    return <p className="text-sm text-muted-foreground">Nothing yet. Follow the company&apos;s accounts or blog, or people at it; Startica reads them every morning and when you add one.</p>;
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

// --- The digest ---------------------------------------------------------------------------------

export type DigestView = {
  id: string;
  status: "working" | "ready" | "failed";
  error: string | null;
  when: string;
  posts: number;
  seen: boolean;
  digest: { headline: string; items: { competitor: string; what: string; whyItMatters: string; urls: string[] }[]; suggestions: string[]; quiet: string[] } | null;
};

export function DigestControls({ productId, weekly, working, why }: { productId: string; weekly: boolean; working: boolean; why?: string }) {
  const [pending, run] = useAction();
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Why why={why}>
        <Button size="sm" disabled={pending || working || Boolean(why)} onClick={() => run(() => summarizeNow(productId), "Summarizing the last 7 days…")}>
          {working || pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          {working ? "Summarizing…" : "Summarize the last 7 days"}
        </Button>
      </Why>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={weekly}
          disabled={pending}
          onChange={(e) => {
            const on = e.target.checked;
            run(() => setWeekly(productId, on), on ? "A digest every Monday morning, while Startica is open." : "Weekly digest off.");
          }}
        />
        Every Monday morning
      </label>
    </div>
  );
}

export function DigestBody({ digest }: { digest: DigestView }) {
  const [pending, run] = useAction();
  if (digest.status === "failed") return <p className="text-sm text-destructive">The digest failed: {digest.error}</p>;
  if (digest.status === "working" || !digest.digest) return null;
  const d = digest.digest;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-medium">{d.headline}</p>
      {d.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {d.items.map((item, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <span>
                <span className="font-medium">{item.competitor}:</span> {item.what}
              </span>
              <span className="text-muted-foreground">{item.whyItMatters}</span>
              {item.urls.length > 0 && (
                <span className="flex flex-wrap gap-2 text-xs">
                  {item.urls.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                      {shortUrl(u)}
                    </a>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {d.suggestions.length > 0 && (
        <div>
          <p className="font-medium">What you could do</p>
          <ul className="list-disc pl-5">
            {d.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {d.quiet.length > 0 && <p className="text-xs text-muted-foreground">Quiet this week: {d.quiet.join(", ")}.</p>}
      <p className="text-xs text-muted-foreground">
        Written by AI from {digest.posts} posts, {digest.when}. Check the links before acting on it.
        {!digest.seen && (
          <Button size="xs" variant="ghost" className="ml-2" disabled={pending} onClick={() => run(() => digestSeen(digest.id))}>
            Mark as read
          </Button>
        )}
      </p>
    </div>
  );
}
