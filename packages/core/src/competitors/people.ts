import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { competitorAccounts, competitorPeople, type PersonLink, type PersonLinkKind } from "@startica/db/schema";
import { addBenchmarkAccount } from "../benchmarks/accounts.ts";
import { normalizeHandle, type SupportedChannel } from "../benchmarks/sources.ts";
import { cleanLinks, ownCompetitor } from "./research.ts";

/**
 * People at a competitor (ARCHITECTURE.md section 3, "Competitor watch"). Following someone turns
 * their readable links (Bluesky, Mastodon, Reddit, Hacker News, a blog or newsletter feed) into
 * followed accounts; LinkedIn, X, GitHub and the rest stay links the owner opens: LinkedIn has no
 * public way to read posts, and the owner decided against account lookups on X.
 */

/** Link kinds Startica reads, and the account channel each becomes. */
export const READABLE_LINKS: Partial<Record<PersonLinkKind, SupportedChannel>> = { bluesky: "bluesky", mastodon: "mastodon", reddit: "reddit", hackernews: "hackernews", rss: "rss" };

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

/** Follows each readable link that isn't followed yet; returns what couldn't be followed and why. */
async function followLinks(person: typeof competitorPeople.$inferSelect): Promise<string[]> {
  const existing = await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.personId, person.id));
  const problems: string[] = [];
  for (const l of person.links) {
    const channel = READABLE_LINKS[l.kind];
    if (!channel) continue;
    let handle: string;
    try {
      handle = normalizeHandle(channel, l.url).handle;
    } catch (error) {
      problems.push(`${LINK_LABEL[l.kind]}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (existing.some((a) => a.channel === channel && a.handle === handle)) continue;
    try {
      await addBenchmarkAccount(person.workspaceId, person.productId, { competitorId: person.competitorId, personId: person.id, channel, handle: l.url });
    } catch (error) {
      problems.push(`${LINK_LABEL[l.kind]}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return problems;
}

/** Adds someone the owner wants to follow, and follows their readable links. */
export async function addPerson(workspaceId: string, competitorId: string, input: z.input<typeof personInput>): Promise<{ id: string; problems: string[] }> {
  const c = await ownCompetitor(workspaceId, competitorId);
  const v = personInput.parse(input);
  const [row] = await getDb()
    .insert(competitorPeople)
    .values({ workspaceId, productId: c.productId, competitorId: c.id, name: v.name, role: v.role, why: v.why, links: parseLinks(v.links), status: "following", source: "owner" })
    .returning();
  return { id: row!.id, problems: await followLinks(row!) };
}

/** Changes a person's name, role, note and links; a followed person follows any new readable link (and drops removed ones). */
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
      const channel = READABLE_LINKS[l.kind];
      if (!channel) return [];
      try {
        return [`${channel} ${normalizeHandle(channel, l.url).handle}`];
      } catch {
        return [];
      }
    }),
  );
  for (const a of accounts) if (!wanted.has(`${a.channel} ${a.handle}`)) await getDb().delete(competitorAccounts).where(eq(competitorAccounts.id, a.id));
}

/** Follow a suggested (or ignored) person: their readable links start being read. */
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

/** Follows one of the competitor's own accounts or feeds (from its profile, or typed by the owner). */
export async function followCompanyLink(workspaceId: string, competitorId: string, url: string): Promise<string> {
  const c = await ownCompetitor(workspaceId, competitorId);
  const kind = linkKind(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
  const channel = READABLE_LINKS[kind] ?? (kind === "website" ? "rss" : null);
  if (!channel) throw new Error(`Startica can't read ${LINK_LABEL[kind]} accounts: open it from the profile instead`);
  return addBenchmarkAccount(workspaceId, c.productId, { competitorId: c.id, channel, handle: url });
}
