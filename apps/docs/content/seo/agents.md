---
title: Agent readiness
description: "The Agents screen in SEO & GEO: whether AI agents can reach, read and use your site, every check with its rule and fix, the score, and the newer extras for agents."
layout: doc
---

**Agent readiness** is the fifth part of [SEO & GEO](/seo). More and more, people ask an AI assistant to look something up, compare products or get a task done, and the assistant opens websites to do it. These assistants and agents don't look at your site the way a person does: many read only the HTML your server sends, without running JavaScript, and they act through the names of buttons, links and fields. Agent readiness checks whether an agent can get to your public pages, make sense of them and use what's there.

This page explains what Startica requests and when, every check with its exact rule and how to fix it, the score, the unscored extras (API catalogs, MCP, WebMCP and Markdown for agents), the limits, the demo and every message you may see. The checks are fixed rules: they use no AI and cost nothing.

## Find it

Open **SEO & GEO → Agents** in the left sidebar. The screen is called **Agent readiness**. Like the rest of SEO & GEO, it works on a site of the product picked in the product switcher; when the product has more than one site, the switcher at the top picks which one.

The SEO & GEO **Overview** also shows the score, in the **AI search access** card: **Agent readiness: 79 / 100**, or **Agent readiness: not checked yet**. The line links to the Agents screen. It shows the latest check that finished. If that check couldn't check enough to score, the line reads **Agent readiness: too little to score yet**.

## Why it matters

When someone asks an assistant "which field notes app works offline, and what does it cost?", the assistant may search, then open the pages it found. If your home page is empty without JavaScript, your prices are drawn by a script, a bot check stops the request, or your `robots.txt` blocks the assistant, it answers from what it could read elsewhere: a competitor's page, an old review, or nothing.

The checks follow what agents need today:

- **Reach.** The page answers a plain request: no sign-in, no CAPTCHA or browser check, and `robots.txt` lets assistants fetch pages for the people who asked.
- **Read.** The content and prices are in the HTML, the page has a clear structure, and the home page says what the product is in structured data.
- **Act.** Buttons, links and form fields have names, so an agent can find and use them. These are the same problems an accessibility scan finds for screen readers.

Some newer signals, such as MCP servers and WebMCP tools, are listed but not scored: they're early, and most products don't need them yet.

> [!NOTE]
> These are checks, not a promise. A site that passes them all can still be skipped by an assistant, and each AI provider decides how its agents browse. Startica's checks are close to what Chrome's Lighthouse [Agentic Browsing](https://developer.chrome.com/docs/lighthouse/agentic-browsing/scoring) audits and Cloudflare's [agent readiness score](https://blog.cloudflare.com/agent-readiness/) look at, but not the same, so their results can differ.

## What Startica requests

Most checks use what the last scan already found: the Accessibility results, each page's text and structured data, and the `robots.txt` and `llms.txt` results from [Site health](/seo/site-health). On top of that, each check makes a few plain requests to the site, the way a simple agent reads it:

| Request | Why |
| --- | --- |
| The site's start address (the home page) | Text without JavaScript, bot checks, sign-in, WebMCP tools |
| The pricing page, if the scan found one | Prices in the text, bot checks, sign-in |
| The docs or help page, if the scan found one | Bot checks, sign-in |
| The home page again, with `Accept: text/markdown` | Whether the site answers in Markdown |
| `/.well-known/api-catalog`, `/openapi.json`, `/openapi.yaml`, `/swagger.json`, `/api/openapi.json` | An API description |
| `/.well-known/ai-catalog.json`, `/.well-known/mcp/server-card.json`, `/.well-known/mcp.json` | An MCP server for agents |

How the pages are found: the pricing page is the scanned page with the shortest path that has a path segment `pricing`, `plans`, `price`, `prices`, `buy` or `upgrade` (so `/pricing` and `/plans/team`, but not `/fieldnote-plans`). The docs page is found the same way with `docs`, `doc`, `documentation`, `help`, `support`, `guide`, `guides`, `kb`, `knowledge-base`, `knowledgebase`, `faq`, `changelog` or `manual`. Only pages the latest scan checked without an error count.

Every request:

- **Goes only to the site's own origin.** Same scheme, host and port as the site's start address. Links to other sites are never followed.
- **Is a plain GET.** No JavaScript, no cookies, no sign-in, nothing submitted. Redirects are followed, up to 15 seconds per request, and only the first 1 MB of each answer is read.
- **Identifies itself** with the user agent `StarticaAgentCheck/0.1 (+https://mystartica.com; checks sites their owners add)`, so you can see the requests in your logs.
- **Skips reserved names.** Nothing is requested for addresses ending in `.example`, `.test` or `.invalid`, such as the demo's `fieldnote.example`.

Nothing is sent to an AI provider. Results are stored only in your local database (the `agent_checks` table in `startica.db`). See [Privacy and security](/concepts/privacy-security#what-goes-over-the-network).

### How Startica identifies itself

Startica identifies itself honestly, as `StarticaAgentCheck`, not as ChatGPT, Claude or any other assistant. Many bot protection services let through only agents they recognize, by their published IP addresses or signed requests ([Web Bot Auth](https://datatracker.ietf.org/group/webbotauth/documents/)). On such a site, Startica may get a challenge that the named agents don't, and **No bot challenge on public pages** shows a problem. The screen says so too: "A site that lets only named AI agents through its bot protection may show a challenge here that those agents don't get." See [Bot challenge for Startica only](#bot-challenge-for-startica-only).

## When it runs

Agent readiness runs as the `agent_check` background job:

- **After every scan** of the site: a full scan, **Check a page**, a recheck from an issue, and a scan you stopped. A scan in which no page could be checked doesn't start one.
- **On Check now** on the Agents screen.

Only one check per site waits at a time: clicking **Check now** while one is waiting or running does nothing more. A check usually takes a few seconds (each request waits at most 15 seconds) and isn't retried if it fails. It has no schedule of its own; if the site has **Scan again automatically** on, the checks follow those scans. See [Background jobs](/reference/jobs).

Because the checks read the latest scan's results, fix the site, then run **Scan now** (or **Check a page** on the pages you changed) rather than only **Check now**: **Check now** re-requests the pages, but the accessibility, structured data and `robots.txt` results stay as of the last scan.

## The screen

From top to bottom:

- **The site switcher** and **Check now** (**Checking…** while a check is waiting or running).
- **"The last check didn't finish: …"** in red, when the most recent check failed. The rest of the screen shows the last check that worked.
- **Agent readiness:** the score out of 100, colored green at 80 or more, amber from 60 to 79 and red below 60, or a dash when there's no score; see [The score](#the-score). Under it, the counts ("7 passed · 3 worth fixing · 1 problem") and "Checked 2 h ago. Runs after every scan, and when you click Check now." Before the first check: "Not checked yet. It runs after the next scan, or click Check now."
- **Over time:** the score over the site's last 20 checks. "The trend shows after the second check" until there are two checks with a score.
- **Four groups of checks:** **Can agents reach it?**, **Can agents read it?**, **Can agents act on it?** and **Extras for agents**. Each check shows its status, its result in a sentence, sometimes a list of details (pages, rules or what to do), and, when it didn't pass, why it matters.
- **A note at the bottom:** "Startica requests your public pages the way a simple agent does: plain HTML, no JavaScript, no sign-in, identified as StarticaAgentCheck. A site that lets only named AI agents through its bot protection may show a challenge here that those agents don't get. Signals checked 2026-10-12."

Each check has one of five statuses:

| Status | Means | In the score |
| --- | --- | --- |
| **Passed** | Nothing to do. | Full weight |
| **Worth fixing** | Partly there, or a smaller problem. | Half the weight |
| **Problem** | Agents are likely stopped or misled here. | Nothing |
| **Good to know** | Information, not a problem: an unscored extra, or something that doesn't apply to every product. | Left out |
| **Not checked yet** | Startica couldn't check it: no scan yet, or the page couldn't be fetched. | Left out |

## Can agents reach it?

Whether an agent gets to the page at all. Each check here is worth 3.

### Key pages open without signing in

Weight 3. Agents don't sign in on someone's behalf to compare products, so the home, pricing and docs pages need to answer without an account.

Startica requests the home page and, if found, the pricing and docs pages. A page **asks for a sign-in** when:

- the request was redirected to a path with `login`, `log-in`, `signin`, `sign-in`, `auth`, `sso` or `session` in it (and the page asked for wasn't a sign-in page itself), or
- it answered HTTP 401, or
- it answered HTTP 403 and the answer isn't a bot challenge (those count under the next check instead).

| Status | Shown as |
| --- | --- |
| **Passed** | "/, /pricing, /docs open without an account." |
| **Problem** | "/pricing asks for a sign-in.", with each page and where it went, for example "/pricing → /login" or "/docs → HTTP 401". |
| **Not checked yet** | "No pages could be fetched." |

**How to fix it.** Make the pages public. A common case: Fieldnote's `/pricing` sat behind the app's sign-in because it was part of the web app, and anyone who wasn't signed in was sent to `/login`. Moving the plans to the public marketing site, or letting `/pricing` through without a session, fixes it. If only part of your docs needs an account, keep a public overview and getting-started guide.

### No bot challenge on public pages

Weight 3. A CAPTCHA or browser check stops an agent before it reads anything.

Startica looks at the same pages' answers, in this order, and names the first sign it finds:

| Sign | Named as |
| --- | --- |
| The header `cf-mitigated: challenge` | "a Cloudflare challenge (cf-mitigated: challenge)" |
| HTTP 402 with a `crawler-price` header | "Cloudflare's pay per crawl (HTTP 402 with a crawler price)" |
| HTTP 402 without it | "a payment-required response (HTTP 402)" |
| An `x-datadome` header on an error answer (HTTP 400 or more) | "a DataDome block" |
| Cloudflare's challenge page (`/cdn-cgi/challenge-platform/`, `_cf_chl_opt`, `cf-chl-`, or the title "Just a moment...") | "a Cloudflare browser check" |
| A Turnstile widget (`cf-turnstile`) | "a Cloudflare Turnstile challenge" |
| A reCAPTCHA (`g-recaptcha`) | "a reCAPTCHA" |
| An hCaptcha (`h-captcha`) | "an hCaptcha" |
| DataDome's challenge (`captcha-delivery.com`) | "a DataDome challenge" |
| Akamai's bot check (`_abck`, `ak_bmsc`, or "Access Denied" with a "Reference #") | "an Akamai bot check" |
| HTTP 403, 429 or 503 on a short page | "a refusal (HTTP 403)" |

The markers in the page (from the Cloudflare browser check down) count only on a short page (fewer than 150 words of text) or an error answer. A long page that has a CAPTCHA on its signup or contact form isn't a wall: agents can still read it.

| Status | Shown as |
| --- | --- |
| **Passed** | "Public pages answered a plain request without a challenge." |
| **Problem** | "/ answered with a Cloudflare challenge (cf-mitigated: challenge).", with "Let known AI agents and assistants through your bot protection (for example Cloudflare's verified bots and AI crawler settings) for public pages." |
| **Not checked yet** | "No pages could be fetched." |

**How to fix it.** Fieldnote turned on a "challenge every visitor" rule during a spam wave, and every plain request to `fieldnote.example` got Cloudflare's "Just a moment..." page. The fix was to limit the challenge to the signup and sign-in pages, and leave the marketing pages, pricing and docs open. In general:

- Challenge only what needs protecting (sign-up, sign-in, checkout), not public pages.
- In your bot protection, allow verified bots and the AI assistants you want to reach you. On Cloudflare, check the bot settings and the AI crawler controls: new Cloudflare domains are asked whether to block AI crawlers, and blocking is the default.
- If you use Cloudflare's [pay per crawl](https://blog.cloudflare.com/introducing-pay-per-crawl/), assistants that don't pay get HTTP 402. That's your choice; this check just tells you it's happening.

You can see what a plain request gets from a terminal:

```bash
curl -sI https://fieldnote.example/ | grep -i -E '^(HTTP|cf-mitigated)'
```

### Assistants may fetch pages for their users

Weight 3. When someone asks an assistant about your product or pastes your link, the assistant fetches the page on their behalf. These fetchers have their own names in `robots.txt`: `ChatGPT-User`, `Claude-User` and `Perplexity-User`.

This check reads the **AI crawlers** results from the last scan (see [AI crawlers and llms.txt](/seo/ai-crawlers#how-startica-reads-robots.txt)): whether `robots.txt` lets each of them read the site's start address.

| Status | Shown as |
| --- | --- |
| **Passed** | "robots.txt lets ChatGPT-User, Claude-User, Perplexity-User fetch pages." |
| **Problem** | "robots.txt blocks Claude-User.", with "Allow the user agents that fetch pages on a person's request. You can still block training crawlers." |
| **Not checked yet** | "Checked during the next scan." |

**How to fix it.** Fieldnote wanted to keep its pages out of Anthropic's model training and wrote one group for everything from Anthropic:

```text
User-agent: ClaudeBot
User-agent: Claude-User
Disallow: /
```

That also stopped Claude from opening `fieldnote.example` when someone asked about it. Block only the training crawler, and let the user fetcher in:

```text
User-agent: ClaudeBot
Disallow: /

User-agent: Claude-User
Allow: /
```

Then run **Scan now**: `robots.txt` is read when a scan finishes. The full example for every AI crawler is in [AI crawlers and llms.txt](/seo/ai-crawlers).

> [!NOTE]
> Operators treat these user fetchers differently. Anthropic says `Claude-User` follows `robots.txt`; OpenAI says `robots.txt` rules may not apply to `ChatGPT-User`, and Perplexity says `Perplexity-User` generally ignores them. Startica reports what your file asks for, not what each assistant does.

## Can agents read it?

Whether what an agent gets makes sense without a person looking at the screen.

### Content is in the HTML

Weight 3. Many AI assistants and agents read the page's HTML without running JavaScript. Anthropic's web fetch tool, for example, [doesn't support pages rendered with JavaScript](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool). If the text only appears after scripts run, they see an empty page.

Startica counts the words in the home page's HTML as it arrives: it removes `<script>`, `<style>`, `<noscript>`, `<template>` and `<svg>` blocks, comments and tags, and counts the words that have a letter or digit. It compares that with the words the scan counted after the page ran its scripts.

| Status | Rule | Shown as |
| --- | --- | --- |
| **Problem** | Fewer than 40 words | "The home page's HTML has 3 words of text before scripts run: agents that don't run JavaScript see an almost empty page.", with "Render the main content on the server (server-side rendering or static generation)." |
| **Worth fixing** | Fewer than 150 words, and the page shows more than three times as many after scripts run | "The HTML has 90 words before scripts run; the page shows about 640 after. Much of it depends on JavaScript." |
| **Passed** | Anything else | "The home page's HTML has 412 words of text without running scripts." |
| **Not checked yet** | The home page couldn't be fetched | "The home page couldn't be fetched." |

**How to fix it.** Fieldnote's first home page was a single-page app. Its HTML was a title and an empty `<div id="root"></div>`; everything else was drawn by a script bundle. To an agent it was a three-word page. The fix is to send the content in the HTML: server-side rendering or static generation in your framework, or prerendering for the public pages. Interactive parts can still load with JavaScript on top.

Text inside `<noscript>` doesn't count: agents that don't run scripts don't always read it either. To see what a plain request gets:

```bash
curl -s https://fieldnote.example/ | head -c 2000
```

### Pages have a clear structure

Weight 2. One main area, a title and headings in order let an agent tell the content from the menus and find its way.

This check reads the site's open [Accessibility](/accessibility/results) issues for these axe-core rules: `landmark-one-main`, `page-has-heading-one`, `heading-order`, `document-title`, `html-has-lang` and `region`.

> [!TIP]
> Four of these rules (`landmark-one-main`, `page-has-heading-one`, `heading-order` and `region`) are axe-core best practices, which a scan only runs when **Also check best practices** is on in the site's [settings](/accessibility#site-settings). It's off by default. With it off and nothing failing, the check still passes, but says so: "The page titles and language are set. Landmarks and headings weren't checked: turn on best-practice checks in the site's settings (Accessibility)." Turn the setting on and scan again to have landmarks and headings checked too.

### How the accessibility-based checks are judged

**Pages have a clear structure**, **Buttons and links have names** and **Form fields are labeled** work the same way, each with its own rules:

| Status | Rule | Shown as |
| --- | --- | --- |
| **Passed** | No open issue for any of the rules | "No problems found by the accessibility checks." (for structure without best-practice checks, the message in the tip above) |
| **Worth fixing** | Open issues, each on one page | "1 accessibility issue on up to 1 page: fixing them for screen readers fixes them for agents.", with the rule and page count, for example "label (1 page)" |
| **Problem** | At least one open issue on more than one page | "2 accessibility issues on up to 6 pages: fixing them for screen readers fixes them for agents.", with "image-alt (6 pages)" and "link-name (6 pages)" |
| **Not checked yet** | The site hasn't finished a scan | "Runs after the first scan." |

Only open violations count: issues you [ignored](/accessibility/results#ignore-an-issue) and items under [Needs review](/accessibility/results#needs-review) don't. Fix them as accessibility issues: each issue's page in **Accessibility → Issues** shows the elements and how to fix them. Fixing them for screen readers fixes them for agents.

### The home page describes the product in structured data

Weight 2. `Organization` and `Product` or `SoftwareApplication` data say exactly what the product is, who makes it and what it costs, without guessing from the layout.

Startica reads the structured data (JSON-LD) types the scan found on the home page:

| Status | Rule | Shown as |
| --- | --- | --- |
| **Passed** | A `Product`, `SoftwareApplication`, `WebApplication`, `MobileApplication`, `Service` or `LocalBusiness` | "The home page describes the product (Organization, SoftwareApplication)." |
| **Worth fixing** | Only `Organization`, `Corporation` or `WebSite` | "The home page has Organization, but nothing that describes the product itself.", with "Add Product or SoftwareApplication with name, description and offers." |
| **Problem** | None of these | "The home page has no structured data about the product or company." |
| **Not checked yet** | The home page isn't among the scanned pages | "Runs after the first scan." |

**How to fix it.** Add a JSON-LD block to the home page. For Fieldnote:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Fieldnote",
  "description": "A note-taking app for field researchers: offline notebooks, photos and GPS tags, synced when you're back online.",
  "applicationCategory": "ProductivityApplication",
  "operatingSystem": "iOS, Android, Web",
  "url": "https://fieldnote.example",
  "publisher": { "@type": "Organization", "name": "Fieldnote", "url": "https://fieldnote.example" },
  "offers": [
    { "@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "USD" },
    { "@type": "Offer", "name": "Pro", "price": "8", "priceCurrency": "USD" }
  ]
}
</script>
```

**Draft structured data** on the matching card in [Opportunities](/seo/opportunities#structured-data) writes one for you to copy, checked by Site health's rules. Run **Check a page** on the home page afterwards.

### Pricing is in plain text

Weight 3. "How much is it?" is one of the first things agents are asked. Prices drawn by scripts, shown in images or behind a sign-in can't be quoted.

Startica requests the pricing page (see [What Startica requests](#what-startica-requests) for how it's found) and reads its visible text: the HTML without tags, and without the contents of `<script>`, `<style>`, `<noscript>`, `<template>` and `<svg>` blocks, so prices that only sit in a script's data don't count. In that text it looks for a price: a currency sign before a number (`$8`, `€ 7`), a number with a currency code (`8 USD`; also EUR, GBP, CAD, AUD, JPY and INR), "per month", "per year", "per user", "per seat" or "per member", `/mo`, `/month`, `/yr` or `/year`, or a free plan: "free plan", "free tier", "free forever", "free version", "free for …", or "plan" or "tier" followed by "free" in the same sentence. "Free trial" alone isn't a price.

| Status | Rule | Shown as |
| --- | --- | --- |
| **Passed** | A price is in the HTML | "/pricing states prices in its HTML." |
| **Worth fixing** | No price found | "/pricing has no prices in its HTML: they may be drawn by scripts, shown in images, or missing." |
| **Worth fixing** | No pricing page among the scanned pages | "No pricing page found among the scanned pages (paths like /pricing or /plans).", with "If the product is free or prices are on another page, say so in plain text there and link it from the menu." |
| **Not checked yet** | The pricing page couldn't be fetched | "/pricing couldn't be fetched." |
| **Not checked yet** | The site has no scanned pages yet | "Runs after the first scan." |

**How to fix it.** Fieldnote's `/pricing` loaded its plans from an API and drew the cards with a script, so the HTML had headings and an empty list. Putting the plans in the HTML fixed it:

```html
<h2>Pro</h2>
<p>$8 per user per month, billed yearly. Unlimited notebooks and team sharing.</p>
```

If your prices are on the home page or only in a sales conversation, a short `/pricing` page that says so in words ("Free for one notebook. Teams: contact us for a quote.") still helps an agent answer.

### Docs or help pages are public

Weight 1. Agents answer "how do I…" questions from your docs. Public, crawlable docs make those answers right.

| Status | Rule | Shown as |
| --- | --- | --- |
| **Passed** | A docs, help, support, FAQ or changelog page is among the scanned pages, and it opens for a plain request | "/docs/getting-started is public." |
| **Worth fixing** | The docs page was found, but the plain request ended on a sign-in page or answered HTTP 400 or more | "/docs didn't open for a plain request (it asks for a sign-in)." or "/docs didn't open for a plain request (HTTP 403)." |
| **Good to know** | None found | "No docs, help or changelog pages found among the scanned pages. Fine for a simple product; worth adding as questions come in." |

Having no docs doesn't lower the score: **Good to know** is left out of it. If your docs live on another domain (such as `docs.fieldnote.example`), they aren't on this site, so this check doesn't see them; add that domain as its own site to check it.

### llms.txt

Weight 1. A short Markdown guide to the site at `/llms.txt` helps language models find the pages that matter. It's a [proposal](https://llmstxt.org/), not a standard: cheap to add, not required. Google says its AI features don't need it.

This check reads the `llms.txt` result from the last scan; see [AI crawlers and llms.txt](/seo/ai-crawlers#llms.txt).

| Status | Shown as |
| --- | --- |
| **Passed** | "/llms.txt is there." |
| **Worth fixing** | "/llms.txt is there but doesn't start with a Markdown # title." or "No /llms.txt." |
| **Not checked yet** | "Checked during the next scan." |

**How to fix it.** **Draft llms.txt** on the **No llms.txt** card in [Opportunities](/seo/opportunities#llms.txt) writes one from the pages the scan found.

## Can agents act on it?

Whether an agent can find its way and use what's there. Both checks read the site's open Accessibility issues, judged as in [How the accessibility-based checks are judged](#how-the-accessibility-based-checks-are-judged).

### Buttons and links have names

Weight 3. Agents act through the names of buttons, links and fields. An icon button with no name is a button an agent can't find or trust.

Rules: `button-name`, `link-name`, `input-button-name`, `aria-command-name`, `image-alt` and `role-img-alt`.

**How to fix it.** Fieldnote's header had a search button that was only a magnifier icon, and its logo link had an image with no `alt`, on every page. Give each control a name:

```html
<button type="button" aria-label="Search"><svg aria-hidden="true">…</svg></button>
<a href="/"><img src="/logo.svg" alt="Fieldnote home"></a>
```

### Form fields are labeled

Weight 2. To fill a form (a search, a signup, a contact form), an agent needs to know what each field is for.

Rules: `label`, `select-name`, `aria-input-field-name` and `autocomplete-valid`.

**How to fix it.** Give every field a visible `<label>`, and use valid `autocomplete` values:

```html
<label for="email">Work email</label>
<input id="email" name="email" type="email" autocomplete="email">
```

## Extras for agents

Newer ways to make a site easy for agents. They show as **Passed** when found and **Good to know** when not, and they're never part of the score: most sites don't have them, and the standards are young. A file only counts when it answers HTTP 200 with a type other than HTML, because many single-page apps answer every path with their HTML page.

### Machine-readable API description

If the product has an API, an OpenAPI description lets agents use it without guessing.

| Status | Shown as |
| --- | --- |
| **Passed** | "Found /.well-known/api-catalog, /openapi.json." |
| **Good to know** | "No OpenAPI description or /.well-known/api-catalog found. Only matters if the product has an API." |

Startica looks for `/.well-known/api-catalog`, `/openapi.json`, `/openapi.yaml`, `/swagger.json` and `/api/openapi.json` on the site. The API catalog is [RFC 9727](https://www.rfc-editor.org/rfc/rfc9727.html): a small JSON file at `/.well-known/api-catalog` (type `application/linkset+json`) that lists your APIs with the link relations of [RFC 8631](https://www.rfc-editor.org/rfc/rfc8631.html): `service-desc` for the machine-readable description, `service-doc` for the human docs. For Fieldnote:

```json
{
  "linkset": [
    {
      "anchor": "https://fieldnote.example/api/",
      "service-desc": [{ "href": "https://fieldnote.example/api/openapi.json", "type": "application/json" }],
      "service-doc": [{ "href": "https://fieldnote.example/docs/api", "type": "text/html" }]
    }
  ]
}
```

### Tools for agents (MCP or WebMCP)

Some products give agents defined tools to act through, instead of clicking:

- **An MCP server.** The [Model Context Protocol](https://modelcontextprotocol.io) lets agents call a product's tools directly. [MCP Server Cards (SEP-2127)](https://modelcontextprotocol.io/seps/2127-mcp-server-cards) describe a server (its name, description and where to connect), and a site lists its cards in an AI catalog at `/.well-known/ai-catalog.json`. Startica looks for `/.well-known/ai-catalog.json`, and for the older paths `/.well-known/mcp/server-card.json` and `/.well-known/mcp.json`, which some tools still check. See the [Server Card extension](https://github.com/modelcontextprotocol/experimental-ext-server-card) and the [AI catalog](https://github.com/Agent-Card/ai-catalog) for the formats.
- **WebMCP tools in the page.** [WebMCP](https://webmachinelearning.github.io/webmcp/) is a W3C community group draft, in a Chrome origin trial, that lets a page offer tools to the browser's agent. Startica looks in the home page's HTML for `modelContext.registerTool` or `modelContext.provideContext` (the older `navigator.modelContext` spelling counts too), or the form attributes `toolname` and `tooldescription`.

| Status | Shown as |
| --- | --- |
| **Passed** | "Found /.well-known/ai-catalog.json; WebMCP tools in the home page." (whichever were found) |
| **Good to know** | "No MCP Server Card, AI catalog or WebMCP tools found. Not expected yet for most products." |

The simplest WebMCP tool is a form with two attributes, which Chrome's documentation calls declarative WebMCP:

```html
<form action="/help/search" toolname="search_help" tooldescription="Search Fieldnote's help articles">
  <input name="q" toolparamdescription="What to search for">
  <button>Search</button>
</form>
```

Or register a tool from script:

```html
<script>
  document.modelContext?.registerTool({
    name: "search_help",
    description: "Search Fieldnote's help articles",
    inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
    execute: async ({ q }) => (await fetch(`/help/search.json?q=${encodeURIComponent(q)}`)).json(),
  });
</script>
```

Startica only sees tools in the home page's own HTML: a tool registered from a separate script file, or on another page, isn't found.

### Pages in Markdown for agents

Some sites answer a request that asks for Markdown (`Accept: text/markdown`) with a clean Markdown version of the page, which agents read more reliably and with fewer tokens than HTML.

| Status | Shown as |
| --- | --- |
| **Passed** | "The home page answers in Markdown when asked for it." |
| **Good to know** | "Pages answer in HTML only. Optional: some hosts (Cloudflare's Markdown for Agents, for example) can serve Markdown to agents that ask." |

To add it, turn on Cloudflare's [Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/) if your site is on a Cloudflare plan that has it, or have your server answer `Accept: text/markdown` with a Markdown copy, `Content-Type: text/markdown` and `Vary: Accept`. To test:

```bash
curl -sI -H 'Accept: text/markdown' https://fieldnote.example/ | grep -i content-type
```

## The score

The score is out of 100, over the eleven scored checks and their weights (26 in all):

| Check | Weight |
| --- | --- |
| Key pages open without signing in | 3 |
| No bot challenge on public pages | 3 |
| Assistants may fetch pages for their users | 3 |
| Content is in the HTML | 3 |
| Pricing is in plain text | 3 |
| Buttons and links have names | 3 |
| Pages have a clear structure | 2 |
| The home page describes the product in structured data | 2 |
| Form fields are labeled | 2 |
| Docs or help pages are public | 1 |
| llms.txt | 1 |

- **Passed** earns the check's full weight, **Worth fixing** half, **Problem** nothing.
- **Good to know** and **Not checked yet** are left out, of both what was earned and what was possible. The extras have no weight.
- Score = earned ÷ the weight of the checks that were checked × 100, rounded.
- **No score until half is known.** If the checks that could be checked weigh less than half of 26, the score is a dash: too little was checked to mean anything.

### A worked example

The demo's first check of `fieldnote.example` earns 3 each for sign-in, bot checks, assistants' access and content (12), 2 for structure, 1 for docs, half of 2 for structured data (1), half of 3 for pricing (1.5), half of 2 for forms (1), half of 1 for `llms.txt` (0.5) and nothing for named controls: 19 of 26, a score of **73**. A week later, the pricing page has its prices in the HTML, so pricing earns its full 3: 20.5 of 26, a score of **79**.

## Limits

- **Startica isn't a named agent.** See [How Startica identifies itself](#how-startica-identifies-itself).
- **Plain requests only.** The checks show what a simple agent reading HTML gets. Agents that drive a real browser, such as ChatGPT agent, run JavaScript and may see more. Startica doesn't run an agent or try tasks on your site.
- **A few pages.** Content without JavaScript is judged on the home page only, prices on one pricing page, and pages are found by their paths. A pricing section on the home page, or a page at a path like `/fieldnote-plans`, isn't found as a pricing page.
- **`robots.txt` for the start address.** As in Site health, Startica checks whether each user fetcher may read the start address, and reports what the file asks for, not what each assistant does.
- **Young signals.** MCP Server Cards, the AI catalog, WebMCP and Markdown for agents are new and changing. The signals were checked on 2026-10-12, and Startica's list is updated with the app.
- **Results, not rankings.** Passing every check doesn't mean an assistant will use or recommend your site.

## Troubleshooting

| What you see | What it means and what to do |
| --- | --- |
| "Not checked yet. It runs after the next scan, or click Check now." | The site hasn't been checked. Run a scan or click **Check now**. |
| A dash instead of a score, or **too little to score yet** on the Overview | Fewer than half the scored checks could be checked: usually the site hasn't finished a scan, or Startica couldn't reach it. Scan the site, then check again. |
| Most checks say "couldn't be fetched" or "No pages could be fetched." | The requests failed: the site was down, didn't answer within 15 seconds, or is on a reserved name (`.example`, `.test`, `.invalid`), which is never requested. Check the address in [site settings](/accessibility#site-settings). |
| "The last check didn't finish: …" | The `agent_check` job failed with that error. It isn't retried; click **Check now** to try again. The screen keeps showing the last check that worked. |
| **Check now** shows **Checking…** and does nothing more | A check for the site is waiting or running. Background jobs run while Startica is open; see the **System** page. |
| "Checks are off in the demo" | In the [demo](/guides/demo-mode), **Check now** is disabled. |
| "No pricing page found…" but you have one | Its path doesn't have one of the pricing words as a whole segment, it isn't among the scanned pages (check the page cap and page patterns in [site settings](/accessibility#site-settings)), or it failed in the last scan. |
| An extra shows **Good to know** although the file is there | It must answer HTTP 200 on the same site, with a type other than HTML. A JSON file served as `text/html`, or a file on another subdomain, doesn't count. |
| A fix doesn't show | The accessibility, structured data, `robots.txt` and `llms.txt` results come from the last scan. Run **Scan now**, or **Check a page** on the pages you changed; the check runs again when the scan finishes. |

### Bot challenge for Startica only

If **No bot challenge on public pages** shows a problem, but you allow verified bots or named AI agents in your bot protection, the named agents may well get through while Startica doesn't. Check your bot protection's event log for requests from the agents you care about (for example `Claude-User` or `ChatGPT-User`) to see what they got. If they pass, the problem on this screen is only Startica's, and you can leave it. If you'd rather Startica see what a plain agent sees, let `StarticaAgentCheck` through for your public pages.

## In the demo

In [demo mode](/guides/demo-mode), the Agents screen shows two sample checks of `fieldnote.example` a week apart. In the first (score 73), the pricing page has no prices in its HTML, the home page has only `Organization` structured data, there's no `llms.txt`, images and links without names are on six pages (a **Problem**) and a form field has no label on one page. In the second (score 79), the pricing page states its prices; everything else is the same. The **Over time** chart shows both, and the Overview shows **Agent readiness: 79 / 100**.

Outside calls are off in the demo, so **Check now** is disabled ("Checks are off in the demo"), and no requests are made.

## Related

- [SEO & GEO](/seo)
- [AI crawlers and llms.txt](/seo/ai-crawlers): `robots.txt` for AI crawlers and user fetchers
- [Site health](/seo/site-health): structured data and the other technical checks
- [Opportunities](/seo/opportunities): drafts for structured data and `llms.txt`
- [Reading the results](/accessibility/results): the accessibility issues behind the "act" checks
- [Background jobs](/reference/jobs)
- [Privacy and security](/concepts/privacy-security)
