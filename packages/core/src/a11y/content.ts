import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import { keywords, products, siteFindings, sitePages, sites, type ContentRule, type PageReadability } from "@startica/db/schema";
import type { ScanResponse } from "./scanner.ts";

/**
 * Content quality on each page (ARCHITECTURE.md section 9.6, A5): misspellings, readability and
 * the owner's own content rules, from the page's main text and the selectors the in-page
 * script counted. Local and free; English only for spelling and readability.
 */

type Site = typeof sites.$inferSelect;
type Tx = Parameters<Parameters<typeof transaction>[0]>[0];

const MAX_MISSPELLINGS_PER_PAGE = 50;
const MIN_WORDS_FOR_READABILITY = 100;

// --- Spelling (nspell with the Hunspell English dictionary, loaded once)

type Speller = { correct(word: string): boolean; suggest(word: string): string[] };
let speller: Promise<Speller> | undefined;

async function loadSpeller(): Promise<Speller> {
  const [{ default: dictionary }, { default: nspell }] = await Promise.all([import("dictionary-en"), import("nspell")]);
  return nspell({ aff: Buffer.from(dictionary.aff), dic: Buffer.from(dictionary.dic) });
}
export const getSpeller = () => (speller ??= loadSpeller());

const WORD = /[\p{L}][\p{L}'’]*/gu;

const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'’._/@-]*/gu;

/**
 * Words worth checking: lowercase words of 3+ letters. Capitalized words (names,
 * products, sentence starts), all-caps acronyms, words with digits, file names and code
 * ("robots.txt", "html-has-lang") and apostrophe-s are skipped: fewer misses would mean
 * many false alarms.
 */
export function candidateWords(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(TOKEN)) {
    const w = m[0].replace(/[.'’-]+$/, "").replace(/[’']s?$/, "");
    if (w.length < 3 || w !== w.toLowerCase() || !/^\p{L}[\p{L}'’]*$/u.test(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return counts;
}

export async function misspellings(text: string, known: Set<string>): Promise<{ word: string; count: number; suggestions: string[] }[]> {
  const spell = await getSpeller();
  const out: { word: string; count: number; suggestions: string[] }[] = [];
  for (const [word, count] of candidateWords(text)) {
    if (known.has(word) || spell.correct(word)) continue;
    out.push({ word, count, suggestions: spell.suggest(word).slice(0, 3) });
    if (out.length >= MAX_MISSPELLINGS_PER_PAGE) break;
  }
  return out;
}

/** Words the site knows: the ignore list, plus the product's name and keywords. */
export async function knownWords(site: Site): Promise<Set<string>> {
  const db = getDb();
  const [product] = await db.select({ name: products.name }).from(products).where(eq(products.id, site.productId));
  const kws = await db.select({ phrase: keywords.keyword }).from(keywords).where(eq(keywords.productId, site.productId));
  const words = [...site.spellingIgnore, product?.name ?? "", ...kws.map((k) => k.phrase)].join(" ").toLowerCase();
  return new Set(words.match(WORD) ?? []);
}

// --- Readability (Flesch reading ease and Flesch–Kincaid grade)

/** Syllables in an English word, by vowel groups (an estimate, like every readability tool's). */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

export function readability(text: string): PageReadability | null {
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  if (words.length < MIN_WORDS_FOR_READABILITY) return null;
  const sentences = Math.max(1, text.split(/[.!?]+(?:\s|$)|\n{2,}/).filter((s) => /[A-Za-z]/.test(s)).length);
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const wps = words.length / sentences;
  const spw = syl / words.length;
  return {
    ease: Math.round(Math.min(100, Math.max(0, 206.835 - 1.015 * wps - 84.6 * spw)) * 10) / 10,
    grade: Math.round(Math.min(20, Math.max(0, 0.39 * wps + 11.8 * spw - 15.59)) * 10) / 10,
    words: words.length,
    sentences,
  };
}

// --- Content rules

export const ruleInput = z.object({
  name: z.string().trim().min(1, "Name the rule").max(80),
  kind: z.enum(["text_contains", "text_missing", "selector_exists", "selector_missing", "links_to"]),
  value: z.string().trim().min(1, "Give the text, selector or domain to look for").max(300),
});

export const RULE_KIND_LABEL: Record<ContentRule["kind"], string> = {
  text_contains: "Text that shouldn't appear",
  text_missing: "Text every page should have",
  selector_exists: "Element that shouldn't appear (CSS selector)",
  selector_missing: "Element every page should have (CSS selector)",
  links_to: "Links to a domain",
};

export const MAX_RULES = 20;

/** The selectors the in-page script should count for a site's rules. */
export const policySelectors = (site: Pick<Site, "contentRules">) => (site.contentRules ?? []).filter((r) => r.kind === "selector_exists" || r.kind === "selector_missing").map((r) => r.value);

/** Text to match: "/regex/flags" is a regular expression; anything else matches case-insensitively as plain text. */
export function textMatcher(value: string): (text: string) => number {
  const re = /^\/(.+)\/([gimsuy]*)$/.exec(value);
  if (re) {
    try {
      const pattern = new RegExp(re[1]!, re[2]!.includes("g") ? re[2] : `${re[2]}g`);
      return (text) => text.slice(0, 30000).match(pattern)?.length ?? 0;
    } catch {
      return () => 0;
    }
  }
  const needle = value.toLowerCase();
  return (text) => text.toLowerCase().split(needle).length - 1;
}

/** Which of the site's rules this page breaks, with what it saw. */
export function ruleMatches(rules: ContentRule[], page: { text: string; links: string[]; selectorCounts: number[] }): { rule: ContentRule; detail: Record<string, unknown> }[] {
  const out: { rule: ContentRule; detail: Record<string, unknown> }[] = [];
  let sel = 0;
  for (const rule of rules) {
    if (rule.kind === "text_contains" || rule.kind === "text_missing") {
      const n = textMatcher(rule.value)(page.text);
      if (rule.kind === "text_contains" ? n > 0 : n === 0) out.push({ rule, detail: rule.kind === "text_contains" ? { matches: n } : {} });
    } else if (rule.kind === "selector_exists" || rule.kind === "selector_missing") {
      const n = page.selectorCounts[sel++] ?? 0;
      if (n === -1) out.push({ rule, detail: { invalid: true } });
      else if (rule.kind === "selector_exists" ? n > 0 : n === 0) out.push({ rule, detail: rule.kind === "selector_exists" ? { matches: n } : {} });
    } else {
      const domain = rule.value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const hits = page.links.filter((l) => {
        try {
          const h = new URL(l).hostname.toLowerCase();
          return h === domain || h.endsWith(`.${domain}`);
        } catch {
          return false;
        }
      });
      if (hits.length) out.push({ rule, detail: { matches: hits.length, links: hits.slice(0, 5) } });
    }
  }
  return out;
}

export async function addRule(workspaceId: string, siteId: string, input: z.infer<typeof ruleInput>): Promise<void> {
  const [site] = await getDb().select().from(sites).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
  if (!site) throw new Error("Site not found");
  const rules = site.contentRules ?? [];
  if (rules.length >= MAX_RULES) throw new Error(`At most ${MAX_RULES} rules a site`);
  await getDb().update(sites).set({ contentRules: [...rules, { id: randomUUID(), ...input }] }).where(eq(sites.id, siteId));
}

export async function removeRule(workspaceId: string, siteId: string, ruleId: string): Promise<void> {
  const [site] = await getDb().select().from(sites).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
  if (!site) throw new Error("Site not found");
  await getDb().update(sites).set({ contentRules: (site.contentRules ?? []).filter((r) => r.id !== ruleId) }).where(eq(sites.id, siteId));
  await getDb().delete(siteFindings).where(and(eq(siteFindings.siteId, siteId), eq(siteFindings.kind, "rule"), eq(siteFindings.key, ruleId)));
}

export async function ignoreWord(workspaceId: string, siteId: string, word: string): Promise<void> {
  const w = word.trim().toLowerCase();
  if (!/^[\p{L}'’-]{2,40}$/u.test(w)) throw new Error("That isn't a word");
  const [site] = await getDb().select().from(sites).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
  if (!site) throw new Error("Site not found");
  if (!site.spellingIgnore.includes(w)) await getDb().update(sites).set({ spellingIgnore: [...site.spellingIgnore, w].slice(-500) }).where(eq(sites.id, siteId));
  await getDb().delete(siteFindings).where(and(eq(siteFindings.siteId, siteId), eq(siteFindings.kind, "spelling"), eq(siteFindings.key, w)));
}

export async function setReadabilityTarget(workspaceId: string, siteId: string, grade: number): Promise<void> {
  if (!Number.isInteger(grade) || grade < 4 || grade > 16) throw new Error("Pick a grade between 4 and 16");
  await getDb().update(sites).set({ readabilityTarget: grade }).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
}

// --- Per page

const isEnglish = (lang: string | null | undefined) => !lang || /^en\b/i.test(lang);
/** The dictionary is US English: other English variants would flag their own spellings ("organisation"). */
const isUsEnglish = (lang: string | null | undefined) => !lang || /^en(-us)?$/i.test(lang);

export type PageContent = { findings: { kind: "spelling" | "readability" | "rule"; key: string; detail: Record<string, unknown> }[]; readability: PageReadability | null };

/** A page's content findings and readability, worked out before its transaction (spelling suggestions take a moment). */
export async function pageContent(site: Site, response: ScanResponse, known: Set<string>): Promise<PageContent> {
  const { result } = response;
  const text = result.text ?? "";
  const findings: PageContent["findings"] = [];
  let reading: PageReadability | null = null;
  if (isEnglish(result.lang) && text) {
    if (isUsEnglish(result.lang)) for (const m of await misspellings(text, known)) findings.push({ kind: "spelling", key: m.word, detail: { count: m.count, suggestions: m.suggestions } });
    reading = readability(text);
    if (reading && reading.grade > site.readabilityTarget) findings.push({ kind: "readability", key: "readability", detail: { ...reading, target: site.readabilityTarget } });
  }
  for (const m of ruleMatches(site.contentRules ?? [], { text, links: result.links ?? [], selectorCounts: result.selectorCounts ?? [] })) {
    findings.push({ kind: "rule", key: m.rule.id, detail: { name: m.rule.name, kind: m.rule.kind, value: m.rule.value, ...m.detail } });
  }
  return { findings, readability: reading };
}

/** Replaces a checked page's content findings and readability (inside the page's own transaction). */
export async function storePageContent(db: Tx, site: Site, page: { id: string }, content: PageContent): Promise<void> {
  await db.delete(siteFindings).where(eq(siteFindings.pageId, page.id));
  if (content.findings.length) await db.insert(siteFindings).values(content.findings.map((f) => ({ workspaceId: site.workspaceId, siteId: site.id, pageId: page.id, ...f })));
  await db.update(sitePages).set({ readability: content.readability }).where(eq(sitePages.id, page.id));
}
