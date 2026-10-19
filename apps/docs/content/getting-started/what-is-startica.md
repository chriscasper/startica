---
title: What is Startica
description: Startica is a local-first desktop app that looks after a product once it's shipped. It finds conversations and drafts your marketing, helps you get found in search and AI answers, and checks your sites for accessibility and security problems.
layout: doc
---

Startica is a startup harness for everything after you ship, and it runs on your computer. A harness puts your own AI model (Claude or OpenAI, with your key) to work on a fixed set of jobs, and keeps you holding the reins. You tell it about your product and its website. It learns the product and its market, finds the conversations where your customers talk, drafts replies, posts and ads for you to review, and checks your sites for the problems that keep people from finding, using or trusting them. Each day it boils all of that down to a short list of what to do next.

You stay in control: Startica never posts, launches or changes anything itself. Even when it fills a reply in on the site for you, you press the site's own button. Ads are files you import and launch. Fixes for your site are suggestions you copy.

It's built for founders and small teams who look after their own product, with no marketing department, accessibility consultant or security team, and would rather spend 20 minutes a day on the right work than an afternoon finding it.

## Four modules

Startica is built as four modules in one app. They share your products, your sites, the Dashboard, Today and the Roadmap.

| Module | Its job | How it works |
|---|---|---|
| **Marketing** | Reach the people who need the product | **Analyze** your site and market, **find** conversations worth joining, **draft** replies, posts and ads, **you approve** and post, **measure** what each one brought in, and **re-plan** every week. |
| **SEO & GEO** | Get found in search, in AI answers and by AI agents | Checks every page for what search engines and AI crawlers need, reads your Search Console and Bing data, asks an AI assistant your customers' questions to see whether it recommends you, and ranks what to do next. See [SEO & GEO](/seo). |
| **Accessibility** | Make the site work for everyone | **Scan** each page against WCAG 2.2 with axe-core, **prioritize** the issues, **fix** them with help, **verify** with a recheck, and keep **monitoring** with a weekly rescan. See [Accessibility](/accessibility). |
| **Security** | Find what an outsider can see on your own sites | **Verify** that the site is yours, **check** its HTTPS, headers, cookies, exposed files and email setup, **fix** what it finds, **recheck**, and keep **monitoring** subdomains, certificates, look-alike domains and vulnerable libraries. Defensive checks only. See [Security](/security). |

Accessibility, SEO & GEO and Security share one scan: each page of a site is loaded once, and every module's checks run on it. Scans and checks don't use AI, so they cost nothing. AI help in those modules runs only when you press its button, with the cost shown first.

### The marketing loop

1. **Analyze.** It reads your website, researches competitors and communities on the web, and writes a product brief.
2. **Plan.** It turns the brief and your results into a roadmap of growth bets.
3. **Act daily.** It finds conversations worth joining, drafts replies, and ranks a short list of moves for today.
4. **You approve.** You edit the draft and post it yourself, under your own account. On X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse, **Post…** fills it in on the site and saves the link once you press the site's button (in beta); everywhere else you copy, post and mark it as posted.
5. **Measure.** It tracks replies, visits and signups from what you posted.
6. **Re-plan.** Every week it updates the roadmap based on what worked, with your sites' security score as part of the evidence.

## The pages

The left sidebar starts with the **Dashboard**, then has one section per module: **Marketing**, **Accessibility**, **SEO & GEO** and **Security**, each in its own color. Click a module's header to collapse or expand it; Startica remembers your choice on this device. **Settings** and **System** are at the bottom. The product switcher at the top picks which product you're working on, and the status indicator at the top right shows what's running in the background.

| Page | What it does |
|---|---|
| **Dashboard** | The page Startica opens on. What needs you across every module, broken or risky things first, then a card per module with its numbers. It only reads, so it's free. See [Dashboard](/guides/dashboard). |
| **Today** | A ranked list of up to 7 moves for today across the modules: drafts waiting for review, serious accessibility or security problems, setup gaps, and the roadmap's next steps. Built from rules, not AI, so it's instant and free. |
| **Inbox** | Conversations worth joining, each with a relevance and intent score, the reason it matched, and a drafted reply. You edit it, then post it yourself: with **Post…** (seven sites, in beta) or with **Copy & open thread** and **Mark as posted**. |
| **Content Studio** | Writes posts, threads, articles, newsletter issues and email campaigns for a channel, in a voice you pick. Voices are style guides built from sample posts by writers your audience already reads. |
| **Ads** | Plans paid campaigns for Google Ads, Meta and Reddit: a small test with a success metric, ad groups with their targeting, ads checked against each platform's limits, images in every size, import files and steps to launch them yourself, then results per ad and what to do next. Startica never launches ads or spends money. See [Ads](/ads). |
| **Roadmap** | Growth bets across the funnel (acquisition, activation, retention, revenue, referral), each with a playbook, a success metric and a next step. Re-planned weekly. Also runs audits of your landing page and onboarding. |
| **Intel** | What Startica knows about the product: the brief, personas, competitors, communities and keywords. You choose which communities to watch. |
| **Analytics** | Traffic, conversions and revenue from Google Analytics or Umami, your product database and Stripe, each compared with the period before, plus what each posted reply or piece brought in and a weekly summary written by the AI. |
| **Accessibility** | **Overview**, **Issues**, **Pages**, **Needs review**, **Images**, **Content**, **Documents**, **By criterion**, **Checklist** and **Reports**. Automated checks (axe-core, against WCAG 2.2 A and AA) with a score and what to fix first, AI help on request, the checks a person has to make, and a report, statement and ACR draft. See [Accessibility](/accessibility). |
| **SEO & GEO** | **Overview**, **Site health**, **Search**, **AI visibility**, **Opportunities**, **Agents** and **Off-site**. Technical checks for search engines and AI crawlers, clicks and queries from Search Console and Bing, whether AI assistants recommend you, one ranked list of what to do with drafts to copy, agent readiness, and the sites AI answers cite. See [SEO & GEO](/seo). |
| **Security** | **Overview**, **Findings**, **Monitoring**, **Report** and **Disclosure**. Checks on verified sites with a score, findings with how to fix them, exposure monitoring, a report with related OWASP, SOC 2 and ISO 27001 references, and a disclosure kit. See [Security](/security). |
| **Settings** | Three tabs. **General**: your AI provider and keys, monthly budget and model choices, and app settings. **Products**: products, their connections (Google Analytics or Umami, Search Console, Bing, Stripe, the product database), sites and issue tracker. **Channels**: the optional X API token, your Mastodon server and scoring. See [Settings](/reference/settings). |
| **System** | Jobs running and waiting (with **Stop**), job runs, every AI call with its tokens and cost, and this month's AI spend. |

## Where conversations come from

| Channel | How Startica finds threads |
|---|---|
| Reddit | Reads public RSS feeds of the subreddits you watch, every hour. |
| Hacker News | Searches the public Algolia HN API with your keywords, every hour. |
| Bluesky | Searches Bluesky's public API with your keywords, every hour. No account needed. |
| Mastodon | Reads the hashtags you watch (written `#tag@server`) through each server's public API, every hour. No account needed. |
| Discourse forums | Reads new topics and runs keyword searches in each forum you watch, every hour. No account needed. |
| X | With your own paid X API token: searches your top 3 keywords, at most every 6 hours, with a daily read cap. Without one, you paste the post. |
| LinkedIn, Facebook groups | You paste a link and the post's text. Startica drafts a reply. |

Read [Finding conversations](/guides/finding-conversations) and [Manual channels](/guides/manual-channels) for details.

## What it deliberately doesn't do

- **It doesn't post for you.** On X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse, [Posting with Startica](/guides/assisted-posting) fills in your reply on the site, but you always press the site's own button. Everywhere else you copy and paste it yourself. No AI drives a browser, and nothing is scheduled or posted in bulk. It doesn't send email either: email campaigns are for you to paste into your email tool.
- **It doesn't scrape.** It uses public feeds and APIs only. LinkedIn and Facebook are paste-only because they have no usable public API. X is paste-only unless you bring your own paid X API token.
- **It doesn't automate accounts.** No account warm-up, no vote manipulation, no bulk posting.
- **It doesn't change your site or launch your ads.** Fixes, structured data, `llms.txt` drafts and security.txt files are text for you to copy. Ad plans are files you import, paused, and launch yourself.
- **It doesn't claim compliance or security.** Results are "found by automated checks". Automated checks can't cover everything WCAG asks for or everything an attacker might try, so Startica always shows what still needs a person, and never calls a site compliant, certified or secure.
- **It doesn't test sites you don't own, or attack any site.** You confirm you may test a site before it's scanned, and security checks run only after you prove it's yours. They read what any visitor's browser receives: no exploit payloads, form submissions or password guessing.
- **It doesn't run in the cloud.** There's no Startica server or account. Your data stays in a file on your computer.
- **It doesn't work while closed.** Scheduled scans and syncs only run while the app is open. Closing the window keeps it running in the tray or menu bar. See [Running in the background](/guides/background).

## Who it's for

Startica fits you if:

- You look after one or more products yourself, for example a note-taking app for field researchers like the example product Fieldnote.
- You want people to find the product, in communities, search results and AI answers, and you want its website to be usable and safe without hiring for each.
- You're comfortable cloning a repository and running a few terminal commands.
- You're willing to bring your own Anthropic or OpenAI API key and pay for the AI you use. The scans and checks are free.

It's a single-user app. There are no teams, logins or sync. See the [FAQ](/troubleshooting/faq).

## Next

Check the [requirements](/getting-started/requirements), then [install Startica](/getting-started/install).
