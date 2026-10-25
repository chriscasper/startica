---
title: Competitor research and following
description: Research a competitor in depth, follow its accounts, blog, pages and the people who run it, with a brief on each, and get daily, weekly, monthly and yearly AI briefs of what they did.
layout: doc
---

Each competitor on **Intel → Competitors** has its own page. Startica can research it on the web in depth, and you can follow its accounts, blog and pages (pricing, changelog, careers) and the people at it: founders, executives, whoever speaks for the company. Each link and person gets a short AI brief. What they post and what changes on their pages shows up on the competitor's page and under **Intel → Following**, and AI briefs for the day, week, month and year tell you what matters for your product. This page covers adding a competitor, the research, following people and links, the activity feed, the briefs and their settings.

## Add a competitor

Intel's research finds competitors when it builds the brief. To add one yourself:

1. Open **Intel → Competitors** and click **Add competitor**.
2. Enter its **Name**. The website and the rest are optional.
3. Leave **Research it in depth now** ticked to have Startica fill in the rest (this needs an AI key), and click **Save**.

Click a competitor's name to open its page. The list shows when each was last researched, and a **new** badge when it or its people posted something you haven't seen.

Competitors you research, follow people at, or follow accounts of are kept when you rebuild Intel, like the ones you added yourself.

## Research a competitor in depth

On the competitor's page, click **Research in depth** (later, **Research again**). Startica searches and reads the web for a few minutes in the background, then writes:

- **Who it's for and how it pitches itself:** its audience, its messaging, the company's age, size, funding and location when they're public, and where it markets itself.
- **Pricing:** the model and each plan with its price.
- **Features**, and what happened **Recently** (launches, price changes, funding, hires), each with its date and source.
- **What users say:** praise and complaints from real discussions and reviews.
- **Against your product:** where it's stronger and where you are.
- **People** worth following, and **its accounts and blog**, as suggestions.
- **Sources:** the pages the profile relies on.

Research again whenever you like. Startica gives the AI the previous profile, and the page then shows **What changed since the last research** at the top. Startica can also research each competitor you've researched once again by itself, every month, quarter or 6 months. That's off by default; switch it on under [Settings](#settings). The competitor's page then shows when the next research is due and what it costs.

The research uses the `research` task with web search, then `draft` to write the profile. It costs about $0.30 to $0.80 per run. See [Costs](/concepts/costs).

> [!NOTE]
> The profile is AI-written from public pages. Check the sources before you rely on a number, especially prices.

## Follow people

**People** lists the founders and the people who speak for the company. Suggestions from the research are marked **Suggested by the research**. Nothing is read about anyone until you follow them.

- **Follow** a suggestion to start reading their profiles. **Dismiss** it, or **Unfollow** someone later, to stop: what Startica read from them is deleted, and the research won't suggest them again.
- **Add a person** to follow someone yourself: their name, role, and their profile links, one per line.
- **Edit** to change the links. Removing a link stops reading it.

Following someone follows every link they have:

| Link | How Startica follows it |
|---|---|
| Bluesky (`bsky.app/profile/…`) | Their posts, without reposts |
| Mastodon (`server/@name`) | Their posts, from their own server |
| Reddit (`reddit.com/user/…`) | Their posts and comments |
| Hacker News (`news.ycombinator.com/user?id=…`) | Their stories and comments |
| A blog or newsletter (a site's homepage or blog, Substack, a feed address) | New posts from its RSS or Atom feed. Without a feed, the page is watched instead |
| GitHub, YouTube, any other page | Watched for changes (see [Watched pages](#watched-pages)) |
| LinkedIn, X | Never opened. Briefed from web search instead (see [LinkedIn and X](#linkedin-and-x)) |

Each followed person gets a brief on their card: who they are at the company, what they talk about, any hints at what the company does next, and how active they are. It's rolled up from the briefs of their links and their recent posts, and rewritten at most once a day when something new arrives.

Only follow people for what they do and say at work. The research suggests only people in public roles at the company, with their public, work-related profiles. Startica's briefs follow the same rule. It doesn't collect anything personal.

## Follow the company's accounts, blog and pages

**Its accounts and blog** lists the company's own profiles, feeds and pages that you follow. The research's finds appear under **Found by the research**, each with a **Follow** button. To add one yourself, click **Follow a link** and paste:

- a Bluesky, Mastodon, Reddit or Hacker News profile,
- the address of its blog, changelog or newsletter (Startica finds the feed the site points to, or tries the usual feed addresses),
- any other page to watch, like its pricing, careers or docs page, or its GitHub or YouTube page,
- its LinkedIn or X page.

A site's homepage or an address with `/blog`, `/news`, `/changelog` and the like is read through its feed. Any other address on the site, like `/pricing`, is watched as a page.

Each link gets a brief under its row: what the link is, what it covers, what's new lately and its latest notable change. Click **More** for the details and links. A link's brief is written after its first read and rewritten at most once a day when new posts or changes arrive.

The company's Bluesky, Mastodon, Reddit and Hacker News accounts also show in [Competitor benchmarks](/guides/benchmarks). People's accounts and blogs don't.

### Watched pages

Startica reads a watched page's visible text, without its navigation, header and footer, and compares it with the last read. When enough has changed, it adds a **Page changed** post to the activity with what was added and removed. Dates, times, "3 days ago" and spacing don't count as changes, and edits of a few characters are ignored until they add up. The first read is only the starting point.

Startica reads a page only where the site's `robots.txt` allows it. A page that needs scripts to show its text can't be watched; its row says so.

### LinkedIn and X

Startica never opens LinkedIn or X pages. They need a login, both ask crawlers to stay out in their `robots.txt`, and Startica doesn't look up accounts on X. Instead, Startica has the AI look the link up with web search, using other public pages like press, interviews and the company's own site, and writes a brief marked **From web search, not read directly**. These briefs are rewritten at most once a week, because each one uses a few web searches.

## Activity

**Activity** on a competitor's page, and on **Intel → Following** for every competitor at once, lists what was posted and what changed on watched pages, newest first. Each post shows who posted it, where, when and how many reactions it got, with **Open** to see it on the site. Posts you haven't seen are marked **New**. **Mark as seen** clears them.

The AI rates each new post and page change for how much it matters to your product. The ones that matter most get a **Matters** badge; hover it for why. **Only what matters** on Following hides the routine ones.

Startica reads everything you follow **every day** while it's open, and right away when you follow something new. Change how often under [Settings](#settings). The first read of an account counts as already seen, so you only get what's new from then on. It keeps each account's newest 100 posts.

When there's something new, Today suggests **Catch up on new posts**.

## Briefs

**Intel → Following → Briefs** has a brief for **Daily**, **Weekly**, **Monthly** and **Yearly**. Pick one to read it. Each brief has:

- a headline,
- what happened at each competitor, why it matters for your product, and the posts or pages it's based on,
- up to three things you could do,
- which competitors were quiet,
- **New since the last update**, when the brief was rewritten.

The current period's brief is kept up to date: after each read that finds something new, Startica rewrites today's brief right away, this week's at most once a day, this month's at most once a week, and this year's at most once a month. When a period ends, its brief gets a final version. **Earlier** lists past briefs. **Update now** rewrites the brief you're reading right away.

Longer briefs are written from the shorter ones (the week from its days, the month from its weeks), with the posts that matter most for their links. So a monthly or yearly brief covers the whole period even though Startica keeps only each account's newest 100 posts.

Today suggests reading the brief of the shortest period you have on, like **Read today's competitor brief**, until you click **Mark as read**. A brief that gets new items is unread again.

A brief's links are only ever posts and pages Startica read. The AI can't add links of its own.

## Settings

**Intel → Following → Settings** sets, for the active product:

- **Briefs to write:** any of Daily, Weekly, Monthly and Yearly. All four are on by default.
- **Read links and update briefs:** every 6 hours, every day (the default), every 2 days or every week.
- **Research competitors again:** every month, every quarter, every 6 months, or only when you click (the default). Only competitors you've researched once are researched again, one at a time, so a round spreads out over a few hours.

Under the settings, **Estimated cost** shows what this costs each month at most, part by part, for what you follow now. It also shows what one round of research costs (about $0.30 to $0.80 per competitor) and which competitor is next. Briefs are only rewritten when something new arrived, so most months cost less. Everything counts toward your [monthly AI budget](/concepts/costs).

Startica only reads and writes while it's open. A read or a period's final brief that was due while it was closed runs within the hour after you open it.

## In the demo

The demo has TerraJot researched, with its CEO followed (Bluesky, plus LinkedIn and X briefed from web search), a head of product suggested, its blog and pricing page followed, a week of posts and a pricing change, briefs on each link and on the CEO, and today's, this week's and this month's briefs. Research, reading and the briefs are off in the demo.

## Related

- [Competitor benchmarks](/guides/benchmarks)
- [Listening trends](/guides/listening-trends), including share of voice against competitors
- [Costs](/concepts/costs)
- [Background jobs](/reference/jobs)
