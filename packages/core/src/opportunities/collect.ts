import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { products, seoOpportunities, sitePages, sites, type DraftKind } from "@startica/db/schema";
import { SEO_RULES, type SeoRuleId } from "../seo/rules.ts";
import { siteSeoFindings } from "../seo/site.ts";
import { brandMatcher, expectedCtr, periods, topKeys } from "../search/report.ts";
import { namesProduct, productNames } from "../visibility/analysis.ts";
import { answersFor, listRuns } from "../visibility/questions.ts";

/**
 * Opportunities (ARCHITECTURE.md section 10.2): one ranked list of what to do to be found, built
 * by rules from Site health (G1), Search (G2) and AI visibility (G3). Computed fresh on
 * every visit, so it follows the latest data; what the owner did with each one is kept
 * by its stable key in `seo_opportunities`.
 */

export type Area = "search" | "site" | "ai";

export type Opportunity = {
  key: string;
  area: Area;
  title: string;
  /** Why it matters, with the numbers behind it. */
  why: string;
  /** What to do. */
  action: string;
  /** For ranking: roughly comparable across areas, higher first. */
  score: number;
  /** The figure shown with it, e.g. "~24 more clicks a month". */
  impact: string;
  /** Where to see the evidence. */
  href: string;
  /** The fix the AI can draft for it, if any. */
  draft?: { kind: DraftKind; pages?: string[]; question?: string; promptId?: string };
  /** A topic Content Studio can write a blog piece about. */
  brief?: { topic: string; guidance: string };
};

const META_RULES = new Set<SeoRuleId>(["title-missing", "title-too-long", "title-too-short", "title-duplicate", "description-missing", "description-too-long", "description-duplicate"]);
const JSONLD_RULES = new Set<SeoRuleId>(["jsonld-invalid", "jsonld-incomplete", "home-no-structured-data"]);
const LLMS_RULES = new Set<SeoRuleId>(["llms-missing", "llms-invalid"]);
const SITE_SCORE = { high: 70, medium: 45, low: 22 } as const;

const round = (n: number) => Math.max(0, Math.round(n));
/** Points for an estimated number of clicks: grows with the size, but slower (10 → 28, 60 → 47, 170 → 59). */
const gain = (clicks: number) => 8 * Math.log2(1 + Math.max(0, clicks));
const pathOf = (url: string) => {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
};

async function searchOpportunities(productId: string, productName: string, productUrl: string | null): Promise<Opportunity[]> {
  const p = await periods(productId, "google", 28);
  if (!p.newest) return [];
  const isBrand = brandMatcher([productName, ...productNames(productName, productUrl).slice(1)]);
  const [queries, pages] = await Promise.all([
    topKeys(productId, "google", "query", p.current, p.previous, { isBrand, limit: 500 }),
    topKeys(productId, "google", "page", p.current, p.previous, { limit: 200 }),
  ]);
  const out: Opportunity[] = [];
  // A month of clicks the query would get near the top (position ~3), beyond what it gets now.
  for (const q of queries.filter((q) => q.flags.includes("striking") && !q.brand).slice(0, 15)) {
    const extra = round(q.current.impressions * (expectedCtr(3) - q.current.ctr));
    if (extra < 3) continue;
    out.push({
      key: `query:${q.key}`,
      area: "search",
      title: `Move “${q.key}” up to page 1`,
      why: `${q.current.impressions.toLocaleString("en-US")} impressions in 28 days at position ${q.current.position.toFixed(1)}, ${q.current.clicks} clicks. Near the top it would get about ${extra} more.`,
      action: "Strengthen the page that ranks for it (answer the query in its heading and first paragraph, link to it from related pages), or write a page that answers it directly.",
      score: 30 + gain(extra),
      impact: `~${extra} more clicks a month`,
      href: `/seo/search?filter=striking`,
      brief: {
        topic: q.key,
        guidance: `A blog article that fully answers the search "${q.key}". People searching it find the site around position ${q.current.position.toFixed(0)}; make this the best answer on the web for it: answer it in the first paragraph, then go deeper, with practical examples.`,
      },
    });
  }
  for (const pg of pages.filter((pg) => pg.flags.includes("low_ctr")).slice(0, 10)) {
    const extra = round(pg.current.impressions * (expectedCtr(pg.current.position) - pg.current.ctr));
    if (extra < 3) continue;
    out.push({
      key: `ctr:${pg.key}`,
      area: "search",
      title: `Rewrite the title and description of ${pathOf(pg.key)}`,
      why: `Shown ${pg.current.impressions.toLocaleString("en-US")} times at position ${pg.current.position.toFixed(1)}, but only ${(pg.current.ctr * 100).toFixed(1)}% click: fewer than usual for that position.`,
      action: "Write a title and meta description that match what people search for and say why to click.",
      score: 28 + gain(extra),
      impact: `~${extra} more clicks a month`,
      href: `/seo/search`,
      draft: { kind: "meta", pages: [pg.key] },
    });
  }
  // Pages that had clicks before but none now (dropped out of search) aren't in `pages`: add them from the earlier period.
  const earlier = p.previousComplete ? await topKeys(productId, "google", "page", p.previous, p.previous, { limit: 200 }) : [];
  const now = new Set(pages.map((pg) => pg.key));
  const vanished = earlier.filter((e) => !now.has(e.key)).map((e) => ({ ...e, previousClicks: e.current.clicks, current: { ...e.current, clicks: 0 } }));
  for (const pg of [...pages, ...vanished]) {
    const lost = pg.previousClicks - pg.current.clicks;
    if (!p.previousComplete || lost < 10 || lost < pg.previousClicks * 0.3) continue;
    out.push({
      key: `losing:${pg.key}`,
      area: "search",
      title: `Find out why ${pathOf(pg.key)} lost clicks`,
      why: `${pg.current.clicks} clicks in the last 28 days, down from ${pg.previousClicks} (${Math.round((lost / pg.previousClicks) * 100)}% fewer).`,
      action: "Check whether the page changed, went missing or got a noindex, and which of its queries dropped in Search Console's Performance report.",
      score: 25 + gain(lost),
      impact: `${lost} clicks lost`,
      href: `/seo/search`,
    });
  }
  return out;
}

async function siteOpportunities(productId: string): Promise<Opportunity[]> {
  const db = getDb();
  const productSites = await db.select({ id: sites.id, name: sites.name }).from(sites).where(eq(sites.productId, productId)).orderBy(asc(sites.createdAt));
  const out: Opportunity[] = [];
  for (const site of productSites) {
    const rows = await siteSeoFindings(site.id);
    const byRule = new Map<SeoRuleId, string[]>();
    for (const { finding, url } of rows) {
      const rule = finding.rule as SeoRuleId;
      const meta = SEO_RULES[rule];
      if (!meta || meta.severity === "info") continue;
      const list = byRule.get(rule) ?? [];
      if (url && !list.includes(url)) list.push(url);
      byRule.set(rule, list);
    }
    for (const [rule, urls] of byRule) {
      const meta = SEO_RULES[rule];
      if (meta.severity === "info") continue;
      const pages = urls.length;
      const draft: Opportunity["draft"] = META_RULES.has(rule)
        ? { kind: "meta", pages: urls.slice(0, 5) }
        : JSONLD_RULES.has(rule)
          ? { kind: "jsonld", pages: urls.slice(0, 1) }
          : LLMS_RULES.has(rule)
            ? { kind: "llms_txt" }
            : undefined;
      out.push({
        key: `site:${site.id}:${rule}`,
        area: "site",
        title: meta.title,
        why: `${meta.why}${pages ? ` On ${pages === 1 ? "1 page" : `${pages} pages`}${productSites.length > 1 ? ` of ${site.name}` : ""}.` : ""}`,
        action: meta.fix,
        score: SITE_SCORE[meta.severity] + Math.min(10, pages),
        impact: `${meta.severity} · ${pages ? (pages === 1 ? "1 page" : `${pages} pages`) : "site-wide"}`,
        href: `/seo/health?site=${site.id}#${rule}`,
        draft,
      });
    }
  }
  return out;
}

async function aiOpportunities(productId: string, productName: string, productUrl: string | null): Promise<Opportunity[]> {
  const latest = (await listRuns(productId, 10)).find((r) => r.status !== "running" && r.metrics && r.metrics.answered > 0);
  if (!latest) return [];
  const answers = (await answersFor([latest.id])).filter((a) => !a.error);
  const names = productNames(productName, productUrl);
  const out: Opportunity[] = [];
  // Questions where assistants name competitors but not the product.
  const gaps = answers.filter((a) => !a.mentioned && a.competitors.length > 0).sort((a, b) => b.competitors.length - a.competitors.length);
  for (const a of gaps.slice(0, 12)) {
    const comparison = /\b(vs\.?|versus|alternatives?|instead of|compared?|better than)\b/i.test(a.promptText);
    out.push({
      key: `ai:${a.promptText.toLowerCase()}`,
      area: "ai",
      title: `Get into AI answers for “${a.promptText}”`,
      why: `Asked on ${latest.startedAt.toISOString().slice(0, 10)}, the assistant named ${a.competitors.join(", ")} but not ${productName}.`,
      action: comparison
        ? "Publish an honest comparison or alternatives page for this question, and an FAQ answer on your site that AI assistants can cite."
        : "Answer this question on your site in plain words (an FAQ entry or a section on the relevant page), so assistants that search the web can find and cite it.",
      score: 32 + a.competitors.length * 6,
      impact: `${a.competitors.length} competitor${a.competitors.length === 1 ? "" : "s"} named instead`,
      href: `/seo/ai`,
      draft: { kind: "faq", question: a.promptText, promptId: a.promptId ?? undefined },
      brief: comparison
        ? {
            topic: a.promptText,
            guidance: `An honest comparison article answering "${a.promptText}". AI assistants currently recommend ${a.competitors.join(", ")} for it. Compare fairly, say who each option suits, and where ${productName} fits best.`,
          }
        : undefined,
    });
  }
  // Comparison and "best of" pages the answers lean on, where the product isn't mentioned.
  const cited = new Map<string, { title: string; count: number }>();
  for (const a of answers.filter((x) => !x.mentioned)) {
    // Each page counts once per answer, however often that answer cites it.
    for (const c of new Map(a.citations.map((c) => [c.url, c])).values()) {
      if (a.ownCitations.includes(c.url) || namesProduct(c.title, names)) continue;
      if (!/\b(best|top \d*|alternatives?|vs\.?|versus|compar(e|ed|es|ing|ison|isons)|reviews?)\b/i.test(`${c.title} ${c.url}`)) continue;
      const entry = cited.get(c.url) ?? { title: c.title || c.url, count: 0 };
      entry.count++;
      cited.set(c.url, entry);
    }
  }
  for (const [url, c] of [...cited].filter(([, c]) => c.count >= 2).sort((a, b) => b[1].count - a[1].count).slice(0, 5)) {
    out.push({
      key: `cited:${url}`,
      area: "ai",
      title: `Get listed in “${c.title}”`,
      why: `AI answers cited this page ${c.count} times when they didn't mention ${productName}.`,
      action: "If it's a list or review that takes suggestions, reach out to its author with what makes your product a fit. Never pay for or fake a mention.",
      score: 26 + c.count * 4,
      impact: `cited in ${c.count} answers`,
      href: url,
    });
  }
  return out;
}

export type OpportunityWithState = Opportunity & {
  status: "open" | "done" | "dismissed";
  state: typeof seoOpportunities.$inferSelect | null;
};

/** Every opportunity for the product, ranked, with what the owner did with each. */
export async function collectOpportunities(productId: string): Promise<OpportunityWithState[]> {
  const db = getDb();
  const [product] = await db.select({ name: products.name, url: products.url }).from(products).where(eq(products.id, productId));
  if (!product) return [];
  const [search, site, ai, states] = await Promise.all([
    searchOpportunities(productId, product.name, product.url),
    siteOpportunities(productId),
    aiOpportunities(productId, product.name, product.url),
    db.select().from(seoOpportunities).where(eq(seoOpportunities.productId, productId)),
  ]);
  const byKey = new Map(states.map((s) => [s.key, s]));
  return [...search, ...site, ...ai]
    .map((o) => {
      const state = byKey.get(o.key) ?? null;
      return { ...o, status: state?.status ?? "open", state };
    })
    .sort((a, b) => b.score - a.score);
}

/** The crawled facts of the product's pages with these URLs, for drafts. */
export async function pageFacts(productId: string, urls: string[]) {
  if (urls.length === 0) return [];
  const rows = await getDb()
    .select({ url: sitePages.url, title: sitePages.title, seo: sitePages.seo })
    .from(sitePages)
    .innerJoin(sites, eq(sites.id, sitePages.siteId))
    .where(and(eq(sites.productId, productId), isNull(sitePages.goneAt)));
  return urls.map((url) => rows.find((r) => r.url === url) ?? { url, title: null, seo: null });
}
