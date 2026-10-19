---
title: Glossary
description: The words Startica uses for the things it finds, writes, plans and measures, and how they relate.
layout: doc
---

Startica uses a small set of terms throughout the app and these docs. Most of them are also the names of tables in the local database, which helps if you're reading the code or the [data folder](/reference/data-folder).

## How the pieces fit

A **product** is what you market. Startica finds **conversations** on Reddit, Hacker News, Bluesky, Mastodon and Discourse forums (and X, with your own API token) and scores each one against the product. A scored conversation becomes an **opportunity**. Promising opportunities get a **draft**. When you post the draft yourself, you record it as a **publication**. **Connections** bring in **metric snapshots** that show whether any of it worked. The **roadmap** and the daily **moves** on Today turn all of that into what to do next. All AI work happens in background **jobs**, and every AI call is logged as an **AI run**.

## Core terms

| Term | Meaning |
| --- | --- |
| **Product** | Something Startica markets, for example Fieldnote at `https://fieldnote.example`. Has a name, website, one-liner and stage (Idea, Pre-launch, Launched, Growing), plus its brief, personas, competitors, keywords, communities and connections. Switch products in the header. |
| **Workspace** | The container for everything in one Startica install: products, AI settings and budget. There is one per install. |
| **Brief** (Intel) | What Startica knows about a product: positioning, personas, competitors, keywords and communities. Built on the **Intel** page from a crawl of the product's site and the AI's web research. You can edit it. |
| **Channel** | A place conversations happen: Reddit, Hacker News, X, LinkedIn, Facebook, Mastodon, Bluesky, Discourse or other. Startica scans Reddit, Hacker News, Bluesky, Mastodon and Discourse, and X only with your own [X API token](/credentials/x-api); LinkedIn, Facebook and other sites you paste by hand. See [Finding conversations](/guides/finding-conversations) and [Manual channels](/guides/manual-channels). Content Studio has its own channels, which add Blog, Newsletter and Email. |
| **Community** | A specific place on a channel. Suggested by Intel; you choose which ones to **Watch**. The format depends on the channel: a subreddit name without `r/` for Reddit (`fieldwork`), a hashtag on a server for Mastodon (`#fieldwork@mastodon.social`), or a forum's name with its address in the URL field for Discourse (`https://forum.example.com`). Bluesky and Hacker News are searched by keyword and have no communities. |
| **Conversation** | A post or comment found on a channel (a Reddit post, an HN comment, a pasted X thread). Stored once, even if it matches several products. |
| **Opportunity** | A conversation scored against one product, with a relevance score, an intent score, the reasoning and a suggested angle. Its status moves through `new`, `drafting`, `drafted`, `posted`, `archived`, `dismissed` or `failed`. Opportunities are what you work through in the **Inbox**. Not to be confused with the SEO & GEO **Opportunities** screen, which lists things to do on your site; see [Opportunities](/seo/opportunities). |
| **Draft** | A reply Startica wrote for an opportunity. Versioned: regenerating or editing creates a new version. Any product link gets UTM tags so visits can be traced back to it. See [Drafting replies](/guides/drafting-replies). |
| **Publication** | A draft you actually posted, recorded with its URL. Created when you click **Mark as posted**, or when you post with **Post…** and press the site's button. Startica never posts for you. Engagement on the publication (score, replies) is checked over time on Reddit, Hacker News, Bluesky, Mastodon and Discourse, and on X with an X API token. |
| **Posting window** | The **Post with Startica** window that **Post…** opens for X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse (beta). It shows the site's real page with your reply or post filled in; you press the site's own button and Startica saves the link. See [Posting with Startica](/guides/assisted-posting). |
| **Content piece** | A standalone post, thread, article, newsletter or email campaign written in **Content Studio**, as opposed to a reply to someone else's thread. |
| **Email campaign** | A Content Studio piece with 3 to 5 emails toward one goal, each with a subject, preview text, send day and body. Startica never sends it; you paste each email into your email tool. See [Content Studio](/guides/content-studio#email-campaigns). |
| **Voice profile** | A style guide Startica distills from sample posts by writers your audience already likes (voice sources and samples). Used when writing content so it doesn't sound generic. See [Voice profiles](/guides/voice-profiles). |
| **Roadmap item** | A longer-running piece of growth work, tied to a funnel stage (acquisition, activation, retention, revenue, referral) and usually a playbook. Each item is also an experiment: why, success metric, next step, priority, status and result. See [Roadmap](/guides/roadmap). |
| **Replan** | A pass by the AI over the roadmap that adds, updates or drops items based on results. Runs weekly and on demand, and records what changed and why. |
| **Playbook** | A reusable strategy template that roadmap items are built from, such as "Reddit value-first replies", "Landing page conversion" or "User referrals". Startica ships with ten. |
| **Move** | One item on the **Today** list, such as "reply to these 4 threads" or "rewrite the hero headline". Built each day from what's waiting and the roadmap. You mark moves done or skip them. See [Today](/guides/today). |
| **Getting started checklist** | Setup steps at the top of **Today** after the welcome wizard: connect AI, build intel, pick communities, run a first scan and post a first reply, plus optional analytics. Gone once those five are done or you hide it, and never shown in the demo. See [Your first day](/getting-started/first-day). |
| **Demo mode** | The desktop app restarted with Fieldnote, a sample product, in its own data folder (`demo` inside yours), with scans, AI and posting off. See [Try the demo](/guides/demo-mode). |
| **Audit** | A one-off review of the product's site: landing page, onboarding (on the Roadmap), SEO, or visibility in AI assistants' answers (GEO; both on SEO & GEO → Opportunities). Produces findings with severity and a fix. See [Audits](/guides/audits). |
| **Module** | A group of pages in the sidebar: **Marketing** (Today, Inbox, Content Studio, Ads, Roadmap, Intel, Analytics), **Accessibility** (Overview, Issues, Pages, Needs review, Images, Content, Documents, By criterion, Checklist, Reports), **SEO & GEO** (Overview, Site health, Search, AI visibility, Opportunities, Agents, Off-site) or **Security** (Overview, Findings, Monitoring, Report, Disclosure). Each is a section you can collapse. **Dashboard**, above the modules, sums up every module; see [Dashboard](/guides/dashboard). |

## Accessibility

| Term | Meaning |
| --- | --- |
| **Site** | A website that belongs to a product and is checked under **Accessibility**, **SEO & GEO** and **Security**: a start address, a page cap, patterns of pages to check or skip, and options. A product can have several (marketing site, docs, web app). See [Accessibility](/accessibility#add-a-site). |
| **Scan** | A run of automated checks on a site: a **Full scan** of the whole site, a **Page check** of one page, or an **Issue recheck** of the pages one issue is on. Uses axe-core in Chromium for accessibility, and checks the same page loads for SEO & GEO; no AI. See [Scanning a site](/accessibility/scanning). |
| **Issue group** | One check failing on the same element across one or more pages, shown as one issue under **Issues**. A shared template element (such as a header logo) is one issue on every page it's on. Open or fixed. See [Reading the results](/accessibility/results#issues). |
| **Impact** | How much an accessibility issue affects people, as axe-core rates it: critical, serious, moderate or minor. |
| **Accessibility score** | Startica's own 0 to 100 measure of progress for a page or site, from passed checks and failed checks weighted by impact. Not a measure of WCAG compliance. See [The score](/accessibility/results#the-score). |
| **Needs review** | An item axe-core couldn't decide on its own. Counted, but needs a person to check. |

## SEO & GEO

| Term | Meaning |
| --- | --- |
| **GEO** | Generative engine optimization: helping a product show up, correctly described, in the answers AI assistants give. The SEO & GEO module covers it alongside search (SEO). See [SEO & GEO](/seo). |
| **Site health** | The SEO & GEO checks on every page a scan loads: titles, descriptions, headings, indexing, links, structured data and AI access. See [Site health](/seo/site-health). |
| **Severity** | How much a site health problem matters: high, medium or low. **FYI** items are facts worth knowing that don't count against the score. |
| **Site health score** | Startica's own 0 to 100 measure of progress: each page starts at 100 and loses 15, 7 or 2 points per high, medium or low problem, and the site's score is the average less site-wide problems. Not a ranking. See [The score](/seo/site-health#the-score). |
| **AI crawler** | A bot an AI company uses to read websites, for model training, for an AI search index, or to fetch a page someone asked about. `robots.txt` can allow or block each one. See [AI crawlers and llms.txt](/seo/ai-crawlers). |
| **llms.txt** | An informal convention: a Markdown file at `/llms.txt` that briefs AI systems on what a site is and where its key pages are. Support varies by AI provider. See [AI crawlers and llms.txt](/seo/ai-crawlers). |
| **Orphan page** | A page the sitemap lists but no checked page links to. |

## Security

| Term | Meaning |
| --- | --- |
| **Verified site** | A site whose ownership you proved with a DNS record, a file or Search Console. Security checks run only on verified sites; local sites verify on their own. See [Prove the site is yours](/security#prove-the-site-is-yours). |
| **Finding** | One security problem the checks found, counted once however many pages it's on (the same idea as an issue group in Accessibility). Has a severity (critical, high, medium, low or FYI) and a state. Findings can also come from monitoring, an imported report or a problem someone reported to you. See [Findings and report](/security/findings). |
| **Accepted risk** | A finding you decided to live with, with a reason (**Accept the risk**). Kept on record, not counted in the score, not raised again. |
| **False positive** | A finding the check got wrong for your site, marked **Not a problem** with a reason. Kept on record, not counted. |
| **Monitoring** | Daily checks of each verified site beyond its own pages: libraries with known vulnerabilities, subdomains and certificates, look-alike domains and changes to third-party scripts. See [Monitoring](/security/monitoring). |

## Results

| Term | Meaning |
| --- | --- |
| **Read-only login** | The `startica_reader` role in your product's database, created by the SQL script Startica writes for the product database connection. It can read one view of daily totals (`startica.daily_metrics`) and nothing else. See [Product database](/credentials/supabase). |
| **Connection** | A product-level link to a results source: Google Analytics 4, Umami, Google Search Console, Bing Webmaster Tools, Stripe or the product database. Has a status (Connected, Error) and a last-synced time. See [Bring your own credentials](/credentials/). |
| **Metric snapshot** | One number for one day: product, day, source (`ga4`, `umami`, `stripe`, `product_db` or `manual`), metric name (such as `sessions` or `mrr`) and an optional split (such as `source:reddit / community`). Syncs overwrite the value for the same day. Kept for the product's [analytics history](/guides/analytics#history), 90 days by default; manual numbers are kept for good. |

## Under the hood

| Term | Meaning |
| --- | --- |
| **Job** | A unit of background work in Startica's local queue, such as `listen_scan`, `opportunity_score`, `draft_generate` or `metrics_sync`. Some run on a schedule, others when you click a button. Each attempt is a **job run**, listed on the **System** page. See [Background jobs](/reference/jobs). |
| **AI run** | One AI API call (Claude or OpenAI), logged with task, model, prompt version, status (`ok`, `error`, `refused`, `blocked`), tokens, estimated cost and latency. Listed under **AI calls** on the **System** page. |
| **Task** | The kind of AI work a call does: `strategy`, `research`, `draft`, `vision`, `score`, `answer`, `image` or `ping`. Each task is routed to a model you can change in **Settings → General → AI**. See [AI in Startica](/concepts/ai). |
| **Prompt version** | A label such as `reply-draft@2` recorded with every AI run, so you can tell which prompt produced which output. |
| **Secret** | Any credential Startica stores: API keys, service account keys, access tokens, connection URLs. Always encrypted. See [Privacy and security](/concepts/privacy-security). |
