---
title: Competitor research and following
description: Research a competitor in depth, follow its blog, its accounts and the people who run it, and get a weekly AI digest of what they did.
layout: doc
---

Each competitor on **Intel → Competitors** has its own page. Startica can research it on the web in depth, and you can follow its blog and accounts and the people at it: founders, executives, whoever speaks for the company. What they post shows up on the competitor's page and under **Intel → Following**, and an AI digest can tell you each week what matters for your product. This page covers adding a competitor, the research, following people and accounts, the activity feed and the digest.

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

Research again whenever you like. Startica gives the AI the previous profile, and the page then shows **What changed since the last research** at the top.

The research uses the `research` task with web search, then `draft` to write the profile. It costs about $0.30 to $0.80 per run. See [Costs](/concepts/costs).

> [!NOTE]
> The profile is AI-written from public pages. Check the sources before you rely on a number, especially prices.

## Follow people

**People** lists the founders and the people who speak for the company. Suggestions from the research are marked **Suggested by the research**. Nothing is read about anyone until you follow them.

- **Follow** a suggestion to start reading their profiles. **Dismiss** it, or **Unfollow** someone later, to stop: what Startica read from them is deleted, and the research won't suggest them again.
- **Add a person** to follow someone yourself: their name, role, and their profile links, one per line.
- **Edit** to change the links. Removing a link stops reading it.

Startica reads these kinds of profile:

| Link | What Startica reads |
|---|---|
| Bluesky (`bsky.app/profile/…`) | Their posts, without reposts |
| Mastodon (`server/@name`) | Their posts, from their own server |
| Reddit (`reddit.com/user/…`) | Their posts and comments |
| Hacker News (`news.ycombinator.com/user?id=…`) | Their stories and comments |
| A blog or newsletter (any site, Substack, a feed address) | New posts from its RSS or Atom feed |

Other links (LinkedIn, X, GitHub, YouTube, a website without a feed) are kept, and appear under **Check yourself** with a button that opens each one.

> [!NOTE]
> **LinkedIn and X can't be followed automatically.** LinkedIn has no public way to read someone's posts, and its pages need you to sign in. Startica doesn't sign in anywhere and doesn't scrape sites. Startica doesn't look up accounts on X. Open those links from the person's card to check them yourself.

Only follow people for what they do and say at work. The research suggests only people in public roles at the company, with their public, work-related profiles. It doesn't collect anything personal.

## Follow the company's accounts and blog

**Its accounts and blog** lists the company's own profiles and feeds that you follow. The research's finds appear under **Found by the research**, with a **Follow** button for the ones Startica can read. To add one yourself, click **Follow an account or blog** and paste a Bluesky, Mastodon, Reddit or Hacker News profile, or the address of its blog, changelog or newsletter. Startica finds the feed the site points to, or tries the usual feed addresses.

The company's Bluesky, Mastodon, Reddit and Hacker News accounts also show in [Competitor benchmarks](/guides/benchmarks). People's accounts and blogs don't.

## Activity

**Activity** on a competitor's page, and on **Intel → Following** for every competitor at once, lists what was posted, newest first. Each post shows who posted it, where, when and how many reactions it got, with **Open** to see it on the site. Posts you haven't seen are marked **New**. **Mark as seen** clears them.

Startica reads everything you follow every morning at 05:23 while it's open, and right away when you follow something new. The first read of an account counts as already seen, so you only get what's new from then on. It keeps each account's newest 100 posts.

When there's something new, Today suggests **Catch up on new posts**.

## The weekly digest

On **Intel → Following**, **Summarize the last 7 days** has the AI read the week's posts from what you follow, and any changes in researched profiles. It writes:

- a headline,
- what happened at each competitor, why it matters for your product, and the posts it's based on,
- up to three things you could do this week,
- which competitors were quiet.

Tick **Every Monday morning** to get a digest at 08:30 each Monday while Startica is open. It's off by default. Weeks with nothing new are skipped, so they cost nothing. Today suggests **Read this week's competitor digest** until you click **Mark as read**.

A digest is one `draft` call, a few cents. Its links are only ever posts Startica read; the AI can't add links of its own.

## In the demo

The demo has TerraJot researched, with its CEO followed (Bluesky, with LinkedIn and X links to check yourself), a head of product suggested, its blog followed, a week of posts and a digest. Research, reading and the digest are off in the demo.

## Related

- [Competitor benchmarks](/guides/benchmarks)
- [Listening trends](/guides/listening-trends), including share of voice against competitors
- [Costs](/concepts/costs)
- [Background jobs](/reference/jobs)
