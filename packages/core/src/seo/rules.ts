/**
 * Site health rules for search and AI (ARCHITECTURE.md section 10.2): what each one means and
 * how to fix it. `info` rules are facts worth knowing, not problems; they don't count
 * against the score.
 */

export type SeoSeverity = "high" | "medium" | "low" | "info";
export type SeoCategory = "indexing" | "basics" | "links" | "structured" | "ai";

export type SeoRule = { title: string; severity: SeoSeverity; category: SeoCategory; why: string; fix: string };

export const SEO_RULES = {
  // --- Indexing
  "noindex-in-sitemap": {
    title: "Page is in the sitemap but asks not to be indexed",
    severity: "high",
    category: "indexing",
    why: "The sitemap tells search engines the page matters; its noindex tells them to leave it out. They'll drop it, so it can't rank or be cited.",
    fix: "Remove the noindex (robots meta tag or X-Robots-Tag header) if the page should be found, or take it out of the sitemap.",
  },
  noindex: {
    title: "Page asks not to be indexed",
    severity: "info",
    category: "indexing",
    why: "Search engines and AI search indexes will leave it out. Fine for private or utility pages.",
    fix: "Nothing, if that's intended. Otherwise remove the noindex.",
  },
  "canonical-elsewhere": {
    title: "Canonical points to another page",
    severity: "info",
    category: "indexing",
    why: "Search engines will usually show the canonical page instead of this one.",
    fix: "Nothing, if this page is a copy or variant. Otherwise point the canonical to the page itself.",
  },
  "canonical-broken": {
    title: "Canonical points to a page that doesn't work",
    severity: "medium",
    category: "indexing",
    why: "The canonical target returns an error, so search engines may ignore both pages.",
    fix: "Point the canonical to a working page (usually the page itself).",
  },
  "orphan-page": {
    title: "Page is only in the sitemap: nothing links to it",
    severity: "low",
    category: "indexing",
    why: "Pages without internal links are found late and ranked low, and people browsing the site never reach them.",
    fix: "Link to it from a related page or the navigation, or remove it from the sitemap if it's obsolete.",
  },
  "soft-404": {
    title: "Missing pages answer as if they exist (soft 404)",
    severity: "medium",
    category: "indexing",
    why: "An address that doesn't exist answers HTTP 200 with a page instead of 404. Search engines may index those error pages, waste crawling on them, and trust the site's real pages less; files like robots.txt, sitemap.xml and llms.txt look present when they aren't.",
    fix: "Make unknown addresses answer HTTP 404 (most frameworks have a not-found page that sets it; a catch-all route needs to call it when nothing matches).",
  },
  "robots-not-text": {
    title: "robots.txt is a web page, not a text file",
    severity: "low",
    category: "indexing",
    why: "/robots.txt answers with an HTML page, so crawlers find no rules and no Sitemap line. Usually it's the site's catch-all page answering an address that doesn't exist.",
    fix: "Serve a plain-text /robots.txt (most frameworks have a robots file or route), with a Sitemap: line.",
  },
  "sitemap-missing": {
    title: "No sitemap found",
    severity: "low",
    category: "indexing",
    why: "A sitemap helps search engines and AI crawlers find every page, especially new ones.",
    fix: "Publish /sitemap.xml (most site builders can generate one) and list it in robots.txt with a Sitemap: line.",
  },
  // --- Page basics
  "title-missing": {
    title: "Missing page title",
    severity: "high",
    category: "basics",
    why: "The title is the headline in search results and what AI answers call the page.",
    fix: "Add a <title> that says what the page is, in about 50–60 characters.",
  },
  "title-too-long": {
    title: "Title is too long",
    severity: "low",
    category: "basics",
    why: "Search results cut titles off after about 60 characters.",
    fix: "Shorten it to about 60 characters, with the important words first.",
  },
  "title-too-short": {
    title: "Title is very short",
    severity: "low",
    category: "basics",
    why: "A few words rarely say enough to earn the click.",
    fix: "Say what the page offers and for whom, in 30–60 characters.",
  },
  "title-duplicate": {
    title: "Several pages share the same title",
    severity: "medium",
    category: "basics",
    why: "Search engines can't tell the pages apart and may show the wrong one.",
    fix: "Give each page its own title.",
  },
  "description-missing": {
    title: "Missing meta description",
    severity: "medium",
    category: "basics",
    why: "Without one, search engines pick a snippet themselves, often a poor one.",
    fix: "Add a meta description of about 120–160 characters that says what the page offers.",
  },
  "description-too-long": {
    title: "Meta description is too long",
    severity: "low",
    category: "basics",
    why: "Search results cut descriptions off after about 160 characters.",
    fix: "Shorten it to about 160 characters.",
  },
  "description-duplicate": {
    title: "Several pages share the same meta description",
    severity: "low",
    category: "basics",
    why: "Identical snippets make the pages look interchangeable in results.",
    fix: "Write a description for each page.",
  },
  "h1-missing": {
    title: "No main heading (h1)",
    severity: "medium",
    category: "basics",
    why: "The h1 tells search engines, AI models and screen readers what the page is about.",
    fix: "Add one h1 that names the page's topic.",
  },
  "h1-multiple": {
    title: "More than one main heading (h1)",
    severity: "low",
    category: "basics",
    why: "Several h1s blur what the page is mainly about.",
    fix: "Keep one h1 and make the others h2.",
  },
  "og-image-missing": {
    title: "Home page has no social preview image",
    severity: "low",
    category: "basics",
    why: "Links shared in chats and social posts show no picture, and get fewer clicks.",
    fix: "Add og:title and og:image meta tags to the home page (and ideally every page).",
  },
  // --- Links
  "broken-internal-link": {
    title: "Broken internal link",
    severity: "high",
    category: "links",
    why: "Links to a page that errors waste crawl time, lose visitors and look neglected to search engines and AI.",
    fix: "Fix or remove the links, or redirect the old address to the right page.",
  },
  // --- Structured data
  "jsonld-invalid": {
    title: "Structured data (JSON-LD) can't be read",
    severity: "medium",
    category: "structured",
    why: "A syntax error means search engines and AI models ignore the whole block.",
    fix: "Fix the JSON (a missing comma or quote is typical) and check it with a schema validator.",
  },
  "jsonld-incomplete": {
    title: "Structured data is missing required properties",
    severity: "low",
    category: "structured",
    why: "Without them, search engines can't use the block for rich results.",
    fix: "Add the missing properties listed on the page.",
  },
  "home-no-structured-data": {
    title: "Home page has no structured data about the product",
    severity: "low",
    category: "structured",
    why: "Organization, WebSite and Product (or SoftwareApplication) data helps search engines and AI models state the facts about you correctly.",
    fix: "Add a JSON-LD block to the home page: Organization (name, url, logo) and Product or SoftwareApplication (name, description, offers).",
  },
  // --- AI access
  "ai-search-blocked": {
    title: "AI search or answer crawlers are blocked",
    severity: "high",
    category: "ai",
    why: "robots.txt stops these bots, so AI assistants can't read or cite the site when people ask about it. Blocking training bots is a separate choice.",
    fix: "In robots.txt, allow the search and user bots listed (you can keep the training bots blocked).",
  },
  "ai-training-blocked": {
    title: "AI training crawlers are blocked",
    severity: "info",
    category: "ai",
    why: "Your content won't be used to train these models. This doesn't stop AI answers from citing you, as long as the search bots are allowed.",
    fix: "Nothing, if that's your choice.",
  },
  "llms-missing": {
    title: "No llms.txt",
    severity: "low",
    category: "ai",
    why: "llms.txt is an emerging, informal convention: a plain Markdown briefing for AI systems about what the site is and where the key pages are. Support varies by AI provider.",
    fix: "Publish /llms.txt: a # title, a one-paragraph summary, then links to your most important pages.",
  },
  "llms-invalid": {
    title: "llms.txt doesn't follow the expected format",
    severity: "low",
    category: "ai",
    why: "The convention starts with a Markdown # title, then a short summary and links.",
    fix: "Start the file with '# Your product name' and a one-paragraph summary.",
  },
} satisfies Record<string, SeoRule>;

export type SeoRuleId = keyof typeof SEO_RULES;

export const SEVERITY_WEIGHT: Record<Exclude<SeoSeverity, "info">, number> = { high: 15, medium: 7, low: 2 };
