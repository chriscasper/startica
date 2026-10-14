import type { AiAccess } from "@startica/db/schema";

/**
 * Agent readiness (ARCHITECTURE.md section 10.3): can AI agents (assistants that browse, compare
 * and act for people) understand the site and get simple things done on it? Fixed checks
 * over what the scan already knows (Accessibility results, page facts, AI crawler access)
 * plus a few plain requests to the site's own public pages, the way many agents read them:
 * raw HTML, no JavaScript, no sign-in.
 */

export type CheckStatus = "pass" | "warn" | "fail" | "info" | "unknown";
export type CheckResult = { id: CheckId; status: CheckStatus; summary: string; detail?: string[] };

export const AGENT_CHECKS = {
  "controls-named": { title: "Buttons and links have names", weight: 3, why: "Agents act through the names of buttons, links and fields. An icon button with no name is a button an agent can't find or trust." },
  "forms-labeled": { title: "Form fields are labeled", weight: 2, why: "To fill a form (a search, a signup, a contact form), an agent needs to know what each field is for." },
  structure: { title: "Pages have a clear structure", weight: 2, why: "One main area, a title and headings in order let an agent tell the content from the menus and find its way." },
  "content-without-js": { title: "Content is in the HTML", weight: 3, why: "Many AI assistants and agents read the page's HTML without running JavaScript. If the text only appears after scripts run, they see an empty page." },
  "pricing-in-text": { title: "Pricing is in plain text", weight: 3, why: "“How much is it?” is one of the first things agents are asked. Prices drawn by scripts, shown in images or behind a sign-in can't be quoted." },
  "public-pages": { title: "Key pages open without signing in", weight: 3, why: "Agents don't sign in on someone's behalf to compare products. The home, pricing and docs pages need to answer without an account." },
  "no-bot-wall": { title: "No bot challenge on public pages", weight: 3, why: "A CAPTCHA or browser check stops an agent before it reads anything, so the product drops out of what it can recommend." },
  "agent-access": { title: "Assistants may fetch pages for their users", weight: 3, why: "When someone asks an assistant about your product, it fetches your pages on their behalf (ChatGPT-User, Claude-User, Perplexity-User). robots.txt can block that by accident." },
  "structured-data": { title: "The home page describes the product in structured data", weight: 2, why: "Organization and Product or SoftwareApplication data say exactly what the product is, who makes it and what it costs, without guessing from the layout." },
  "llms-txt": { title: "llms.txt", weight: 1, why: "A short Markdown guide to the site at /llms.txt helps language models find the pages that matter. A proposal, not a standard: cheap to add, not required." },
  "docs-public": { title: "Docs or help pages are public", weight: 1, why: "Agents answer “how do I…” questions from your docs. Public, crawlable docs make those answers right." },
  "api-description": { title: "Machine-readable API description", weight: 0, why: "If the product has an API, an OpenAPI description (linked from /.well-known/api-catalog) lets agents use it without guessing." },
  "agent-tools": { title: "Tools for agents (MCP or WebMCP)", weight: 0, why: "Some products offer an MCP server (listed in /.well-known/ai-catalog.json with a Server Card) or WebMCP tools in the page (document.modelContext, or forms with toolname), so agents can act through defined tools instead of clicking. Early days: worth knowing about, not expected." },
  markdown: { title: "Pages in Markdown for agents", weight: 0, why: "Some sites answer a request that asks for Markdown (Accept: text/markdown) with a clean Markdown version of the page, which agents read more reliably and cheaply than HTML. Optional." },
} as const;
export type CheckId = keyof typeof AGENT_CHECKS;

/** What a plain request to a page returned. */
export type Probe = { url: string; finalUrl: string; status: number; headers: Record<string, string>; text: string };

export type AgentInputs = {
  startUrl: string;
  /** Scanned pages (latest results). */
  pages: { url: string; title: string | null; state: string; httpStatus: number | null; wordCount: number | null; structuredTypes: string[] }[];
  /** Open Accessibility violations: the rule and how many pages it's on. */
  a11y: { ruleId: string; pagesCount: number }[] | null;
  /** Whether scans run axe's best-practice rules (landmarks, headings), which Structure needs. */
  bestPractice: boolean;
  aiAccess: AiAccess | null;
  /** Plain requests (no JavaScript) to the home page and the pricing and docs pages, when found. */
  probes: { home: Probe | null; pricing: Probe | null; docs: Probe | null };
  /** Which machine-readable files answered: path → status and content type. */
  endpoints: { path: string; status: number; contentType: string }[];
  /** The home page asked for as Markdown (Accept: text/markdown): the content type it answered with. */
  markdownType: string | null;
};

const NAMED_RULES = ["button-name", "link-name", "input-button-name", "aria-command-name", "image-alt", "role-img-alt"];
const FORM_RULES = ["label", "select-name", "aria-input-field-name", "autocomplete-valid"];
const STRUCTURE_RULES = ["landmark-one-main", "page-has-heading-one", "heading-order", "document-title", "html-has-lang", "region"];

const pathOf = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

/** A page whose path looks like pricing, docs… among the scanned ones (shortest path first). */
export function findPage(pages: AgentInputs["pages"], pattern: RegExp): string | null {
  const hits = pages.filter((p) => p.state === "done" && (p.httpStatus ?? 200) < 400 && pattern.test(pathOf(p.url))).map((p) => p.url);
  return hits.sort((a, b) => pathOf(a).length - pathOf(b).length)[0] ?? null;
}
export const PRICING_PATH = /\/(pricing|plans|prices?|buy|upgrade)(\/|$|\.)/i;
export const DOCS_PATH = /\/(docs?|documentation|help|support|guides?|kb|knowledge-?base|faq|changelog|manual)(\/|$|\.)/i;

/** The words a reader without JavaScript sees in an HTML page. */
export function visibleWords(html: string): number {
  const text = visibleText(html);
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// A price, or a free plan ("free trial" alone isn't pricing).
const PRICE = /([$€£¥₹]\s?\d)|(\d[\d.,]*\s?(USD|EUR|GBP|CAD|AUD|JPY|INR)\b)|(\bfree\s+(plan|tier|forever|version|for\s+\w+))|(\b(plan|tier)\b[^.]{0,40}\bfree\b)|(per\s(month|year|user|seat|member))|(\/\s?(mo|month|yr|year)\b)/i;

/** The text a reader without JavaScript sees: scripts' contents (data payloads too) and styles left out. */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
}

/** Signs of a bot challenge or CAPTCHA in a response (Cloudflare, Turnstile, reCAPTCHA, hCaptcha, DataDome, Akamai). */
export function botWall(p: Probe): string | null {
  const h = (k: string) => p.headers[k.toLowerCase()] ?? "";
  if (h("cf-mitigated").toLowerCase() === "challenge") return "a Cloudflare challenge (cf-mitigated: challenge)";
  if (p.status === 402) return h("crawler-price") ? "Cloudflare's pay per crawl (HTTP 402 with a crawler price)" : "a payment-required response (HTTP 402)";
  if (h("x-datadome") && p.status >= 400) return "a DataDome block";
  const head = p.text.slice(0, 200_000);
  const markers: [RegExp, string][] = [
    [/\/cdn-cgi\/challenge-platform\/|_cf_chl_opt|cf-chl-|<title>Just a moment\.\.\.<\/title>/i, "a Cloudflare browser check"],
    [/cf-turnstile|challenges\.cloudflare\.com\/turnstile/i, "a Cloudflare Turnstile challenge"],
    [/g-recaptcha|www\.google\.com\/recaptcha/i, "a reCAPTCHA"],
    [/h-captcha|hcaptcha\.com/i, "an hCaptcha"],
    [/captcha-delivery\.com|datadome/i, "a DataDome challenge"],
    [/_abck|ak_bmsc|Access Denied[\s\S]{0,200}Reference #/i, "an Akamai bot check"],
  ];
  // A challenge page is short; a long page that merely embeds a form CAPTCHA isn't a wall.
  const short = visibleWords(head) < 150;
  for (const [re, name] of markers) if (re.test(head) && (short || p.status >= 400)) return name;
  if ([403, 429, 503].includes(p.status) && short) return `a refusal (HTTP ${p.status})`;
  return null;
}

/** Whether a request ended on a sign-in page instead of the page asked for. */
export function signInRedirect(p: Probe): boolean {
  const from = pathOf(p.url);
  const to = pathOf(p.finalUrl);
  return from !== to && /(log-?in|sign-?in|signin|auth|sso|session)/i.test(to) && !/(log-?in|sign-?in|auth)/i.test(from);
}

function fromA11y(id: CheckId, rules: string[], a11y: AgentInputs["a11y"]): CheckResult {
  if (!a11y) return { id, status: "unknown", summary: "Runs after the first scan." };
  const open = a11y.filter((g) => rules.includes(g.ruleId));
  if (open.length === 0) return { id, status: "pass", summary: "No problems found by the accessibility checks." };
  const pages = Math.max(...open.map((g) => g.pagesCount));
  return {
    id,
    status: open.some((g) => g.pagesCount > 1) ? "fail" : "warn",
    summary: `${open.length === 1 ? "1 accessibility issue" : `${open.length} accessibility issues`} on up to ${pages === 1 ? "1 page" : `${pages} pages`}: fixing them for screen readers fixes them for agents.`,
    detail: open.map((g) => `${g.ruleId} (${g.pagesCount === 1 ? "1 page" : `${g.pagesCount} pages`})`),
  };
}

export function runChecks(i: AgentInputs): CheckResult[] {
  const out: CheckResult[] = [];
  out.push(fromA11y("controls-named", NAMED_RULES, i.a11y));
  out.push(fromA11y("forms-labeled", FORM_RULES, i.a11y));
  const structure = fromA11y("structure", STRUCTURE_RULES, i.a11y);
  // Landmarks and heading order are axe best-practice rules: without them only the title and language were checked.
  if (!i.bestPractice && structure.status === "pass")
    structure.summary = "The page titles and language are set. Landmarks and headings weren't checked: turn on best-practice checks in the site's settings (Accessibility).";
  out.push(structure);

  // Content without JavaScript, judged on the home page's raw HTML.
  const home = i.probes.home;
  if (!home) out.push({ id: "content-without-js", status: "unknown", summary: "The home page couldn't be fetched." });
  else {
    const words = visibleWords(home.text);
    const rendered = i.pages.find((p) => pathOf(p.url) === pathOf(i.startUrl))?.wordCount ?? null;
    if (words < 40) out.push({ id: "content-without-js", status: "fail", summary: `The home page's HTML has ${words} words of text before scripts run: agents that don't run JavaScript see an almost empty page.`, detail: ["Render the main content on the server (server-side rendering or static generation)."] });
    else if (rendered && rendered > words * 3 && words < 150) out.push({ id: "content-without-js", status: "warn", summary: `The HTML has ${words} words before scripts run; the page shows about ${rendered} after. Much of it depends on JavaScript.` });
    else out.push({ id: "content-without-js", status: "pass", summary: `The home page's HTML has ${words} words of text without running scripts.` });
  }

  // Pricing in text.
  const pricingUrl = i.probes.pricing?.url ?? findPage(i.pages, PRICING_PATH);
  if (!pricingUrl && i.pages.length === 0) out.push({ id: "pricing-in-text", status: "unknown", summary: "Runs after the first scan." });
  else if (!pricingUrl) out.push({ id: "pricing-in-text", status: "warn", summary: "No pricing page found among the scanned pages (paths like /pricing or /plans).", detail: ["If the product is free or prices are on another page, say so in plain text there and link it from the menu."] });
  else if (!i.probes.pricing) out.push({ id: "pricing-in-text", status: "unknown", summary: `${pathOf(pricingUrl)} couldn't be fetched.` });
  else if (PRICE.test(visibleText(i.probes.pricing.text))) out.push({ id: "pricing-in-text", status: "pass", summary: `${pathOf(pricingUrl)} states prices in its HTML.` });
  else out.push({ id: "pricing-in-text", status: "warn", summary: `${pathOf(pricingUrl)} has no prices in its HTML: they may be drawn by scripts, shown in images, or missing.` });

  // Key pages without signing in.
  const probes = [i.probes.home, i.probes.pricing, i.probes.docs].filter((p): p is Probe => Boolean(p));
  if (probes.length === 0) out.push({ id: "public-pages", status: "unknown", summary: "No pages could be fetched." });
  else {
    const blocked = probes.filter((p) => signInRedirect(p) || p.status === 401 || (p.status === 403 && !botWall(p)));
    out.push(
      blocked.length
        ? { id: "public-pages", status: "fail", summary: `${blocked.map((p) => pathOf(p.url)).join(", ")} ${blocked.length === 1 ? "asks" : "ask"} for a sign-in.`, detail: blocked.map((p) => `${pathOf(p.url)} → ${p.status === 401 || p.status === 403 ? `HTTP ${p.status}` : pathOf(p.finalUrl)}`) }
        : { id: "public-pages", status: "pass", summary: `${probes.map((p) => pathOf(p.url)).join(", ")} open without an account.` },
    );
  }

  // Bot walls.
  const walls = probes.map((p) => [p, botWall(p)] as const).filter(([, w]) => w);
  if (probes.length === 0) out.push({ id: "no-bot-wall", status: "unknown", summary: "No pages could be fetched." });
  else
    out.push(
      walls.length
        ? { id: "no-bot-wall", status: "fail", summary: `${pathOf(walls[0]![0].url)} answered with ${walls[0]![1]}.`, detail: ["Let known AI agents and assistants through your bot protection (for example Cloudflare's verified bots and AI crawler settings) for public pages."] }
        : { id: "no-bot-wall", status: "pass", summary: "Public pages answered a plain request without a challenge." },
    );

  // robots.txt for assistants fetching on a user's behalf.
  if (!i.aiAccess) out.push({ id: "agent-access", status: "unknown", summary: "Checked during the next scan." });
  else {
    const user = i.aiAccess.crawlers.filter((c) => c.purpose === "user");
    const blocked = user.filter((c) => !c.allowed);
    out.push(
      blocked.length
        ? { id: "agent-access", status: "fail", summary: `robots.txt blocks ${blocked.map((c) => c.token).join(", ")}.`, detail: ["Allow the user agents that fetch pages on a person's request. You can still block training crawlers."] }
        : { id: "agent-access", status: "pass", summary: `robots.txt lets ${user.map((c) => c.token).join(", ")} fetch pages.` },
    );
  }

  // Structured data on the home page.
  const homePage = i.pages.find((p) => pathOf(p.url) === pathOf(i.startUrl));
  if (!homePage) out.push({ id: "structured-data", status: "unknown", summary: "Runs after the first scan." });
  else {
    const types = homePage.structuredTypes;
    const product = types.some((t) => ["Product", "SoftwareApplication", "WebApplication", "MobileApplication", "Service", "LocalBusiness"].includes(t));
    const org = types.some((t) => ["Organization", "Corporation", "WebSite"].includes(t));
    out.push(
      product
        ? { id: "structured-data", status: "pass", summary: `The home page describes the product (${types.join(", ")}).` }
        : org
          ? { id: "structured-data", status: "warn", summary: `The home page has ${types.join(", ")}, but nothing that describes the product itself.`, detail: ["Add Product or SoftwareApplication with name, description and offers."] }
          : { id: "structured-data", status: "fail", summary: "The home page has no structured data about the product or company." },
    );
  }

  // llms.txt.
  if (!i.aiAccess) out.push({ id: "llms-txt", status: "unknown", summary: "Checked during the next scan." });
  else
    out.push(
      i.aiAccess.llmsTxt === "present"
        ? { id: "llms-txt", status: "pass", summary: "/llms.txt is there." }
        : { id: "llms-txt", status: "warn", summary: i.aiAccess.llmsTxt === "invalid" ? "/llms.txt is there but doesn't start with a Markdown # title." : "No /llms.txt." },
    );

  // Docs.
  const docsUrl = i.probes.docs?.url ?? findPage(i.pages, DOCS_PATH);
  const docsBlocked = i.probes.docs && (signInRedirect(i.probes.docs) || i.probes.docs.status >= 400);
  out.push(
    docsUrl && docsBlocked
      ? { id: "docs-public", status: "warn", summary: `${pathOf(docsUrl)} didn't open for a plain request (${signInRedirect(i.probes.docs!) ? "it asks for a sign-in" : `HTTP ${i.probes.docs!.status}`}).` }
      : docsUrl
      ? { id: "docs-public", status: "pass", summary: `${pathOf(docsUrl)} is public.` }
      : { id: "docs-public", status: "info", summary: "No docs, help or changelog pages found among the scanned pages. Fine for a simple product; worth adding as questions come in." },
  );

  // Machine-readable endpoints (informational).
  const found = (re: RegExp) => i.endpoints.filter((e) => e.status === 200 && re.test(e.path));
  const api = found(/openapi|swagger|api-catalog/);
  out.push(
    api.length
      ? { id: "api-description", status: "pass", summary: `Found ${api.map((e) => e.path).join(", ")}.` }
      : { id: "api-description", status: "info", summary: "No OpenAPI description or /.well-known/api-catalog found. Only matters if the product has an API." },
  );
  const tools = found(/ai-catalog|mcp|server-card/);
  // WebMCP: tools registered from script (document.modelContext; navigator.modelContext is the older name), or declared on forms.
  const webMcp = home ? /modelContext\.(registerTool|provideContext)|\btoolname\s*=|\btooldescription\s*=/.test(home.text) : false;
  out.push(
    tools.length || webMcp
      ? { id: "agent-tools", status: "pass", summary: [tools.length ? `Found ${tools.map((e) => e.path).join(", ")}` : "", webMcp ? "WebMCP tools in the home page" : ""].filter(Boolean).join("; ") + "." }
      : { id: "agent-tools", status: "info", summary: "No MCP Server Card, AI catalog or WebMCP tools found. Not expected yet for most products." },
  );
  out.push(
    i.markdownType?.startsWith("text/markdown")
      ? { id: "markdown", status: "pass", summary: "The home page answers in Markdown when asked for it." }
      : { id: "markdown", status: "info", summary: "Pages answer in HTML only. Optional: some hosts (Cloudflare's Markdown for Agents, for example) can serve Markdown to agents that ask." },
  );
  return out;
}

/**
 * 0–100 over the scored checks: a pass counts fully, a warning half; info and unknown don't
 * count. No score until at least half the scored weight could be checked.
 */
export function readinessScore(results: CheckResult[]): number | null {
  let possible = 0;
  let total = 0;
  let got = 0;
  for (const r of results) {
    const w = AGENT_CHECKS[r.id].weight;
    if (!w) continue;
    possible += w;
    if (r.status === "info" || r.status === "unknown") continue;
    total += w;
    got += r.status === "pass" ? w : r.status === "warn" ? w / 2 : 0;
  }
  return total && total >= possible / 2 ? Math.round((got / total) * 100) : null;
}
