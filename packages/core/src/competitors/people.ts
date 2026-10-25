import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { competitorAccounts, competitorPeople, type PersonLink, type PersonLinkKind } from "@startica/db/schema";
import { addBenchmarkAccount } from "../benchmarks/accounts.ts";
import { normalizeHandle, type SupportedChannel } from "../benchmarks/sources.ts";
import { cleanLinks, ownCompetitor } from "./research.ts";

/**
 * People at a competitor (ARCHITECTURE.md section 3, "Competitor watch"). Following someone turns
 * every link of theirs into a followed account: Bluesky, Mastodon, Reddit and Hacker News are read
 * through their public APIs, a blog or site through its feed (else watched as a page), GitHub,
 * YouTube and other pages are watched for changes, and LinkedIn and X are only briefed from web
 * search: their pages need a login and their robots.txt asks crawlers to stay out (owner decision
 * 2026-10-24), and the owner decided against account lookups on X.
 */

/** The account channel each kind of link becomes when followed. */
export const LINK_CHANNEL: Record<PersonLinkKind, SupportedChannel> = {
  bluesky: "bluesky",
  mastodon: "mastodon",
  reddit: "reddit",
  hackernews: "hackernews",
  rss: "rss",
  website: "rss",
  linkedin: "search",
  x: "search",
  github: "page",
  youtube: "page",
  other: "page",
};

/**
 * The channel a link is followed on. A website's homepage or blog-like address is read through its
 * feed; any other address on it (a pricing or careers page) is watched as a page, so a feed the
 * site points to doesn't take its place.
 */
export function linkChannel(l: PersonLink): SupportedChannel {
  if (l.kind !== "website") return LINK_CHANNEL[l.kind];
  let path = "/";
  try {
    path = new URL(l.url).pathname;
  } catch {
    // parseLinks and cleanLinks keep only URLs that parse
  }
  return path === "/" || /\/(blog|news|changelog|updates|releases|posts|articles|newsletter|journal)(\/|$)/i.test(path) ? "rss" : "page";
}

/** How Startica follows each kind of link, for the UI. */
export const LINK_HOW: Record<SupportedChannel, string> = {
  bluesky: "posts",
  mastodon: "posts",
  reddit: "posts",
  hackernews: "posts",
  rss: "new posts, or changes when there's no feed",
  page: "changes on the page",
  search: "web search (the page itself isn't read)",
};

export const LINK_LABEL: Record<PersonLinkKind, string> = {
  linkedin: "LinkedIn",
  x: "X",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  reddit: "Reddit",
  hackernews: "Hacker News",
  rss: "Blog or newsletter",
  github: "GitHub",
  youtube: "YouTube",
  website: "Website",
  other: "Link",
};

/** The kind of a pasted profile link, from its address. */
export function linkKind(url: string): PersonLinkKind {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "other";
  }
  if (host.endsWith("linkedin.com")) return "linkedin";
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host === "bsky.app") return "bluesky";
  if (host.endsWith("reddit.com")) return "reddit";
  if (host === "news.ycombinator.com") return "hackernews";
  if (host === "github.com") return "github";
  if (host === "youtube.com" || host === "youtu.be") return "youtube";
  if (/\/@[\w.-]+\/?$/.test(new URL(url).pathname)) return "mastodon";
  if (host.endsWith("substack.com") || /\/(feed|rss)(\.xml)?\/?$|\.(rss|atom)$|(atom|rss|feed)\.xml$/.test(new URL(url).pathname)) return "rss";
  return "website";
}

/** Links typed one per line (or pasted), each with its kind guessed from the address. */
export function parseLinks(text: string): PersonLink[] {
  return cleanLinks(
    text
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (/^https?:\/\//i.test(l) ? l : `https://${l}`))
      .map((url) => ({ kind: linkKind(url), url })),
  );
}

export const personInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  role: z.string().trim().max(160).default(""),
  why: z.string().trim().max(400).default(""),
  links: z.string().max(4000).default(""),
});

async function ownPerson(workspaceId: string, personId: string) {
  const [row] = await getDb()
    .select()
    .from(competitorPeople)
    .where(and(eq(competitorPeople.id, personId), eq(competitorPeople.workspaceId, workspaceId)));
  if (!row) throw new Error("Person not found");
  return row;
}

/** Follows each link that isn't followed yet; returns what couldn't be followed and why. */
async function followLinks(person: typeof competitorPeople.$inferSelect): Promise<string[]> {
  const existing = await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.personId, person.id));
  const problems: string[] = [];
  for (const l of person.links) {
    const channel = linkChannel(l);
    let handle: string;
    try {
      handle = normalizeHandle(channel, l.url).handle;
    } catch (error) {
      problems.push(`${LINK_LABEL[l.kind]}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    // A website already followed may have become a watched page.
    if (existing.some((a) => a.handle === handle && (a.channel === channel || (channel === "rss" && a.channel === "page")))) continue;
    try {
      await addBenchmarkAccount(person.workspaceId, person.productId, { competitorId: person.competitorId, personId: person.id, channel, handle: l.url });
    } catch (error) {
      problems.push(`${LINK_LABEL[l.kind]}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return problems;
}

/** Adds someone the owner wants to follow, and follows their links. */
export async function addPerson(workspaceId: string, competitorId: string, input: z.input<typeof personInput>): Promise<{ id: string; problems: string[] }> {
  const c = await ownCompetitor(workspaceId, competitorId);
  const v = personInput.parse(input);
  const [row] = await getDb()
    .insert(competitorPeople)
    .values({ workspaceId, productId: c.productId, competitorId: c.id, name: v.name, role: v.role, why: v.why, links: parseLinks(v.links), status: "following", source: "owner" })
    .returning();
  return { id: row!.id, problems: await followLinks(row!) };
}

/** Changes a person's name, role, note and links; a followed person follows any new link (and drops removed ones). */
export async function updatePerson(workspaceId: string, personId: string, input: z.input<typeof personInput>): Promise<string[]> {
  const person = await ownPerson(workspaceId, personId);
  const v = personInput.parse(input);
  const links = parseLinks(v.links);
  const [row] = await getDb().update(competitorPeople).set({ name: v.name, role: v.role, why: v.why, links }).where(eq(competitorPeople.id, person.id)).returning();
  if (person.status !== "following") return [];
  await dropUnlinkedAccounts(row!);
  return followLinks(row!);
}

/** Accounts whose link was removed from the person. */
async function dropUnlinkedAccounts(person: typeof competitorPeople.$inferSelect) {
  const accounts = await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.personId, person.id));
  const wanted = new Set(
    person.links.flatMap((l) => {
      const channel = linkChannel(l);
      try {
        const { handle } = normalizeHandle(channel, l.url);
        return channel === "rss" ? [`rss ${handle}`, `page ${handle}`] : [`${channel} ${handle}`];
      } catch {
        return [];
      }
    }),
  );
  for (const a of accounts) if (!wanted.has(`${a.channel} ${a.handle}`)) await getDb().delete(competitorAccounts).where(eq(competitorAccounts.id, a.id));
}

/** Follow a suggested (or ignored) person: their links start being read. */
export async function followPerson(workspaceId: string, personId: string): Promise<string[]> {
  const person = await ownPerson(workspaceId, personId);
  const [row] = await getDb().update(competitorPeople).set({ status: "following" }).where(eq(competitorPeople.id, person.id)).returning();
  return followLinks(row!);
}

/** Stop following (or dismiss a suggestion): their accounts and posts go; the person stays, ignored, so research doesn't suggest them again. */
export async function ignorePerson(workspaceId: string, personId: string): Promise<void> {
  const person = await ownPerson(workspaceId, personId);
  await getDb().delete(competitorAccounts).where(eq(competitorAccounts.personId, person.id));
  await getDb().update(competitorPeople).set({ status: "ignored" }).where(eq(competitorPeople.id, person.id));
}

export async function removePerson(workspaceId: string, personId: string): Promise<void> {
  const person = await ownPerson(workspaceId, personId);
  await getDb().delete(competitorPeople).where(eq(competitorPeople.id, person.id));
}

/** Follows one of the competitor's own accounts, feeds or pages (from its profile, or typed by the owner). */
export async function followCompanyLink(workspaceId: string, competitorId: string, url: string): Promise<string> {
  const c = await ownCompetitor(workspaceId, competitorId);
  const address = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  return addBenchmarkAccount(workspaceId, c.productId, { competitorId: c.id, channel: linkChannel({ kind: linkKind(address), url: address }), handle: url });
}
