import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { aiVisibilityAnswers, aiVisibilityRuns, communities, competitors, offsitePages, products } from "@startica/db/schema";

/**
 * Off-site presence (ARCHITECTURE.md section 10.4): which sites AI answers in the product's category
 * lean on, from the recent AI visibility runs, and whether the product and its competitors
 * appear on them. Computed on every visit; what each cited page says is kept in
 * `offsite_pages` (read by the offsite_check job).
 */

/** How many recent finished runs to read citations from. */
export const RUNS = 4;

export type DomainKind = "own" | "competitor" | "community" | "directory" | "video" | "reference" | "article";

export const KIND_LABEL: Record<DomainKind, string> = {
  own: "Your site",
  competitor: "Competitor's site",
  community: "Community",
  directory: "Directory or reviews",
  video: "Video",
  reference: "Reference",
  article: "Article or blog",
};

// Kept by hostname suffix; anything else is an article or blog. Checked 2026-10-13.
const KNOWN: [RegExp, DomainKind][] = [
  [/(^|\.)(reddit\.com|news\.ycombinator\.com|stackexchange\.com|stackoverflow\.com|quora\.com|lemmy\.\w+|discord\.com|community\.\w+\.\w+)$/, "community"],
  [/(^|\.)(forum|forums|discuss|discourse|community)\./, "community"],
  [/(^|\.)(g2\.com|capterra\.com|getapp\.com|softwareadvice\.com|trustradius\.com|trustpilot\.com|producthunt\.com|alternativeto\.net|saashub\.com|sourceforge\.net|slant\.co|stackshare\.io|crozdesk\.com|apps\.apple\.com|play\.google\.com|chromewebstore\.google\.com|chrome\.google\.com)$/, "directory"],
  [/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|loom\.com)$/, "video"],
  [/(^|\.)(wikipedia\.org|wikimedia\.org|wiktionary\.org|britannica\.com|github\.com|gitlab\.com|developer\.mozilla\.org)$/, "reference"],
];

/** The site a URL belongs to, without `www.`. */
export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const sameSite = (domain: string, other: string | null) => Boolean(other && (domain === other || domain.endsWith(`.${other}`)));

export function classify(domain: string, ownDomain: string | null, competitorDomains: string[]): DomainKind {
  if (sameSite(domain, ownDomain)) return "own";
  if (competitorDomains.some((d) => sameSite(domain, d))) return "competitor";
  for (const [re, kind] of KNOWN) if (re.test(domain)) return kind;
  return "article";
}

/** "https://www.reddit.com/r/ecology/comments/…" → "ecology". */
export function subredditOf(url: string): string | null {
  const m = /^https?:\/\/(?:[a-z]+\.)?reddit\.com\/r\/([A-Za-z0-9_]{2,21})(?:\/|$)/.exec(url);
  return m ? m[1]! : null;
}

export type CitedPage = { url: string; title: string; answers: number; read: typeof offsitePages.$inferSelect | null };
export type CitedDomain = {
  domain: string;
  kind: DomainKind;
  /** Answers citing the domain, and those of them that didn't mention the product. */
  answers: number;
  answersWithoutYou: number;
  questions: string[];
  pages: CitedPage[];
  /** From the pages read: the product appears on at least one; which competitors appear. */
  youAppear: boolean | null;
  competitorsThere: string[];
  /** Reddit communities among the cited threads, and whether the Inbox already watches each. */
  subreddits: { name: string; watching: boolean }[];
  suggestion: string;
};

function suggestion(d: Omit<CitedDomain, "suggestion">, productName: string): string {
  const others = d.competitorsThere.length ? ` ${d.competitorsThere.join(", ")} ${d.competitorsThere.length === 1 ? "is" : "are"} there.` : "";
  switch (d.kind) {
    case "own":
      return "Answers already cite your own pages. Keep them current and specific: they're your best source.";
    case "competitor":
      return `A competitor's own pages answer these questions. Publish your own honest page on the same topics (Opportunities can outline a comparison).`;
    case "community":
      return d.subreddits.some((s) => !s.watching)
        ? `AI answers quote these threads. Watch the community (it joins Intel → Communities, which the Inbox scans) and take part where ${productName} genuinely helps; never astroturf.${others}`
        : `AI answers quote these threads. Take part where ${productName} genuinely helps, under your own name; never astroturf.${others}`;
    case "directory":
      if (d.youAppear === null) return `Check whether ${productName} is listed here; if not, list it or claim its listing, and ask happy users for honest reviews. Never pay for or fake reviews.`;
      return d.youAppear
        ? `${productName} is listed. Keep the listing complete and current, and ask happy users for honest reviews.${others}`
        : `List ${productName} here, or claim its listing, and ask happy users for honest reviews. Never pay for or fake reviews.${others}`;
    case "video":
      return `Answers cite videos here. A short, honest demo or how-to for the questions people ask can be cited too.${others}`;
    case "reference":
      return "A reference source. You can't add yourself to most of these; being notable and well documented elsewhere is what gets a product included.";
    default:
      if (d.youAppear === null) return `Not read yet. If it's a list, review or comparison that takes suggestions and ${productName} isn't in it, tell its author what ${productName} does and who it suits. Don't pay for placement.`;
      return d.youAppear
        ? `${productName} is already mentioned here.${others}`
        : `If it's a list, review or comparison that takes suggestions, tell its author what ${productName} does and who it suits. Don't pay for placement.${others}`;
  }
}

/** The domains cited in the product's recent AI visibility answers, most useful first. */
export async function citedDomains(productId: string): Promise<{ domains: CitedDomain[]; runs: number; answers: number }> {
  const db = getDb();
  const [product] = await db.select({ name: products.name, url: products.url }).from(products).where(eq(products.id, productId));
  if (!product) return { domains: [], runs: 0, answers: 0 };
  const runs = (
    await db
      .select({ id: aiVisibilityRuns.id, status: aiVisibilityRuns.status, metrics: aiVisibilityRuns.metrics })
      .from(aiVisibilityRuns)
      .where(eq(aiVisibilityRuns.productId, productId))
      .orderBy(asc(aiVisibilityRuns.startedAt))
  )
    .filter((r) => r.status !== "running" && (r.metrics?.answered ?? 0) > 0)
    .slice(-RUNS);
  if (runs.length === 0) return { domains: [], runs: 0, answers: 0 };
  const [answers, comps, read, watched] = await Promise.all([
    db
      .select({ promptText: aiVisibilityAnswers.promptText, citations: aiVisibilityAnswers.citations, mentioned: aiVisibilityAnswers.mentioned, error: aiVisibilityAnswers.error })
      .from(aiVisibilityAnswers)
      .where(inArray(aiVisibilityAnswers.runId, runs.map((r) => r.id))),
    db.select({ name: competitors.name, url: competitors.url }).from(competitors).where(eq(competitors.productId, productId)),
    db.select().from(offsitePages).where(eq(offsitePages.productId, productId)),
    db
      .select({ name: communities.name })
      .from(communities)
      .where(and(eq(communities.productId, productId), eq(communities.channel, "reddit"), eq(communities.status, "watching"))),
  ]);
  const ok = answers.filter((a) => !a.error);
  const own = product.url ? domainOf(product.url) : null;
  const compDomains = comps.map((c) => (c.url ? domainOf(c.url) : null)).filter((d): d is string => Boolean(d));
  const readByUrl = new Map(read.map((r) => [r.url, r]));
  const watching = new Set(watched.map((w) => w.name.toLowerCase()));

  type Acc = { answers: number; without: number; questions: Set<string>; pages: Map<string, { title: string; answers: number }> };
  const byDomain = new Map<string, Acc>();
  for (const a of ok) {
    const seen = new Set<string>();
    for (const c of a.citations) {
      const domain = domainOf(c.url);
      if (!domain) continue;
      const acc = byDomain.get(domain) ?? { answers: 0, without: 0, questions: new Set(), pages: new Map() };
      if (!seen.has(domain)) {
        seen.add(domain);
        acc.answers++;
        if (!a.mentioned) acc.without++;
        acc.questions.add(a.promptText);
      }
      const page = acc.pages.get(c.url) ?? { title: c.title || c.url, answers: 0 };
      page.answers++;
      acc.pages.set(c.url, page);
      byDomain.set(domain, acc);
    }
  }

  const domains: CitedDomain[] = [...byDomain].map(([domain, acc]) => {
    const pages = [...acc.pages].map(([url, p]) => ({ url, title: p.title, answers: p.answers, read: readByUrl.get(url) ?? null })).sort((a, b) => b.answers - a.answers);
    const readPages = pages.map((p) => p.read).filter((r): r is NonNullable<typeof r> => r?.status === "read");
    const subs = new Map<string, boolean>();
    for (const p of pages) {
      const s = subredditOf(p.url);
      if (s) subs.set(s, watching.has(s.toLowerCase()));
    }
    const base = {
      domain,
      kind: classify(domain, own, compDomains),
      answers: acc.answers,
      answersWithoutYou: acc.without,
      questions: [...acc.questions],
      pages,
      youAppear: readPages.length ? readPages.some((r) => r.mentionsProduct) : null,
      competitorsThere: [...new Set(readPages.flatMap((r) => r.competitors))],
      subreddits: [...subs].map(([name, w]) => ({ name, watching: w })),
    };
    return { ...base, suggestion: suggestion(base, product.name) };
  });
  // Where you're missing matters most: answers that cite the site without you, then all answers citing it.
  domains.sort((a, b) => Number(a.kind === "own") - Number(b.kind === "own") || b.answersWithoutYou - a.answersWithoutYou || b.answers - a.answers || a.domain.localeCompare(b.domain));
  return { domains, runs: runs.length, answers: ok.length };
}
