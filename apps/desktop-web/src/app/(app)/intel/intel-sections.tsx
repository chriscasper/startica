"use client";

import { useTransition, type ReactNode } from "react";
import Link from "next/link";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { communityProblem } from "@startica/core/channels/formats";
import { FormDialog, type ActionResult, type Field } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addKeyword,
  deleteCommunity,
  deleteCompetitor,
  deleteKeyword,
  deletePersona,
  releaseBrief,
  saveBrief,
  saveCommunity,
  saveCompetitor,
  savePersona,
  setCommunityStatus,
} from "./actions";
import { channelLabel, channelOptions } from "@/lib/channels";

type Source = "ai" | "owner";

export type Brief = {
  summary: string;
  category: string;
  audience: string;
  problem: string;
  value_props: string[];
  differentiators: string[];
  positioning: string;
  pricing_notes: string;
  open_questions: string[];
};
export type Persona = { id: string; name: string; summary: string; pains: string[]; goals: string[]; hangouts: string[]; source: Source };
export type Competitor = {
  id: string;
  name: string;
  url: string | null;
  positioning: string;
  strengths: string[];
  weaknesses: string[];
  source: Source;
  /** Competitor watch: the research's state, and posts not seen yet. */
  researched: string | null;
  researching: boolean;
  unseen: number;
};
export type Keyword = { id: string; keyword: string; intent: string; use_for: string; source: Source };
export type Community = {
  id: string;
  channel: string;
  name: string;
  url: string | null;
  why: string;
  promo_rules: string;
  status: "suggested" | "watching" | "ignored";
  source: Source;
};

// --- Small shared pieces -----------------------------------------------------

function SourceBadge({ source }: { source: Source }) {
  return <Badge variant={source === "ai" ? "outline" : "secondary"}>{source === "ai" ? "AI" : "You"}</Badge>;
}

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const { error } = await fn();
      if (error) toast.error(error);
    });
  return [pending, run] as const;
}

function DeleteButton({ label, onDelete }: { label: string; onDelete: () => Promise<ActionResult> }) {
  const [pending, run] = useAction();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete ${label}`}
      disabled={pending}
      onClick={() => {
        if (window.confirm(`Delete ${label}?`)) run(onDelete);
      }}
    >
      <Trash2Icon />
    </Button>
  );
}

const editTrigger = (label: string) => (
  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${label}`}>
    <PencilIcon />
  </Button>
);

const addTrigger = (label: string) => (
  <Button variant="outline" size="sm">
    <PlusIcon />
    {label}
  </Button>
);

function List({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">None yet.</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

// --- Brief ------------------------------------------------------------------

const briefFields: Field[] = [
  { name: "summary", label: "Summary", type: "textarea" },
  { name: "category", label: "Category", type: "text" },
  { name: "audience", label: "Audience", type: "textarea", rows: 2 },
  { name: "problem", label: "Problem", type: "textarea", rows: 2 },
  { name: "positioning", label: "Positioning statement", type: "textarea" },
  { name: "value_props", label: "Value propositions", type: "lines" },
  { name: "differentiators", label: "Differentiators", type: "lines" },
  { name: "pricing_notes", label: "Pricing notes", type: "textarea", rows: 2 },
  { name: "open_questions", label: "Open questions", type: "lines" },
];

export function BriefSection({
  productId,
  brief,
  source,
}: {
  productId: string;
  brief: Brief | null;
  source: Source | null;
}) {
  const [pending, run] = useAction();
  if (!brief) return <EmptyState>No brief yet. Build intel to generate one, then edit it here.</EmptyState>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Product brief {source && <SourceBadge source={source} />}
        </CardTitle>
        <CardDescription>
          {source === "owner"
            ? "You've edited this brief, so rebuilds won't overwrite it."
            : "Written by Startica. Editing it marks it as yours, and rebuilds will keep your version."}
        </CardDescription>
        <CardAction className="flex gap-2">
          {source === "owner" && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => releaseBrief(productId))}>
              Let rebuilds update it
            </Button>
          )}
          <FormDialog
            trigger={<Button variant="outline" size="sm">Edit brief</Button>}
            title="Edit product brief"
            fields={briefFields}
            values={brief}
            action={(fd) => saveBrief(productId, fd)}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6">
        <p className="text-base leading-relaxed">{brief.summary}</p>
        <div className="grid gap-6 md:grid-cols-2">
          <Labeled label="Category">
            <p className="text-sm">{brief.category}</p>
          </Labeled>
          <Labeled label="Audience">
            <p className="text-sm">{brief.audience}</p>
          </Labeled>
          <Labeled label="Problem">
            <p className="text-sm">{brief.problem}</p>
          </Labeled>
          <Labeled label="Pricing">
            <p className="text-sm">{brief.pricing_notes}</p>
          </Labeled>
        </div>
        <Labeled label="Positioning">
          <blockquote className="border-l-2 pl-4 text-sm italic">{brief.positioning}</blockquote>
        </Labeled>
        <div className="grid gap-6 md:grid-cols-2">
          <Labeled label="Value propositions">
            <List items={brief.value_props} />
          </Labeled>
          <Labeled label="Differentiators">
            <List items={brief.differentiators} />
          </Labeled>
        </div>
        <Labeled label="Open questions for you">
          <List items={brief.open_questions} />
        </Labeled>
      </CardContent>
    </Card>
  );
}

// --- Personas ---------------------------------------------------------------

const personaFields: Field[] = [
  { name: "name", label: "Name", type: "text", required: true, placeholder: "Solo founder on a budget" },
  { name: "summary", label: "Summary", type: "textarea" },
  { name: "pains", label: "Pains", type: "lines" },
  { name: "goals", label: "Goals", type: "lines" },
  { name: "hangouts", label: "Where they hang out online", type: "lines" },
];

export function PersonasSection({ productId, personas }: { productId: string; personas: Persona[] }) {
  return (
    <div className="grid gap-4">
      <div>
        <FormDialog
          trigger={addTrigger("Add persona")}
          title="Add persona"
          fields={personaFields}
          action={(fd) => savePersona(productId, null, fd)}
        />
      </div>
      {personas.length === 0 && <EmptyState>No personas yet.</EmptyState>}
      <div className="grid gap-4 lg:grid-cols-2">
        {personas.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {p.name} <SourceBadge source={p.source} />
              </CardTitle>
              <CardDescription>{p.summary}</CardDescription>
              <CardAction className="flex">
                <FormDialog
                  trigger={editTrigger(p.name)}
                  title="Edit persona"
                  fields={personaFields}
                  values={p}
                  action={(fd) => savePersona(productId, p.id, fd)}
                />
                <DeleteButton label={p.name} onDelete={() => deletePersona(p.id)} />
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Labeled label="Pains">
                <List items={p.pains} />
              </Labeled>
              <Labeled label="Goals">
                <List items={p.goals} />
              </Labeled>
              <Labeled label="Hangouts">
                <List items={p.hangouts} />
              </Labeled>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// --- Competitors ------------------------------------------------------------

const competitorFields: Field[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "url", label: "Website", type: "url", placeholder: "https://" },
  { name: "positioning", label: "Positioning", type: "textarea" },
  { name: "strengths", label: "Strengths", type: "lines" },
  { name: "weaknesses", label: "Weaknesses", type: "lines" },
];

export function CompetitorsSection({ productId, competitors, canResearch }: { productId: string; competitors: Competitor[]; canResearch: boolean }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <FormDialog
          trigger={addTrigger("Add competitor")}
          title="Add competitor"
          description="Only the name is needed. With research on, Startica finds the rest on the web: pricing, features, recent changes, the people worth following and its blog."
          fields={canResearch ? [...competitorFields, { name: "research", label: "Research it in depth now (about $0.30 to $0.80)", type: "checkbox" }] : competitorFields}
          values={canResearch ? { research: "on" } : undefined}
          action={(fd) => saveCompetitor(productId, null, fd)}
        />
        <span className="text-xs text-muted-foreground">Open a competitor for its in-depth profile, the people at it, and what they post.</span>
      </div>
      {competitors.length === 0 ? (
        <EmptyState>No competitors yet.</EmptyState>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competitor</TableHead>
                  <TableHead>Positioning</TableHead>
                  <TableHead>Strengths</TableHead>
                  <TableHead>Weaknesses</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.map((c) => (
                  <TableRow key={c.id} className="align-top">
                    <TableCell className="font-medium whitespace-normal">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/intel/competitors/${c.id}`} className="underline-offset-4 hover:underline">
                          {c.name}
                        </Link>
                        <SourceBadge source={c.source} />
                        {c.unseen > 0 && <Badge>{c.unseen} new</Badge>}
                      </div>
                      <div className="mt-1 text-xs font-normal text-muted-foreground">
                        {c.researching ? "Researching…" : c.researched ? `Researched ${c.researched}` : "Not researched yet"}
                        {c.url && (
                          <>
                            {" · "}
                            <a href={c.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                              website
                            </a>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs text-sm whitespace-normal">{c.positioning}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      <List items={c.strengths} />
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      <List items={c.weaknesses} />
                    </TableCell>
                    <TableCell>
                      <div className="flex">
                        <FormDialog
                          trigger={editTrigger(c.name)}
                          title="Edit competitor"
                          fields={competitorFields}
                          values={{ name: c.name, url: c.url, positioning: c.positioning, strengths: c.strengths, weaknesses: c.weaknesses }}
                          action={(fd) => saveCompetitor(productId, c.id, fd)}
                        />
                        <DeleteButton label={c.name} onDelete={() => deleteCompetitor(c.id)} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Communities ------------------------------------------------------------


const communityFields: Field[] = [
  { name: "channel", label: "Channel", type: "select", options: channelOptions },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "startups (r/startups) · #photography@mastodon.social · a forum's name" },
  { name: "url", label: "URL (required for a Discourse forum: its address)", type: "url", placeholder: "https://" },
  { name: "why", label: "Why it matters", type: "textarea", rows: 2 },
  { name: "promo_rules", label: "Self-promotion rules", type: "textarea", rows: 2 },
];

function communityLabel(c: Community) {
  return c.channel === "reddit" ? `r/${c.name}` : c.name;
}

function CommunityStatus({ community }: { community: Community }) {
  const [pending, run] = useAction();
  const next = (status: Community["status"]) => run(() => setCommunityStatus(community.id, status));
  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant={community.status === "watching" ? "default" : "outline"}
        disabled={pending}
        onClick={() => next(community.status === "watching" ? "suggested" : "watching")}
      >
        Watch
      </Button>
      <Button
        size="sm"
        variant={community.status === "ignored" ? "secondary" : "ghost"}
        disabled={pending}
        onClick={() => next(community.status === "ignored" ? "suggested" : "ignored")}
      >
        Ignore
      </Button>
    </div>
  );
}

export function CommunitiesSection({ productId, communities }: { productId: string; communities: Community[] }) {
  const watching = communities.filter((c) => c.status === "watching").length;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <FormDialog
          trigger={addTrigger("Add community")}
          title="Add community"
          description="Communities you add are watched right away."
          fields={communityFields}
          values={{ channel: "reddit" }}
          action={(fd) => saveCommunity(productId, null, fd)}
        />
        <p className="text-sm text-muted-foreground">
          {watching} watched. Startica checks watched subreddits every hour for posts worth replying to.
        </p>
      </div>
      {communities.length === 0 && <EmptyState>No communities yet.</EmptyState>}
      <div className="grid gap-3">
        {communities.map((c) => (
          <Card key={c.id} size="sm" className={c.status === "ignored" ? "opacity-60" : undefined}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                    {communityLabel(c)}
                  </a>
                ) : (
                  communityLabel(c)
                )}
                <Badge variant="outline">{channelLabel(c.channel)}</Badge>
                <SourceBadge source={c.source} />
              </CardTitle>
              <CardDescription>
                {c.why}
                {communityProblem(c.channel, c.name, c.url) && <span className="block text-destructive">{communityProblem(c.channel, c.name, c.url)}</span>}
              </CardDescription>
              <CardAction className="flex items-center gap-1">
                <CommunityStatus community={c} />
                <FormDialog
                  trigger={editTrigger(communityLabel(c))}
                  title="Edit community"
                  fields={communityFields}
                  values={c}
                  action={(fd) => saveCommunity(productId, c.id, fd)}
                />
                <DeleteButton label={communityLabel(c)} onDelete={() => deleteCommunity(c.id)} />
              </CardAction>
            </CardHeader>
            {c.promo_rules && (
              <CardContent className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Self-promotion: </span>
                {c.promo_rules}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// --- Keywords ---------------------------------------------------------------

const keywordFields: Field[] = [
  { name: "keyword", label: "Keyword or phrase", type: "text", required: true },
  {
    name: "intent",
    label: "Intent",
    type: "select",
    options: [
      { value: "problem", label: "Problem (describes the pain)" },
      { value: "solution", label: "Solution (what they'd look for)" },
      { value: "competitor", label: "Competitor" },
      { value: "brand", label: "Brand (your own name)" },
    ],
  },
  {
    name: "use_for",
    label: "Use for",
    type: "select",
    options: [
      { value: "both", label: "Listening and SEO" },
      { value: "listening", label: "Listening only" },
      { value: "seo", label: "SEO only" },
    ],
  },
];

const intentOrder = ["problem", "solution", "competitor", "brand"] as const;

export function KeywordsSection({ productId, keywords }: { productId: string; keywords: Keyword[] }) {
  const [pending, run] = useAction();
  return (
    <div className="grid gap-4">
      <div>
        <FormDialog
          trigger={addTrigger("Add keyword")}
          title="Add keyword"
          fields={keywordFields}
          values={{ intent: "problem", use_for: "both" }}
          action={(fd) => addKeyword(productId, fd)}
        />
      </div>
      {keywords.length === 0 && <EmptyState>No keywords yet.</EmptyState>}
      {intentOrder.map((intent) => {
        const group = keywords.filter((k) => k.intent === intent);
        if (group.length === 0) return null;
        return (
          <Labeled key={intent} label={intent}>
            <div className="flex flex-wrap gap-2">
              {group.map((k) => (
                <Badge key={k.id} variant={k.source === "owner" ? "secondary" : "outline"} className="gap-1 py-1 pr-1">
                  {k.keyword}
                  <span className="text-muted-foreground">· {k.use_for}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${k.keyword}`}
                    disabled={pending}
                    className="rounded p-0.5 hover:bg-muted"
                    onClick={() => run(() => deleteKeyword(k.id))}
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </Labeled>
        );
      })}
    </div>
  );
}
