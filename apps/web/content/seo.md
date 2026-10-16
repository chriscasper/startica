---
title: Get found in search, AI answers and by agents
layout: module
module: seo
eyebrow: SEO & GEO
docs: /seo
screenshot: /images/app/seo.png
screenshotAlt: "Startica's SEO & GEO overview for fieldnote.example: site health 96 out of 100, 5 problems to fix, open to AI search, 1,006 clicks from Google in 28 days, 50% AI visibility, and a Fix these first table of problems like a missing meta description"
lede: People find products through search engines, through AI assistants that recommend them, and more and more through AI agents that browse for them. Startica checks what each of them needs from your site, measures how you actually do with the engines' own data, and ranks what to fix first.
description: Startica's SEO & GEO module checks your site for search engines, AI crawlers and AI agents, reads your Search Console and Bing data, asks AI assistants your customers' questions, and ranks what to do next. Open source and on your desktop.
features:
  - title: Site health
    body: Titles, descriptions, headings, indexing, canonicals, structured data, broken links, orphan pages and sitemaps on every page, plus which AI crawlers your robots.txt lets in. A score and a ranked list of fixes.
    doc: /seo/site-health
  - title: Search
    body: Clicks, impressions, positions and queries from your own Google Search Console and Bing Webmaster Tools, with queries close to page one flagged, and visits from search and AI assistants.
    doc: /seo/search
  - title: AI visibility
    body: Asks an AI assistant, with web search on, the questions your customers ask. See whether it mentions and recommends you, in what place, which competitors it names instead, and which pages it cites.
    doc: /seo/ai-visibility
  - title: Opportunities
    body: One ranked list of what to do next, built from the other three, with drafts to copy for titles, descriptions, structured data, llms.txt and FAQ answers.
    doc: /seo/opportunities
  - title: Agent readiness
    body: Checks whether AI agents can reach your public pages without a sign-in or a bot challenge, read them without JavaScript, and use their buttons and forms.
    doc: /seo/agents
  - title: Off-site presence
    body: Groups the pages AI answers cite by site, reads them to see whether you and your competitors appear, and suggests what you can honestly do about each.
    doc: /seo/off-site
---

## How it works

Add your product's website once. Every scan loads each page in a real browser and runs the site health checks on it, in the same pass as the [Accessibility](/accessibility) and [Security](/security) checks, so there's no second crawl.

Connect Search Console (free, read-only) and, if you like, Bing, and Startica syncs your search numbers every day. AI visibility runs weekly, or whenever you press **Run now**, on the questions you choose.

**Opportunities** pulls it all into one list: queries close to page one, pages with fewer clicks than their position should earn, site problems, and questions where AI assistants name a competitor instead of you. Any item can go to Today or the Roadmap.

## Measured honestly

Search numbers come from the engines' own tools. AI visibility goes through your AI provider's API with web search, which approximates what people see in the consumer apps, and every result shows the question, the model and the date. Scores are Startica's own measure of progress, not a ranking.

## What it doesn't do

- **It doesn't change your site.** Every fix is text for you to copy.
- **It doesn't game the engines.** No cloaking, doorway pages, mass-generated content, fake reviews or link schemes.
- **It doesn't promise rankings.** A site with no problems found can still rank poorly. Search engines and AI providers decide that with far more than these checks can see.
- **It doesn't buy data for you.** Paid data sources are opt-in, with your own key.

## What it costs

The checks, agent readiness, off-site reads, Search Console and Bing cost nothing. AI visibility uses your AI key: a run of 20 questions costs about $1.30, capped at $2 by default. Each drafted fix costs a few cents. See [Costs and budget](https://docs.mystartica.com/concepts/costs).
