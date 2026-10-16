---
title: SEO & GEO
description: Check your product's websites for what search engines, AI assistants and AI crawlers need, see how the site does in Google and Bing, see whether AI assistants recommend the product, get a ranked list of what to fix with drafts to copy, check whether AI agents can use the site, and see which sites AI answers cite and whether you're on them.
layout: doc
---

The **SEO & GEO** module helps a product get found: in search results (SEO), in the answers AI assistants give when people ask for recommendations (GEO, generative engine optimization), and by AI agents that browse sites for people. It has six parts:

- **Site health** checks every page of your site for the technical basics that search engines and AI systems rely on, and lists what to fix, most important first. The checks run on your computer, during the same scan as [Accessibility](/accessibility), and use no AI, so they cost nothing.
- **Search** shows how the site actually does in search: the queries people find it with, clicks, impressions and positions from Google Search Console and Bing, flags for queries close to the top, and visits from search engines and AI assistants. It reads your own free Search Console and Bing accounts, and uses no AI.
- **AI visibility** asks an AI assistant the questions your customers ask, with web search on, and shows whether it mentions and recommends the product, in what place, which competitors it names instead and which pages it cites. It uses your AI key, so each run costs a little, with a cap you set.
- **Opportunities** turns what the other three found into one ranked list of what to do next, each with why and what to do, and has the AI draft fixes for you to copy: titles and descriptions, structured data, `llms.txt` and FAQ answers. The list is built from rules and is free; each draft costs a few cents.
- **Agents** checks whether AI agents (assistants that browse, compare and act for people) can reach your public pages, read them without running JavaScript, and use their buttons, links and forms, and scores the site's agent readiness. It runs after every scan, makes a few plain requests to your own site, and uses no AI, so it costs nothing.
- **Off-site** takes the pages AI visibility answers cited, groups them by site (communities, directories and reviews, articles, videos, competitors' sites), reads them to see whether you and your competitors appear, and suggests what you can honestly do about each. It reads the pages politely from your computer and uses no AI, so it costs nothing.

![The SEO & GEO overview for the demo site fieldnote.example: site health 96 out of 100, 5 problems to fix, open to AI search, 1,006 clicks from Google in 28 days, 50% AI visibility, and a Fix these first table](/images/app/seo.png)

This page covers what the module does, how to find it, and where it runs. [Site health](/seo/site-health) explains the screen, every check and the score. [Search performance](/seo/search) explains the Search screen. [AI visibility](/seo/ai-visibility) explains how runs work, what they cost and how to read them. [Opportunities](/seo/opportunities) explains every kind of opportunity, the ranking and the drafts. [Agent readiness](/seo/agents) explains every agent check, the score and the newer extras for agents. [Off-site presence](/seo/off-site) explains where its data comes from, how pages are read and every suggestion. [AI crawlers and llms.txt](/seo/ai-crawlers) explains how Startica reads your `robots.txt` for AI crawlers, and what `llms.txt` is.

> [!WARNING]
> Site health's results are checks, not rankings. A site with no problems found can still rank poorly or never be mentioned in AI answers, and fixing everything here guarantees no place in search results or AI answers. Search engines and AI providers decide that themselves, using far more than these checks can see.

## What it does

- **Checks every page for search basics.** Titles, meta descriptions, main headings, `noindex`, canonicals and structured data (JSON-LD), on every page the scan checks.
- **Checks the site as a whole.** Duplicate titles and descriptions, broken internal links, pages only reachable through the sitemap, and a missing sitemap.
- **Checks AI access.** Which AI crawlers your `robots.txt` lets in, by what they're for (training, AI search, or fetching a page someone asked about), and whether the site has an `llms.txt`.
- **Groups problems.** One problem shared by several pages (for example one title used on three pages) is one card with its pages, so you fix it once.
- **Ranks what to fix.** **Fix these first** lists the five most important problems.
- **Scores the site.** A site health score out of 100, Startica's own measure of progress. See [The score](/seo/site-health#the-score).
- **Shows search performance.** Clicks, impressions, click-through rate and average position from [Google Search Console](/credentials/search-console) and, optionally, [Bing Webmaster Tools](/credentials/bing-webmaster), for the site and for each query, page, country and device, over 7 days to 12 months, with the change against the period before.
- **Flags queries worth work.** **Striking distance** marks queries on page 1 or 2 that could move up; **Low click-through** marks first-page queries that get far fewer clicks than their position usually does. Brand and non-brand queries are told apart. See [Search performance](/seo/search#queries).
- **Counts visits from AI assistants.** From Google Analytics or Umami: organic search visits, and visits from ChatGPT, Perplexity, Claude, Gemini, Copilot and other assistants. See [Visits from search and AI assistants](/seo/search#visits-from-search-and-ai-assistants).
- **Ranks what to do next.** One list across Site health, Search and AI visibility: queries close to page 1, pages with low click-through or lost clicks, site problems, questions where AI assistants name competitors instead of you, and comparison pages they cite. Each can go to the Roadmap or Today. See [Opportunities](/seo/opportunities).
- **Drafts fixes to copy.** On request, the AI drafts titles and descriptions, JSON-LD, an `llms.txt` or an FAQ answer, checked before it's shown, or writes a blog article in Content Studio. Startica never changes your site.
- **Checks agent readiness.** Whether the home, pricing and docs pages open without a sign-in or a bot challenge, whether `robots.txt` lets assistants fetch pages for their users, whether the content and prices are in the HTML, and whether controls and form fields have names, with a score out of 100 and its trend. See [Agent readiness](/seo/agents).
- **Shows where AI answers get their sources.** The sites cited in the last 4 AI visibility runs, ranked by how many answers cited them without mentioning you, whether you and your competitors are on their pages, what to do about each, and **Watch** for cited subreddits, which adds them to the communities the Inbox reads. Startica never posts, signs up or contacts anyone. See [Off-site presence](/seo/off-site).
- **Measures AI visibility.** Asks the `answer` model your customers' questions, with web search, and reports how often it mentions and recommends the product, its average position, how often it cites your pages, and its share of voice against your competitors, run by run. See [AI visibility](/seo/ai-visibility).

## Find it in the sidebar

**SEO & GEO** is its own collapsible section in the left sidebar, after **Accessibility**:

| Page | What it shows |
| --- | --- |
| **Overview** | The site health score, the number of problems, AI search access with the latest agent readiness score (or "too little to score yet"), clicks from Google over 28 days, the share of AI answers that mention the product, **Fix these first**, and the **AI crawlers** table. |
| **Site health** | Every problem, grouped by area, with why it matters, how to fix it and the pages it's on. |
| **Search** | Clicks, impressions, click-through rate and position from Google and Bing, queries with flags, pages, countries and devices, sitemaps, and visits from search and AI assistants. |
| **AI visibility** | Your questions, whether an AI assistant mentions and recommends the product for each, share of voice against competitors, the trend over runs, and every answer with its sources. |
| **Opportunities** | What to do next, ranked, from Site health, Search and AI visibility, with fix drafts to copy, and the **AI audits** (SEO and AI search). |
| **Agents** | Agent readiness: a score out of 100 and its trend, and every check of whether AI agents can reach, read and act on the site, with why it matters. |
| **Off-site** | Off-site presence: the sites AI answers cite, by kind, whether you and your competitors appear on them, and a suggestion for each. |

Like the rest of Startica, SEO & GEO works on the product picked in the product switcher. When the product has more than one site, a switcher at the top of the Overview and Site health picks which one you're looking at. **Search** shows the Search Console property and Bing site connected for the product, whichever site that is.

## Sites and scans are shared with Accessibility

Site health uses the same sites as Accessibility, and the same scan:

- **One list of sites.** Add a site from either module (with no site yet, the SEO & GEO Overview shows "Check how _product_'s website does in search and AI answers" with **Add the site**), or in **Settings → Products → Sites**. The fields and site settings are the same; see [Add a site](/accessibility#add-a-site) and [Site settings](/accessibility#site-settings). Page patterns, the page cap and **Follow the site's robots.txt** apply to both modules.
- **One scan.** Every page is rendered once in Chromium and checked for accessibility and for search and AI at the same time. **Scan now** and **Check a page** on the SEO & GEO Overview start the same scan as the buttons on the Accessibility Overview. See [Scanning a site](/accessibility/scanning).

So a site is crawled once, and both modules' results are from the same moment.

## What it doesn't do

- **It doesn't change your site.** Startica tells you what to fix; you change the site.
- **It doesn't track rankings for queries you don't appear for.** Search shows what Search Console and Bing report: searches where your site was shown. It isn't a rank tracker for keywords you pick.
- **It doesn't see inside the consumer AI apps.** [AI visibility](/seo/ai-visibility) asks a model through your API key, not ChatGPT, Claude, Perplexity or Gemini as people use them, so treat it as a trend. Google's AI Overviews and AI Mode have no API; they're counted inside Google's search totals, not separately. See the limits of [AI visibility](/seo/ai-visibility#limits) and [Search](/seo/search#limits).
- **AI only where you ask for it.** Site health's checks are fixed rules over the pages the scan loaded, Search shows the numbers Google, Bing and GA4 or Umami report, the Opportunities list is built from rules over both, and the agent and off-site checks are fixed rules too; all free. AI visibility runs, Opportunities' drafts and Content Studio articles use your AI key and budget. The AI-written SEO and AI search reviews are a separate thing, the [Audits](/guides/audits) at the bottom of **Opportunities**.
- **It doesn't publish fixes.** Drafts are for you to review and copy into your site.
- **It doesn't do outreach.** [Off-site presence](/seo/off-site) shows where AI answers get their sources and suggests what to do, but Startica never posts, signs up, submits listings, writes reviews or contacts anyone for you.

## Where it runs

Site health runs wherever Accessibility scans run: in the Startica desktop app, or in browser development mode with Playwright's Chromium installed. See [Where it runs](/accessibility#where-it-runs). Search syncs with the daily metrics sync at 08:15 while Startica is open, and on **Sync now**; see [How syncing works](/seo/search#how-syncing-works). AI visibility runs when you click **Run now**, and, if you turn it on, every Monday at 09:30 while Startica is open; see [Weekly runs](/seo/ai-visibility#weekly-runs). Agent readiness runs after every scan and on **Check now**, with plain requests that need no browser; see [When it runs](/seo/agents#when-it-runs). Off-site presence reads the cited pages after every AI visibility run that answered something, and on **Read the pages again**; see [When it runs](/seo/off-site#when-it-runs).

In [demo mode](/guides/demo-mode), scans, syncs and AI are off, and the Overview, Site health, Search and AI visibility show sample results for `fieldnote.example`. Opportunities are built from that sample data, and drafts are off. Agents shows two sample checks, and **Check now** is off. Off-site shows the sites the sample answers cite, with sample page reads, and **Read the pages again** is off.

## Phases

SEO & GEO was built in six phases, and all of them are available now:

| Phase | Name | What it's for |
| --- | --- | --- |
| G1 | **Site health** | Technical checks for search and AI on every page. See [Site health](/seo/site-health). |
| G2 | **Search performance** | Google Search Console and Bing, the queries you're found for, clicks, positions and trends, and visits from AI assistants. See [Search performance](/seo/search). |
| G3 | **AI visibility** | Whether AI assistants mention and recommend the product for the questions your audience asks, and who they recommend instead. See [AI visibility](/seo/ai-visibility). |
| G4 | **Opportunities** | Ranked fixes and content ideas from the other three, with drafts you can copy. See [Opportunities](/seo/opportunities). |
| G5 | **Agent readiness** | Whether AI agents can reach, read and use the site, with a score. See [Agent readiness](/seo/agents). |
| G6 | **Off-site presence** | Which sites AI answers in your category cite, whether you and your competitors appear there, and what to do about it. See [Off-site presence](/seo/off-site). |

## Related

- [Site health](/seo/site-health)
- [Search performance](/seo/search)
- [AI visibility](/seo/ai-visibility)
- [Opportunities](/seo/opportunities)
- [Agent readiness](/seo/agents)
- [Off-site presence](/seo/off-site)
- [Google Search Console](/credentials/search-console) and [Bing Webmaster Tools](/credentials/bing-webmaster)
- [AI crawlers and llms.txt](/seo/ai-crawlers)
- [Accessibility](/accessibility)
- [Scanning a site](/accessibility/scanning)
- [Privacy and security: accessibility scans](/concepts/privacy-security#accessibility-scans)
