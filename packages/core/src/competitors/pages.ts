import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { competitorAccounts, competitorPages } from "@startica/db/schema";
import type { AccountPost } from "../benchmarks/sources.ts";
import { parseHTML } from "linkedom";
import { publicGet } from "../net/public-fetch.ts";
import { parseRobots, robotsAllows } from "../seo/robots.ts";
import { FEED_USER_AGENT } from "./feeds.ts";

/**
 * Watched pages (ARCHITECTURE.md section 3, "Competitor watch"): a competitor's pricing, changelog,
 * careers or docs page, a GitHub or YouTube page, a person's site. Read through the shared public
 * fetch with robots.txt honoured (RFC 9309, like Off-site), the main text kept, and a change past
 * MIN_CHANGE characters written as a post of kind "change" with what was added and removed.
 * Diffing and normalizing are pure.
 */

const ROBOTS_TOKEN = "StarticaCompetitorWatch";
const ACCEPT = "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5";
const MAX_BYTES = 2_000_000;
/** Added plus removed characters below this are noise (a counter, a date, a rotating quote). */
export const MIN_CHANGE = 80;
const CHANGE_TEXT = 2_000;
const MAX_TEXT = 20_000;

export type PageRead = { title: string; text: string; url: string };

const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, dt, dd, tr, th, td, blockquote, pre, figcaption, summary, div, section, article, br";

/**
 * A page's visible text, one block per line (so a diff names the paragraph, plan or row that
 * changed): the main element when there is one, without scripts, navigation, headers and footers.
 * Readability isn't used: it drops pricing tables and short pages.
 */
export function pageText(html: string): { title: string; text: string } {
  const { document } = parseHTML(html);
  const title = (document.querySelector("title")?.textContent ?? "").trim();
  for (const el of document.querySelectorAll("script, style, noscript, svg, template, iframe, nav, header, footer, aside, form, [aria-hidden='true']")) el.remove();
  const root = document.querySelector("main") ?? document.querySelector("[role='main']") ?? document.body;
  if (!root) return { title, text: "" };
  for (const el of root.querySelectorAll(BLOCKS)) el.append(document.createTextNode("\n"));
  const text = String(root.textContent ?? "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { title, text: text.slice(0, MAX_TEXT) };
}

/** Text that changes on every visit without meaning anything: dates, times, counts, whitespace. */
export function normalizePageText(text: string): string {
  return text
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, "<date>")
        .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}(, \d{4})?\b/gi, "<date>")
        .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/gi, "<time>")
        .replace(/\b\d+(\.\d+)?\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b/gi, "<ago>")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

export const pageHash = (normalized: string) => createHash("sha256").update(normalized).digest("hex");

/** Lines added and removed between two normalized texts (as sets of lines: moves don't count). */
export function diffLines(before: string, after: string): { added: string[]; removed: string[] } {
  const a = new Set(before.split("\n").filter(Boolean));
  const b = new Set(after.split("\n").filter(Boolean));
  return { added: [...b].filter((l) => !a.has(l)), removed: [...a].filter((l) => !b.has(l)) };
}

/** Whether a diff is worth a post. */
export const meaningful = (d: { added: string[]; removed: string[] }) => [...d.added, ...d.removed].reduce((n, l) => n + l.length, 0) >= MIN_CHANGE;

/** The change post's text: what was added, then what was removed, shortened. */
export function changeText(d: { added: string[]; removed: string[] }): string {
  const parts = [d.added.length ? `Added:\n${d.added.map((l) => `+ ${l}`).join("\n")}` : "", d.removed.length ? `Removed:\n${d.removed.map((l) => `- ${l}`).join("\n")}` : ""].filter(Boolean);
  const text = parts.join("\n\n");
  return text.length > CHANGE_TEXT ? `${text.slice(0, CHANGE_TEXT - 1)}…` : text;
}

const robotsCache = new Map<string, { at: number; groups: ReturnType<typeof parseRobots> | "unreachable" }>();

/** Reads a page's main text, or throws with a readable message (robots.txt, not public, an error). */
export async function readPage(url: string, signal?: AbortSignal): Promise<PageRead> {
  const get = (u: string) => publicGet(u, { userAgent: FEED_USER_AGENT, accept: ACCEPT, maxBytes: MAX_BYTES, signal });
  const u = new URL(url);
  let robots = robotsCache.get(u.origin);
  if (!robots || Date.now() - robots.at > 6 * 3_600_000) {
    // RFC 9309: a missing robots.txt (4xx) allows everything; one that can't be reached (5xx, network) allows nothing.
    const r = await get(`${u.origin}/robots.txt`);
    robots = { at: Date.now(), groups: r && r.status === 200 ? parseRobots(r.text) : r && r.status >= 400 && r.status < 500 ? [] : "unreachable" };
    robotsCache.set(u.origin, robots);
  }
  if (robots.groups === "unreachable") throw new Error("Its robots.txt couldn't be read, so Startica doesn't read the page");
  if (!robotsAllows(robots.groups, ROBOTS_TOKEN, `${u.pathname}${u.search}`)) throw new Error("The site's robots.txt asks crawlers not to read this page");
  const res = await get(url);
  if (!res) throw new Error("Startica can't read that address (it isn't public, or it didn't answer)");
  if (res.status >= 400) throw new Error(`The page answered ${res.status}`);
  if (!/html|text\/plain/i.test(res.contentType) && res.contentType) throw new Error(`Not a web page (${res.contentType.split(";")[0]})`);
  const page = /text\/plain/i.test(res.contentType) ? { title: "", text: res.text.slice(0, MAX_TEXT) } : pageText(res.text);
  if (page.text.length < 40) throw new Error("The page shows almost no text without running scripts");
  return { ...page, url: res.url };
}

/** Clears the robots.txt cache (tests). */
export const resetRobotsCache = () => robotsCache.clear();

/**
 * Compares a fresh read with the last one and stores it. Returns the change as a post, or none:
 * on the first read (that's the baseline), when the text is the same, or when the change is noise.
 */
export async function pageChange(account: typeof competitorAccounts.$inferSelect, read: PageRead, now: Date): Promise<AccountPost[]> {
  const db = getDb();
  const normalized = normalizePageText(read.text);
  const hash = pageHash(normalized);
  const [last] = await db.select().from(competitorPages).where(eq(competitorPages.accountId, account.id));
  const values = { hash, title: read.title, text: normalized, fetchedAt: now, updatedAt: now };
  if (!last) {
    await db.insert(competitorPages).values({ workspaceId: account.workspaceId, accountId: account.id, ...values });
    return [];
  }
  if (last.hash === hash) {
    await db.update(competitorPages).set({ fetchedAt: now }).where(eq(competitorPages.id, last.id));
    return [];
  }
  const diff = diffLines(last.text, normalized);
  // Noise isn't stored as the new baseline either, so small edits add up until they're worth a post.
  if (!meaningful(diff)) return [];
  await db.update(competitorPages).set(values).where(eq(competitorPages.id, last.id));
  return [{ externalId: `change:${hash}`, url: read.url, title: `Changed: ${read.title || read.url}`, text: changeText(diff), kind: "change", postedAt: now, engagement: null }];
}

/** The page's last read text (for its brief). */
export async function lastPageText(accountId: string): Promise<{ title: string; text: string } | null> {
  const [row] = await getDb().select({ title: competitorPages.title, text: competitorPages.text }).from(competitorPages).where(eq(competitorPages.accountId, accountId));
  return row ?? null;
}
