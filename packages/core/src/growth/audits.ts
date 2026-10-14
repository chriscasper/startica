import { eq } from "drizzle-orm";
import { parseHTML } from "linkedom";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { audits, products } from "@startica/db/schema";
import { runResearch, runStructured, type AiContext } from "../ai/client.ts";
import { loadProductContext } from "../distribution/context.ts";
import { crawlSite, USER_AGENT } from "../intel/crawl.ts";

export const AUDIT_PROMPT_VERSION = "audit@2";
export const auditKinds = ["landing", "onboarding", "seo", "geo"] as const;
export type AuditKind = (typeof auditKinds)[number];

export const auditPayload = z.object({ workspaceId: z.guid(), auditId: z.guid() });

const findingsOutput = z.object({
  summary: z.string().describe("Two or three sentences: the overall verdict and the single most important fix."),
  findings: z.array(
    z.object({
      severity: z.enum(["high", "medium", "low"]),
      title: z.string().describe("Short, specific problem or opportunity"),
      detail: z.string().describe("What you saw, with evidence (quote the page where useful)"),
      fix: z.string().describe("The concrete change to make"),
    }),
  ),
});

const FOCUS: Record<AuditKind, string> = {
  landing: `Audit the homepage and key pages as a landing page for the target audience. Check: is the promise clear in 5 seconds, in the audience's words; is there one obvious call to action; proof (examples, screenshots, numbers, testimonials); objections answered (price, privacy, "is anyone here?"); clutter and competing links; mobile-relevant issues visible in the text.`,
  onboarding: `Audit the path from first visit to first meaningful action (the activation moment for this kind of product). You can't sign up, so judge from the pages, FAQ, help and docs: signup friction, what a new user sees first, whether the first action is suggested, invite-only or waitlist confusion, and what would make someone come back.`,
  seo: `Audit technical and content SEO. Use the measured facts given (titles, descriptions, headings, canonical, Open Graph, robots.txt, sitemap) plus the page text: indexability problems, missing or weak titles/descriptions, thin pages, missing pages that answer the audience's searches (comparisons, how-tos, "best X for Y"), internal linking.`,
  geo: `Audit visibility in AI assistants' answers (generative engine optimization), using the research notes: does the product appear when the audience asks AI assistants or search for recommendations; how is it described; which competitors appear instead and why; what sources those answers cite; what content or mentions would get the product included.`,
};

const SYSTEM = `You are a senior growth and conversion reviewer inside Startica, an AI marketing co-founder for a small founder. Be specific and evidence-based: quote or cite what you saw. Prioritize: high = likely costing signups now; medium = clear improvement; low = polish. 5–12 findings. Never invent facts about the product; if you couldn't check something, say so in the detail.`;

/** Facts an SEO audit can measure directly instead of asking a model. */
export async function seoFacts(siteUrl: string): Promise<string> {
  const origin = new URL(siteUrl).origin;
  const get = async (url: string) => {
    try {
      const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
      return { status: res.status, text: res.ok ? await res.text() : "" };
    } catch {
      return { status: 0, text: "" };
    }
  };
  const [home, robots, sitemap] = await Promise.all([get(siteUrl), get(`${origin}/robots.txt`), get(`${origin}/sitemap.xml`)]);
  const { document } = parseHTML(home.text || "<html></html>");
  const meta = (selector: string) => document.querySelector(selector)?.getAttribute("content") ?? null;
  const title = document.querySelector("title")?.textContent?.trim() ?? null;
  const description = meta('meta[name="description"]');
  const h1s = [...document.querySelectorAll("h1")].map((h) => h.textContent?.trim()).filter(Boolean);
  return [
    `Homepage status: ${home.status}`,
    `Title (${title?.length ?? 0} chars): ${title ?? "(missing)"}`,
    `Meta description (${description?.length ?? 0} chars): ${description ?? "(missing)"}`,
    `H1 count: ${h1s.length}${h1s.length ? ` (${h1s.slice(0, 3).join(" | ")})` : ""}`,
    `Canonical: ${document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "(missing)"}`,
    `Open Graph: title=${meta('meta[property="og:title"]') ? "yes" : "no"}, description=${meta('meta[property="og:description"]') ? "yes" : "no"}, image=${meta('meta[property="og:image"]') ? "yes" : "no"}`,
    `robots.txt: ${robots.status === 200 ? `present (${robots.text.split("\n").filter((l) => /disallow|sitemap/i.test(l)).slice(0, 5).join("; ") || "no rules"})` : `status ${robots.status}`}`,
    `sitemap.xml: ${sitemap.status === 200 ? `present (${(sitemap.text.match(/<loc>/g) ?? []).length} URLs)` : `status ${sitemap.status}`}`,
  ].join("\n");
}

export async function runAudit(ctx: AiContext, payload: z.infer<typeof auditPayload>) {
  const db = getDb();
  const [audit] = await db.select().from(audits).where(eq(audits.id, payload.auditId));
  if (!audit) throw new Error("Audit not found");
  const [product] = await db.select({ url: products.url }).from(products).where(eq(products.id, audit.productId));

  try {
    if (!product?.url) throw new Error("Add the product's website in Settings first");
    const context = await loadProductContext(audit.productId);
    const pages = audit.kind === "geo" ? [] : await crawlSite(product.url);
    const site = pages.map((p) => `### ${p.title || p.url}\nURL: ${p.url}\n\n${p.content}`).join("\n\n").slice(0, 50_000);

    let material = `<site_pages>\n${site || "(nothing could be crawled)"}\n</site_pages>`;
    if (audit.kind === "seo") material += `\n\n<measured_facts>\n${await seoFacts(product.url)}\n</measured_facts>`;
    if (audit.kind === "geo") {
      const notes = await runResearch(ctx, {
        task: "research",
        promptVersion: `${AUDIT_PROMPT_VERSION}:geo-research`,
        system:
          "You research how visible a product is in web search and in the sources AI assistants rely on. Search the way the product's audience would (several phrasings of their questions and of 'best X for Y'). Report which products come up, whether this product appears and how it's described, and which sources (lists, forums, reviews) drive those answers. Cite URLs. Concise markdown.",
        messages: [{ role: "user", content: `<product>\n${context.text}\n</product>` }],
        maxSearches: 8,
        maxFetches: 4,
      });
      material = `<research_notes>\n${notes}\n</research_notes>`;
    }

    const result = await runStructured(ctx, {
      task: "strategy",
      promptVersion: `${AUDIT_PROMPT_VERSION}:${audit.kind}`,
      system: `${SYSTEM}\n\n${FOCUS[audit.kind]}`,
      messages: [{ role: "user", content: `<product>\n${context.text}\n</product>\n\n${material}` }],
      schema: findingsOutput,
    });
    const order = { high: 0, medium: 1, low: 2 };
    await db
      .update(audits)
      .set({ status: "done", summary: result.summary, findings: result.findings.sort((a, b) => order[a.severity] - order[b.severity]), error: null })
      .where(eq(audits.id, audit.id));
    return { findings: result.findings.length };
  } catch (error) {
    await db
      .update(audits)
      .set({ status: "failed", error: error instanceof Error ? error.message : String(error) })
      .where(eq(audits.id, audit.id));
    throw error;
  }
}
