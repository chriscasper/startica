import type { PageSeo } from "@startica/db/schema";
import type { SeoFacts } from "../a11y/scanner.ts";
import { normalizeUrl } from "../a11y/urls.ts";
import type { SeoRuleId } from "./rules.ts";

/** One finding before it's stored: a rule, what groups it with others, and details for the UI. */
export type SeoFindingDraft = { rule: SeoRuleId; groupKey: string; detail: Record<string, unknown> };

// Properties search engines need before they use a structured-data type (a practical subset).
const REQUIRED: Record<string, string[][]> = {
  Organization: [["name"], ["url"]],
  WebSite: [["name"], ["url"]],
  Product: [["name"], ["offers", "review", "aggregateRating"]],
  SoftwareApplication: [["name"], ["offers"]],
  FAQPage: [["mainEntity"]],
  Article: [["headline"]],
  BlogPosting: [["headline"]],
  BreadcrumbList: [["itemListElement"]],
};

type JsonLdNode = Record<string, unknown>;

/** Reads the page's JSON-LD blocks: the schema.org types found, invalid blocks, and nodes missing required properties. */
export function readStructuredData(blocks: string[]) {
  const types = new Set<string>();
  const invalid: number[] = [];
  const incomplete: { type: string; missing: string[] }[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const n = node as JsonLdNode;
    if (Array.isArray(n["@graph"])) (n["@graph"] as unknown[]).forEach(visit);
    const nodeTypes = ([] as unknown[]).concat(n["@type"] ?? []).filter((t): t is string => typeof t === "string");
    for (const type of nodeTypes) {
      types.add(type);
      const missing = (REQUIRED[type] ?? []).filter((anyOf) => !anyOf.some((p) => n[p] != null && n[p] !== "")).map((anyOf) => anyOf.join(" or "));
      if (missing.length) incomplete.push({ type, missing });
    }
  };
  blocks.forEach((text, i) => {
    try {
      visit(JSON.parse(text));
    } catch {
      invalid.push(i + 1);
    }
  });
  return { types: [...types], invalid, incomplete };
}

const noindexIn = (value: string | null) => Boolean(value && /\bnoindex\b|\bnone\b/i.test(value));

/** What the scan stores about a page for search, from the in-page facts and the response header. */
export function pageSeo(facts: SeoFacts | undefined, xRobotsTag: string | null): PageSeo | null {
  if (!facts) return null;
  return {
    description: facts.description,
    canonical: facts.canonical,
    robots: facts.robots,
    xRobotsTag,
    h1: facts.h1,
    ogTitle: facts.ogTitle,
    ogImage: facts.ogImage,
    structuredTypes: readStructuredData(facts.jsonLd).types,
    wordCount: facts.wordCount,
  };
}

/** Checks one page on its own (cross-page checks like duplicates and broken links run when the scan finishes). */
export function pageFindings(page: { url: string; title: string | null; inSitemap: boolean }, seo: PageSeo, jsonLd: string[]): SeoFindingDraft[] {
  const out: SeoFindingDraft[] = [];
  const add = (rule: SeoRuleId, detail: Record<string, unknown> = {}, groupKey: string = rule) => out.push({ rule, groupKey, detail });
  const title = page.title?.trim() ?? "";
  if (!title) add("title-missing");
  else if (title.length > 60) add("title-too-long", { title, length: title.length });
  else if (title.length < 10) add("title-too-short", { title, length: title.length });
  const description = seo.description?.trim() ?? "";
  if (!description) add("description-missing");
  else if (description.length > 160) add("description-too-long", { length: description.length });
  if (seo.h1.length === 0) add("h1-missing");
  else if (seo.h1.length > 1) add("h1-multiple", { headings: seo.h1 });
  const noindex = noindexIn(seo.robots) || noindexIn(seo.xRobotsTag);
  if (noindex) add(page.inSitemap ? "noindex-in-sitemap" : "noindex", { from: noindexIn(seo.xRobotsTag) ? "X-Robots-Tag header" : "robots meta tag" });
  const canonical = seo.canonical ? normalizeUrl(seo.canonical) : null;
  if (canonical && canonical !== normalizeUrl(page.url)) add("canonical-elsewhere", { canonical });
  const data = readStructuredData(jsonLd);
  if (data.invalid.length) add("jsonld-invalid", { blocks: data.invalid });
  for (const gap of data.incomplete) add("jsonld-incomplete", gap, `jsonld-incomplete:${gap.type}`);
  return out;
}

/** "this exact text" groups for duplicate titles and descriptions. */
export function duplicateGroups(pages: { id: string; value: string | null }[]): Map<string, string[]> {
  const byValue = new Map<string, string[]>();
  for (const p of pages) {
    const v = p.value?.trim().toLowerCase();
    if (!v) continue;
    byValue.set(v, [...(byValue.get(v) ?? []), p.id]);
  }
  return new Map([...byValue].filter(([, ids]) => ids.length > 1));
}

/** Whether an llms.txt looks like the convention: a Markdown # title first. */
export function llmsTxtValid(text: string): boolean {
  return /^\s*#\s+\S/.test(text);
}
