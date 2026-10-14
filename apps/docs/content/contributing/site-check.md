---
title: Add a site check
description: Add a check to the shared site scan, as an SEO & GEO site health rule or a Security page or site check, with its data source, severity, fix text, grouping, tests, demo data and docs.
layout: doc
---

Accessibility, SEO & GEO and Security share one crawl: each page is loaded once in a real Chromium and every module's checks run on the result. This page shows how to add a check to that scan: where the data a check needs comes from, how to add an SEO & GEO site health rule or a Security check, how findings are grouped and scored, and what to test and document. It also explains why accessibility checks work differently.

> [!WARNING]
> Checks only read what any visitor's browser receives. Open a Discussion before you add a check that needs a new kind of request (a new file path, a DNS lookup, a third-party service), and never add one that sends payloads, submits forms, clicks, tries passwords or crawls beyond the site's own pages. See [Rules for every check](#rules-for-every-check).

## How a check runs

The scan code is in `packages/core/src/a11y/scan.ts`. For each page:

1. `checkPage()` asks the scanner backend to open the page with `scanRequest()`. Both backends (Electron in the desktop app, Playwright in browser development mode and tests) run the same in-page script, built in core by `runScript()` in `a11y/scanner.ts`.
2. The backend returns a `ScanResponse`: the page's status, the in-page script's `PageResult`, and some of the main document's response headers.
3. `storePageResult()` stores the accessibility results, then, in the same transaction, calls `storePageSeo()` (`seo/site.ts`), `storePageSecurity()` (`security/findings.ts`) and `storePageContent()` (`a11y/content.ts`). Each replaces that page's previous findings.

When the scan ends (a full scan, a page check, a recheck, or a stopped scan), `finishScan()` calls `finishSeo()` for the cross-page and site-level SEO checks, then `finishSecurity()`, which runs the Security site probes on full scans only (`probes: scope === "full"`) and folds every occurrence into findings.

From `a11y/scanner.ts`:

```ts
export type ScanResponse = {
  httpStatus: number | null;
  finalUrl: string;
  result: PageResult;
  /** The page's X-Robots-Tag header, if any. */
  xRobotsTag?: string | null;
  /** A JPEG of the page (base64) when it had issues and the request asked for one, with its size. */
  screenshot?: { data: string; width: number; height: number } | null;
  /** The main document's security-relevant response headers (`RESPONSE_HEADERS`), lowercase names; Set-Cookie lines joined with "\n". */
  headers?: Record<string, string>;
};
```

Pages that answer HTTP 400 or higher, redirect off the site or are blocked by `robots.txt` never reach `storePageResult()`. They're marked `failed` or `skipped` in `site_pages`, which is how `finishSeo()` finds broken links.

## Where the data comes from

Pick the cheapest source that has what your check needs:

| Source | What it has | Read it in |
|---|---|---|
| The in-page script | `PageResult`: title, `lang`, links, axe results, `seo` (`SeoFacts`), `security` (`SecurityFacts`), the main text, images | `pageFindings()` (SEO), `pageSecurityFindings()` (Security), `pageContent()` (content quality) |
| Response headers | The headers named in `RESPONSE_HEADERS`, as `response.headers`; `X-Robots-Tag` as `response.xRobotsTag` | `pageSecurityFindings()`; `pageSeo()` for `X-Robots-Tag` |
| Stored pages | Every page's row in `site_pages`: state, HTTP status, `seo`, `links`, `in_sitemap` | `finishSeo()`, for checks across pages (duplicates, broken links, orphans) |
| A site-level request | Files and answers that aren't a crawled page | `siteFiles()` and `aiCrawlerAccess()` in `seo/site.ts`; `siteSecurityProbes()` in `security/probes.ts` |

### Adding a fact to the in-page script

If your check needs something from the DOM that `PageResult` doesn't have yet, add a field to `SeoFacts` or `SecurityFacts` in `a11y/scanner.ts` and fill it in `runScript()`. The existing facts show the pattern:

```ts
const security = {
  // …
  forms: [...document.forms].slice(0, 20).map((f) => ({ action: abs(f.getAttribute("action") || location.href), hasPassword: !!f.querySelector('input[type="password" i]') })),
  scripts: [...document.querySelectorAll("script[src]")].slice(0, 50).map((s) => ({ src: abs(s.getAttribute("src") || ""), integrity: !!s.getAttribute("integrity") })).filter((s) => s.src),
  generator: meta('meta[name="generator" i]'),
  directoryListing: /^(Index of \\/|Directory listing for \\/)/.test(document.title || ""),
  // …
};
```

- **Cap every list and string** (`.slice(0, 20)`, `limit(text, 200)`). The result is serialized as JSON and sent over IPC for every page.
- **Only read the DOM.** No clicks, no form submission, no extra requests from the page.
- **`runScript()` returns a template string,** so a regular expression's backslashes are doubled (`\\/`, `\\s`), as in the excerpt.
- **Keep the decision in core.** Return raw facts and judge them in the check function (JSON-LD is returned as text and parsed by `readStructuredData()`), so the logic can be unit-tested without a browser.

Both backends run the script unchanged, so nothing changes in `apps/desktop`. Run the desktop smoke test anyway: it's what proves the Electron scanner returns the new field.

### Adding a response header

Add the header's lowercase name to `RESPONSE_HEADERS` in `a11y/scanner.ts`. `pickHeaders()` keeps only those names: the Playwright backend calls it on the page's headers, and the Electron main process sends every header of the main document, which `apps/desktop-web/src/lib/scanner.ts` filters with `pickHeaders()` too. Repeated headers are joined with `", "`, and `Set-Cookie` lines with `"\n"`.

## Accessibility

There are no pluggable accessibility rules. The page checks are [axe-core](https://github.com/dequelabs/axe-core)'s own rules, run unmodified at a pinned version (4.14.0). Startica doesn't add rules to axe or rewrite its results. What you can change:

- **Which axe rules run** comes from the site's profile: `profileTags()` in `a11y/scanner.ts` (WCAG 2.2 A and AA by default; AAA and best practices when the site turns them on). A missing or wrong axe rule is a report to axe-core upstream.
- **How results become issues** is in `a11y/results.ts`: `findings()` turns each failing element into an occurrence, `fingerprint()` groups the same rule on the same element markup across pages (ids, `data-` and `style` attributes and query strings are stripped by `normalizeHtml()`), and `pageScore()` weighs failures by impact (critical 10, serious 5, moderate 2, minor 1).
- **Content quality** (A5) is Startica's own code, in `a11y/content.ts`. `pageContent()` produces findings of three fixed kinds, stored in `site_findings`: `spelling`, `readability` and `rule`. The `rule` kind runs the owner's own **content rules** (text contains or missing, selector exists or missing, links to a domain), which are data on `sites.content_rules`, set on the Content screen. They aren't code you add.
- **PDF checks** are listed in `DOCUMENT_RULES` in `a11y/documents.ts` and produced by `documentProblems()` from what `analyzePdf()` reads with pdf.js. A new PDF check is an entry there, a line in `documentProblems()`, and a field in `DocumentChecks` (`packages/db/src/schema.ts`) if it needs something `analyzePdf()` doesn't read yet.

A new kind of content finding means a new value in the `site_findings.kind` enum, a new tab on the Content screen (`apps/desktop-web/src/app/(app)/accessibility/content/page.tsx`) and new tests in `a11y/content.test.ts`. That's a feature rather than a check, so start with a Discussion.

## Add an SEO & GEO rule

Site health rules are in `packages/core/src/seo/`. Findings are stored in `seo_findings` and replaced on every scan; they have no open or fixed state of their own.

### Step 1: Describe the rule

Add an entry to `SEO_RULES` in `seo/rules.ts`. Its key is the rule id stored in `seo_findings.rule`, and its text is shown as written on the Site health screen and in Opportunities:

```ts
export type SeoSeverity = "high" | "medium" | "low" | "info";
export type SeoCategory = "indexing" | "basics" | "links" | "structured" | "ai";

export type SeoRule = { title: string; severity: SeoSeverity; category: SeoCategory; why: string; fix: string };

export const SEO_RULES = {
  // …
  "h1-missing": {
    title: "No main heading (h1)",
    severity: "medium",
    category: "basics",
    why: "The h1 tells search engines, AI models and screen readers what the page is about.",
    fix: "Add one h1 that names the page's topic.",
  },
  // …
} satisfies Record<string, SeoRule>;
```

Pick the severity by what happens if the problem stays:

| Severity | Use it when | Points off a page's score |
|---|---|---|
| `high` | It's likely to keep pages out of search results or AI answers | 15 |
| `medium` | It hurts how pages are shown or understood | 7 |
| `low` | It's a smaller improvement | 2 |
| `info` | It's a fact worth knowing, often intended (`noindex`, `canonical-elsewhere`) | 0 |

The weights are `SEVERITY_WEIGHT`. A page scores `100` minus its findings' weights (`seoPageScore()`). The site score is the average page score, less two thirds of the weight of each site-wide finding (no `page_id`) and each `broken-internal-link`, at most 30 points. Every rule that isn't `info` also becomes an opportunity on **SEO & GEO → Opportunities** automatically (`opportunities/collect.ts`); `info` rules are listed under **Good to know** on Site health.

### Step 2: Produce it

**A check on one page** goes in `pageFindings()` in `seo/checks.ts`. It gets the page's address, title, whether the sitemap lists it, its `PageSeo` and its raw JSON-LD blocks, and returns drafts. It's a pure function:

```ts
export function pageFindings(page: { url: string; title: string | null; inSitemap: boolean }, seo: PageSeo, jsonLd: string[]): SeoFindingDraft[] {
  const out: SeoFindingDraft[] = [];
  const add = (rule: SeoRuleId, detail: Record<string, unknown> = {}, groupKey: string = rule) => out.push({ rule, groupKey, detail });
  // …
  if (seo.h1.length === 0) add("h1-missing");
  else if (seo.h1.length > 1) add("h1-multiple", { headings: seo.h1 });
  // …
  for (const gap of data.incomplete) add("jsonld-incomplete", gap, `jsonld-incomplete:${gap.type}`);
  return out;
}
```

If the check needs a new fact, add it to `PageSeo` (`packages/db/src/schema.ts`) and fill it in `pageSeo()`, which builds it from the in-page `SeoFacts`. `PageSeo` is stored as JSON in `site_pages.seo`, so a new field needs no migration, but pages scanned before the change won't have it until they're scanned again.

**A check across pages or on the whole site** goes in `finishSeo()` in `seo/site.ts`, using its `add(pageId, rule, detail, groupKey)` helper with `null` as the page for a site-wide finding:

```ts
if (!pages.some((p) => p.inSitemap)) add(null, "sitemap-missing");
```

Then add the rule to `SITE_RULES` at the bottom of the file. `finishSeo()` deletes only those rules before writing new ones, so a rule missing from the list piles up a copy on every scan.

**A check that needs a request** goes in `siteFiles()` next to `llms.txt`, `robots.txt` and the soft-404 probe. Use `fetchText()`: it sends Startica's scan user agent, times out after 15 seconds, and returns `null` for reserved test hosts (`.example`, `.test`, `.invalid`), so the demo's `fieldnote.example` never reaches the network. Decide what `null` means for your check. Sites often answer every unknown address with their app's HTML page, so don't treat a 200 as proof that a file exists (`isTextFile()` checks for a non-HTML answer).

### Step 3: Show it

The Site health screen (`apps/desktop-web/src/app/(app)/seo/health/page.tsx`) shows every rule's title, why and fix with no changes. Two things need code:

- **A new category** needs an entry in `CATEGORIES` on that page, or its findings won't be listed.
- **Details** (a length, the headings found, the crawlers blocked) are shown by `detailLine()` for page findings and in `RuleCard` for grouped ones. Add a line for your rule if its `detail` says something the title doesn't.

## Add a Security check

Security checks are in `packages/core/src/security/`. They run only for sites whose ownership is verified: `storePageSecurity()` and `finishSecurity()` return straight away otherwise. Each check writes **occurrences** (`security_occurrences`), and `finishSecurity()` folds them into **findings** (`security_findings`) with a lifecycle that survives scans.

### Step 1: Describe the rule

Add an entry to `RULES` in `security/rules.ts`:

```ts
export type SecurityRule = {
  title: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  /** Checked on every page (grouped into one finding listing the pages), or once for the site. */
  scope: "page" | "site";
  why: string;
  fix: string;
  /** OWASP Top 10 (2021) category, when one fits. */
  owasp?: OwaspId;
  /** Related controls, for an auditor's reference (never a claim of conformance). */
  controls: ControlId[];
};
```

A real one:

```ts
// --- Exposed files (one quiet GET each, on verified sites only)
"exposed-git": {
  title: "The site's Git folder is public",
  severity: "critical",
  category: "exposure",
  scope: "site",
  why: "Anyone can download the source code and its history, often with passwords and keys that were committed at some point.",
  fix: "Block /.git/ in the server settings (or deploy without it), then change any secret that was ever in the repository.",
  owasp: "A05",
  controls: LEAK,
},
```

- **`scope`** decides what **Recheck** does on the finding: a `site` finding enqueues `security_recheck`, which runs the site probes again; a `page` finding starts a page check on its pages.
- **`owasp` and `controls`** appear in the report as references for the owner's auditor. Use the existing ids in `OWASP` and `CONTROLS`, or the shared lists (`TRANSPORT`, `CONFIG`, `LEAK`).
- **`category`** groups findings on the screens. A new one needs a label in `CATEGORY_LABEL`; the type makes that a compile error if you forget.

Severity, and the points each open finding takes off the site's 100-point score (`SEVERITY_WEIGHT`, counted once per finding, not per page):

| Severity | Use it when | Points |
|---|---|---|
| `critical` | Something sensitive is exposed right now | 30 |
| `high` | Visitors' data can be read or changed on the way | 15 |
| `medium` | A protection most sites should have is missing | 7 |
| `low` | It's hardening worth doing | 2 |
| `info` | It's worth knowing; not counted | 0 |

Severity also drives what happens next: critical and high findings become Today moves, and the issue tracker's automatic setting opens issues at or above the severity the owner picked.

### Step 2a: A page check

Page checks go in `pageSecurityFindings()` in `security/checks.ts`, a pure function over the page's address, its response headers and its `SecurityFacts`. Nothing in `checks.ts` makes a request. The cookie checks show the pattern, including the group key:

```ts
for (const c of parseCookies(headers["set-cookie"])) {
  if (https && !c.secure) add("cookie-not-secure", { cookie: c.name }, `cookie-not-secure:${c.name}`);
  if (!c.httpOnly) add("cookie-not-httponly", { cookie: c.name }, `cookie-not-httponly:${c.name}`);
  if (c.sameSite === null) add("cookie-no-samesite", { cookie: c.name }, `cookie-no-samesite:${c.name}`);
}
```

`storePageSecurity()` calls it with `response.headers` and `response.result.security` and stores the drafts as the page's occurrences. If you need a header that isn't there yet, see [Adding a response header](#adding-a-response-header).

### Step 2b: A site check

Site checks run once per full scan (and on **Recheck**) in `siteSecurityProbes()` in `security/probes.ts`. Keep the request in `probes.ts` and the decision in a pure function in `checks.ts`, as the exposed-file checks do:

```ts
export const EXPOSED_FILES = [
  { kind: "git", path: "/.git/HEAD", rule: "exposed-git" },
  { kind: "env", path: "/.env", rule: "exposed-env" },
  { kind: "ds_store", path: "/.DS_Store", rule: "exposed-ds-store" },
] as const satisfies readonly { kind: "git" | "env" | "ds_store"; path: string; rule: SecurityRuleId }[];
```

```ts
for (const file of EXPOSED_FILES) {
  const target = new URL(file.path, url.origin).toString();
  if (exposedFile(file.kind, await probe(target))) drafts.push({ rule: file.rule, groupKey: file.rule, detail: { url: target } });
}
```

`exposedFile()` recognizes each file by its content, not by a 200: a site that answers every path with its HTML page must not be reported. Do the same for any file you look for.

Use the helpers that are already there:

- **`probe(url, follow?)`** is a GET with Startica's scan user agent and a 10-second timeout that keeps at most the first 64 KB. It doesn't follow redirects unless asked, because a redirected file isn't exposed.
- **Reserved hosts** (`.example`, `.test`, `.invalid`) return before any request, so the demo makes none.
- **Local hosts** (`isPrivateHost()`) skip HTTPS, TLS, the redirect and email checks. Skip yours there too if it doesn't apply to a site on the owner's own computer or network.

Site-level drafts are stored with no page and replaced each time the probes run.

### Step 3: Show it

The Findings list, a finding's page and the Markdown report take the title, why, fix, area, OWASP category and controls from the rule (`findingInfo()` in `security/report.ts`). A finding's details are shown as one line by `describeDetail()` in the same file, which reads a fixed set of keys, among them `cookie`, `header` and `value`, `host`, `generator`, `url`, `urls`, `maxAge`, `protocol`, `validTo`, `error`, `domain`, `problems` and `policy`. Reuse those keys in your `detail` where they fit; otherwise add a case to `describeDetail()`.

## Groups and fingerprints

A problem the owner fixes once should be one finding, however many pages show it. Each module groups differently:

| Module | Grouped by | Lifecycle |
|---|---|---|
| Accessibility | `fingerprint(kind, ruleId, html)`: the axe rule plus the element's normalized markup | Open → fixed when no page has it; reopens if it comes back; ignore decisions are kept by fingerprint |
| SEO & GEO | `group_key` on each finding; findings are replaced each scan | None: the latest scan's findings are the list |
| Security | `group_key`: one finding per key across all pages | Open → fixed when no longer seen; reopens; accepted risk and false positive survive scans |

For SEO and Security the group key defaults to the rule id, which is right when the fix is the same everywhere (a missing header is usually set once at the server or CDN). Add the distinguishing value when there can be several separate fixes: the cookie name (`cookie-not-secure:session`), the script's host (`third-party-script-no-sri:cdn.fieldnote.example`), the header and its value (`server-version:x-powered-by:standin/1.2`), the duplicated text (`title-duplicate:<title>`), the broken address (`broken:<url>`) or the JSON-LD type (`jsonld-incomplete:Product`).

Keep the key stable between scans: lowercase it, cut long values to a fixed length (the server-version key uses `value.slice(0, 120).toLowerCase()`), and never put a page address in a page check's key, or every page becomes its own finding. A Security finding keeps the `detail` of the first occurrence folded into it, so put page-specific details in each occurrence; a finding's page lists its pages with their own details (`findingPages()`).

## Rules for every check

These come from `ARCHITECTURE.md` at the repo root (sections 3, 9.1, 10.1, 11.1 and 11.3) and apply to every check:

- **Never claim a result.** Findings are "found by automated checks". Never call a site "compliant", "certified", "secure" or "pentested" in a rule's text, a detail line, a report or the docs. A site with no findings has "no problems found by the checks". The Security report test fails if the report says "compliant", "certified" or "pentested".
- **Defensive only, for Security.** Read what any visitor's browser receives: pages, response headers, cookies, certificates, public DNS and a few well-known file paths. Plain GETs, a TLS handshake and DNS lookups only. No exploit payloads, fuzzing, form submission, login attempts, or crawling beyond the site's own pages.
- **Polite requests.** The crawl loads two pages at a time, at most one a second per site. Page checks add no requests; they read what the crawl already loaded. Site-level requests run once at the end of a scan: keep them to a handful of GETs with a timeout, a size cap and Startica's scan user agent, and only to the site being scanned. Security has two approved exceptions (the public data services in exposure monitoring, and a GET of each third-party script the site's own pages load); any new destination needs a Discussion and the owner's go-ahead.
- **Verified sites only, for Security.** Don't run a security check from anywhere that skips `isVerified()`.
- **Startica suggests, the owner fixes.** A check never changes the site, its DNS or its files.

### Writing the text

- **`title`** names the problem as the owner sees it: "Cookie readable by scripts (no HttpOnly)", "Page is only in the sitemap: nothing links to it".
- **`why`** says what goes wrong for visitors, search engines or the owner if it stays, in one or two sentences. `security.test.ts` checks that every Security rule's `why` has more than 20 characters and its `fix` more than 10.
- **`fix`** says what to change, with the exact header, value or file where there is one ("Send Strict-Transport-Security: max-age=31536000"). Name the usual place to change it (server, CDN, framework) without assuming one vendor.
- **`info` fixes** start with "Nothing, if that's intended" when the fact is often a choice.
- Plain words, no jargon the title doesn't explain, and no real companies or products in examples: use Fieldnote and `fieldnote.example`.

## Test it

### Unit tests

Test the pure function with small hand-built inputs:

- **SEO page checks** in `seo/seo.test.ts`, with its `seo()` helper for a `PageSeo`:

  ```ts
  const rules = (title: string | null, over = {}, inSitemap = false) => pageFindings({ url: "https://fieldnote.example/pricing", title, inSitemap }, seo(over), []).map((f) => f.rule);
  expect(rules("Pricing: Fieldnote", { robots: "noindex, follow" }, true)).toEqual(["noindex-in-sitemap"]);
  ```

  Add your rule's case and one where it must not fire. The "site files" test shows how to test a site-level request: it starts two local `node:http` servers (a single-page app that answers every path with HTML, and a well-behaved site) and checks `siteFiles()` against both.

- **Security page checks** in `security/security.test.ts`, with `pageSecurityFindings()` over a header object and `noFacts`, comparing group keys. Start from `good`, the header set with no findings, and change one thing. Site checks test the pure function (`exposedFile()`, `parseSecurityTxt()`, `tlsFindings()`) with fixed inputs and a fixed `NOW`. Add a case to "scores open findings once each, by severity" if your severity changes the expected numbers.

Unit tests make no requests except to servers they start on `127.0.0.1`.

### The stand-in site

`packages/core/src/a11y/standin/server.mjs` is a small static site with planted problems (see [Testing](/contributing/testing#accessibility-stand-in-site)). Plant a case for your check:

- **In a page:** edit one of the HTML files. Keep `/clean.html` free of every problem: it's the page that must score 100 and send every security header.
- **In a response header:** change `standinHeaders(path)`.
- **In a site-level file:** add a branch in the request handler, as `/.git/HEAD` and `/robots.txt` have.

Tests can serve a fixed version of a page without touching the files, through `startStandin()`'s `transform(path, html)` and `headers(path, planted)` options. That's how `security.test.ts` checks that a fixed cookie closes its findings.

Then update every place that expects the stand-in's exact results:

| Where | Expects |
|---|---|
| `packages/core/src/a11y/scan.test.ts` | The exact SEO findings (`rule@path`), and the 7 accessibility issue groups |
| `packages/core/src/security/security.test.ts` | The exact open Security group keys with page counts (11), and the score |
| `apps/desktop-web/scripts/smoke.mjs` | 7 open accessibility issues, a few Site health titles, and 11 open Security findings (12 if the monitor has already run) |
| `apps/desktop/scripts/smoke.mjs` | 7 accessibility issues and exactly 11 open Security findings, through the Electron scanner |
| `apps/docs/content/contributing/testing.md` | The stand-in's planted problems and the counts |

## Demo data

The demo product's site, `fieldnote.example`, is seeded through the same code as a real scan: `seedDemoAccessibility()` in `packages/core/src/demo/accessibility.ts` calls `storePageResult()` for each page with a hand-built `PageResult` and response headers, then `finishScan()`. So:

- **A new page check runs on the demo by itself.** Check what it reports there and change the demo's `result()`, `security()` or `headers()` if it should look different.
- **A site-level check sees no responses**, because nothing is requested for a reserved host. Seed what the request would have found: `seedDemoSecurity()` inserts site-level `security_occurrences` (`security-txt-missing`, `dmarc-none`) before folding them, and the SEO seed inserts its `ai-training-blocked` finding directly.

`packages/core/src/demo/seed.test.ts` expects the demo's open Security group keys and its security score, so update it with the demo. To look at the result, load the demo into an isolated data folder with `STARTICA_DATA_DIR="$HOME/startica-demo" yarn seed:demo --force` (see [Development setup](/contributing/dev-setup#demo-data)).

## Document it

In the same pull request:

- Add the check to the user-facing list: [Security checks](/security/checks) (the table for its area, with its severity) or [Site health](/seo/site-health#every-check) (check, severity, when it's reported, how to fix). Content and PDF checks are described in [Content and documents](/accessibility/content-and-documents).
- Update the stand-in tables and counts in [Testing](/contributing/testing#accessibility-stand-in-site).
- Update the module's section in `ARCHITECTURE.md` at the repo root (10.2 or 11.2) if it lists the checks.

## Before you open a pull request

Run the checks from the repo root:

```bash
yarn typecheck && yarn lint && yarn test && yarn smoke:desktop
yarn workspace @startica/desktop smoke
yarn workspace @startica/docs check
```

`yarn test` includes the end-to-end scan tests, which skip themselves when Playwright's Chromium isn't installed; install it (`yarn workspace @startica/desktop-web playwright install chromium`) so they run. The desktop smoke test is the only one that scans through the Electron scanner, and it expects the stand-in's exact Security count. The docs check fails on a page missing from the sidebar or a broken internal link.

In the pull request, say what the check reads, which requests it adds (if any), and what it reports on the stand-in and on the demo.
