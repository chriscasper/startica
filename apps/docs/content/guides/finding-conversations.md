---
title: Finding conversations
description: How Startica scans Reddit, Hacker News, Bluesky, Mastodon, Discourse forums and (with your own API token) X for threads worth joining, and how it decides which ones get a drafted reply.
layout: doc
---

Startica checks Reddit, Hacker News, Bluesky, Mastodon and Discourse forums every hour for posts about the problem your product solves. With your own X API token it searches X too. Each new post is scored by the AI. The ones that clear your thresholds get a drafted reply in the **Inbox**. Everything else goes to the **Archived** tab, where you can still look at it.

This page explains what gets scanned, how to set up each source, what decides a match, and what you can change.

> [!NOTE]
> Discovery needs a product brief. Products without one are skipped. Build it on the **Intel** page first (see [Your first run](/getting-started/first-run)).

## What gets scanned

| Source | How it's read | What it looks at | What you set up |
| --- | --- | --- | --- |
| Reddit | Public RSS (Atom) feeds, no account | Each watched subreddit's newest posts, plus keyword searches inside those subreddits | Watched subreddits |
| Hacker News | The public Algolia HN Search API, no account | Stories and comments matching your keywords, across all of HN | Nothing beyond keywords |
| Bluesky | Bluesky's public API, no account | Posts matching your keywords, across all of Bluesky | Nothing beyond keywords |
| Mastodon | Each server's public API, no account | The timeline of each hashtag you watch, on the server you name | Watched hashtags, written `#tag@server` |
| Discourse forums | Each forum's public JSON, no account | New topics in each watched forum, plus keyword searches inside it | Watched forums, with the forum's address |
| X | The official X API v2, with **your own paid token** | Recent posts matching your top 3 keywords, rationed to keep the bill small | A bearer token in **Settings** ([X API](/credentials/x-api)) |

Without an X token, X isn't scanned. LinkedIn and Facebook are never scanned. You paste those threads yourself; see [Manual channels](/guides/manual-channels).

Sources are read one after another in this order: Hacker News, Reddit, Bluesky, Mastodon, Discourse, then X. Each source's finds are queued for scoring as soon as that source is done, so early results reach the Inbox while later sources are still being read. A source that fails (a forum that's down, X out of credits) is skipped and the scan continues with the others.

### Reddit

For each product, a Reddit scan does this:

1. Reads the `/new` feed of each subreddit you marked **Watch** (up to 50 posts per subreddit, first 10 watched subreddits).
2. Runs up to 3 keyword searches, limited to those same watched subreddits. Each search looks for the exact phrase, sorted by newest, within the past week, 25 results at most.
3. Keeps posts only. Comments in the feeds are ignored.

Keyword searches never run Reddit-wide. Site-wide search mostly matches unrelated communities, and every match costs a scoring call. If you watch no subreddits, Startica does no Reddit discovery at all.

A subreddit that is private, banned or misspelled is skipped silently. The rest of the scan continues.

> [!TIP]
> Pick 3 to 5 subreddits where your audience asks for help. On the **Intel** page, open **Communities** and click **Watch**. Only the first 10 watched subreddits are read, so more than that adds nothing.

### Reddit rate limits

Reddit allows roughly one feed request per minute. Startica sends Reddit requests one at a time and spaces them using the `x-ratelimit-remaining` and `x-ratelimit-reset` headers Reddit returns. When Reddit says requests remain, the next one goes out after 2 seconds. When it says none remain, Startica waits at least 62 seconds. A request that gets HTTP 429 is retried once.

With 10 watched subreddits and 3 keyword searches, that is 13 requests. The Reddit part of a scan can take up to about 15 minutes. Each source's results are queued for scoring as soon as that source is done and appear in the Inbox as they're scored, so you don't need to wait for the whole scan.

### Hacker News

Hacker News is searched by keyword only. Communities don't apply. For each of your first 20 listening keywords, Startica asks Algolia for up to 20 matching stories and comments, newest first. Items with no text and no title are dropped.

### Bluesky

Bluesky is searched by keyword only, so it needs no communities. For each of your first 10 listening keywords, Startica asks Bluesky's public search for up to 25 of the newest posts since the scan's look-back window. A keyword with a space is searched as an exact phrase. Replies count as comments; everything else as posts.

No Bluesky account is needed. Search goes to `api.bsky.app`; reading a thread and checking engagement go to `public.api.bsky.app`. A keyword whose search fails is skipped and the rest continue.

### Mastodon

Mastodon servers don't offer keyword search without an account, so Startica follows **hashtags** instead. Each watched Mastodon community is one hashtag on one server, and Startica reads that hashtag's public timeline there.

Write the community's **Name** as `#tag@server`, for example `#fieldwork@mastodon.social`. Startica also accepts:

| You enter | Startica reads |
| --- | --- |
| `#fieldwork@mastodon.social` | `#fieldwork` on mastodon.social |
| `fieldwork` or `#fieldwork` | `#fieldwork` on mastodon.social (the default server) |
| Any name, with a **URL** like `https://mastodon.social/tags/fieldwork` | The hashtag and server in the URL |

Each scan reads the 40 newest posts of each hashtag, for the first 10 watched hashtags. A server's hashtag timeline includes posts from other servers that it knows about, so a big server such as mastodon.social sees more than a small one.

Posts are linked and read through the server they were found on, not the author's home server, which may be slow or unreachable. A server that's down or refuses the request is skipped.

Adding a Mastodon community that isn't a hashtag fails with "Write a Mastodon community as a hashtag on a server, e.g. #photography@mastodon.social".

> [!TIP]
> Write Mastodon communities in full, as `#tag@server`. Drafting finds the community's **Self-promotion rules** by hashtag, with or without the `@server` part: `#fieldwork`, `fieldwork` and `#fieldwork@mastodon.social` all match (a hashtag without a server means mastodon.social).

### Discourse forums

Many product communities run on Discourse. Each watched Discourse community is one forum. Put the forum's address in the community's **URL** field, for example `https://forum.example.com`, and give it a readable **Name**. A forum in a sub-folder works too (`https://example.com/community`). The address is required: adding a Discourse community without one (and with a name that isn't an address) fails with "Add the forum's address as the URL (e.g. https://forum.example.com)".

For each watched forum (first 5), a scan:

1. Reads the forum's latest topics and keeps those created within the look-back window, up to 6. Each one takes an extra request to read its first post.
2. Runs up to 3 keyword searches inside the forum (your first 3 listening keywords, newest first). These also find replies inside older topics. Up to 4 matching posts per search are read in full.

That's at most about 22 requests per forum. Forums limit anonymous visitors, typically to about 15 requests a minute. Startica spaces its requests to each forum 4.5 seconds apart (about 13 a minute), so **a scan of one forum takes up to about 1.7 minutes**. Forums are read one after another, so 5 watched forums add up to about 8 minutes to a scan. A forum that's down, private or rate-limiting is skipped.

> [!TIP]
> Watch only the forums where your audience asks questions. Only the first 5 watched forums are read, and every one makes each hourly scan longer.

### X with your own API token

X is searched only if you've added your own X API bearer token under **Settings → Channels → X API (optional, paid)**. X charges per post read (about $0.005 each), so Startica rations itself:

- It searches at most once every 6 hours (you can change this), not every hour.
- It folds your top 3 listening keywords into one search (`("film notes" OR fieldwork OR …) -is:retweet`), so reposts are left out.
- After the first search, it continues from the newest post it already has instead of searching the same window again.
- It doesn't look up authors, so X posts show no author and link as `x.com/i/status/<id>`.
- It reads at most 50 posts per search. When more match, it takes the newest and skips the older ones, so a busy keyword never costs more than 50 reads a scan.
- It stops at a daily read cap (100 posts by default, about $0.50 a day).

If a search fails (no credits left, a revoked token, a rate limit), the scan carries on without X and the error shows on the **X API** card in **Settings** as "Last X request failed: …".

How to get a token, what it costs and how to change the limits: [X API (optional, paid)](/credentials/x-api).

## Keywords and communities

Both live on the **Intel** page. Building intel suggests some; you can add your own.

### Keywords

Each keyword has a **Use for** setting:

| Use for | Used in discovery? |
| --- | --- |
| Listening and SEO | Yes |
| Listening only | Yes |
| SEO only | No |

Order matters, because the limits above take keywords from the top of the list. Keywords you added come first, then suggested ones, each group oldest first. That means:

| Source | Keywords used |
| --- | --- |
| Reddit | Your first 3 listening keywords (searched inside watched subreddits) |
| Hacker News | Your first 20 |
| Bluesky | Your first 10 |
| Discourse | Your first 3 (searched inside each watched forum) |
| X | Your first 3, in one search |
| Mastodon | None: hashtags only |

If a suggested keyword is noisy, remove it or set it to **SEO only**. If you want a keyword searched on Reddit, Discourse or X, add it yourself so it moves ahead of the suggestions.

### Communities

Each community has a status that you set with the **Watch** and **Ignore** buttons:

| Status | Effect on discovery |
| --- | --- |
| Watching | Reddit subreddits, Mastodon hashtags and Discourse forums are scanned. Other channels' communities are used only for their self-promotion rules. |
| Suggested | Not scanned. |
| Ignored | Not scanned. Shown faded in the list. |

A community you add with **Add community** is watched right away. So is a subreddit you add with **Watch r/…** on **SEO & GEO → Off-site**, where AI answers cite its threads; its reason reads "AI answers cite its threads (SEO & GEO → Off-site)." See [Watch a community](/seo/off-site#watch-a-community). The form's **Channel** list has Reddit, Hacker News, X, LinkedIn, Facebook, Mastodon, Bluesky, Discourse and Other. What to enter:

| Channel | Name | URL |
| --- | --- | --- |
| Reddit | The subreddit without `r/` (Startica strips it if you include it) | Optional |
| Mastodon | **Required:** a hashtag, `#tag@server`, for example `#fieldwork@mastodon.social` | Optional (a `https://server/tags/tag` link also works instead) |
| Discourse | The forum's name, for example `Fieldwork Forum` | **Required:** the forum's address, for example `https://forum.example.com` |
| Others | Any name | Optional |

Bluesky is searched by keyword, so a Bluesky community has no effect on discovery.

When you build intel, the AI suggests communities in these same formats: subreddit names for Reddit, `#tag@server` for Mastodon, and a name plus address for Discourse forums. It doesn't suggest Bluesky communities.

The **Self-promotion rules** field matters later. The drafting step reads it to decide whether a reply may mention your product. See [Drafting replies](/guides/drafting-replies).

## When scans run

| Trigger | What it scans |
| --- | --- |
| Hourly, at 7 minutes past the hour | Every product that has a brief, unless its search is [paused](#pausing-the-search) |
| **Scan now** in the Inbox | The active product only, even while its hourly search is paused |

The schedule uses your computer's local time and only runs while Startica is open. Missed runs are not made up later. Keep the app running in the tray to keep scans going; see [Running in the background](/guides/background).

While a scan runs, the [status indicator](/reference/jobs#the-status-indicator) at the top right of every page says so ("Finding conversations on Reddit…"). Hover over it to see how long the scan has been running and why (scheduled, or started by you). **Scan now** shows **Scanning…** and can't be clicked again until the scan finishes; **Stop scan** next to it (or the **×** in the indicator) ends it early, keeping what it already found. After the scan, the indicator lists the conversations still waiting to be scored and the replies being drafted.

Each scan looks back 26 hours. Scans overlap on purpose, and a conversation that was already found is not added again. X is the exception: it runs at most every few hours and continues from where it left off.

### Pausing the search

When you're not working on replies for a while, pause the search so Startica stops reading Reddit and the other sources. In the Inbox, click **Searching hourly** next to **Scan now**:

| Option | What it does |
| --- | --- |
| **Pause for a day**, **For a week** | Stops the hourly search for this product, then turns it back on by itself. |
| **Until I resume** | Stops the hourly search until you click **Resume**. |
| **Search on** checkboxes | Turn single sources off, for example Reddit, while the others keep searching. A source you turn off is skipped by every scan, **Scan now** included, until you tick it again. |

While the search is paused, the button reads **Search paused**, the Inbox says until when, and the Dashboard's Marketing card shows "Search paused". **Scan now** still searches once (without the sources you turned off). If every source is off, **Scan now** asks you to turn one back on first.

Pausing applies to one product; each product has its own setting. It doesn't stop anything else: pasted links are still read and drafted, conversations already found are still scored and drafted, and the [reply checks](/guides/analytics#posted-by-startica) on what you posted keep running every 6 hours.

## Limits per scan

| Limit | Value |
| --- | --- |
| Look-back window | 26 hours |
| New conversations scored per product, per source, per scan | 60 |
| X posts read per scan | 50 |
| Scoring batch size | 20 conversations per job |

The cap of 60 keeps a noisy keyword from running up your AI bill. It applies to each source separately, so a very broad keyword on one source can't crowd out the others. An X search reads at most 50 posts, below the cap, so every paid X read is stored and scored.

## How conversations are scored

Each new conversation goes through three checks, in this order.

### 1. Age

A conversation posted more than 7 days ago is archived with the reason "Older than 7 days." Discovery only looks back 26 hours, so this mostly matters as a safety net.

### 2. Near-duplicates

Cross-posts and reposts often show up more than once. Startica compares each new conversation's text with the product's conversations from the last 14 days. If it's a near-copy of one it has already triaged, it's archived with a note that links to the original. No AI call is made.

Very short texts (under 12 words) aren't compared, because they're too short to match reliably.

### 3. The AI's score

The rest are scored by the **score** task. By default this uses Claude Haiku or GPT-6 Luna, depending on your provider. You can change the model on **Settings** under **AI**.

The model returns two numbers between 0 and 1, plus a short explanation, a suggested angle and the author's sentiment (positive, neutral, negative or mixed, shown on [Trends](/guides/listening-trends#sentiment)):

| Score | Meaning | 1 means | 0 means |
| --- | --- | --- | --- |
| Relevance | How closely the thread is about the problem your product solves or the audience it serves | Squarely on topic | Unrelated, even if a keyword matched |
| Intent | How actively the author is looking for help, a recommendation or an alternative | "What do you use for…" | News, jokes, arguments |

The prompt tells the AI to be strict. Most keyword matches are noise.

### Thresholds

A conversation gets a draft only if both scores clear the product's thresholds:

| Threshold | Default |
| --- | --- |
| Relevance | 0.7 or higher |
| Intent | 0.5 or higher |

Anything below goes to **Archived**. Its scores and the AI's explanation stay visible on the card, and you can click **Draft a reply anyway**.

To change them, click **Scoring** in the Inbox toolbar. Each product has its own thresholds.

- **Relevance:** 70% or more means only conversations about the problem your product solves. At 50% you also get your audience talking about a related problem, such as a trip planner asking about ride times rather than itineraries. A reply there can still be useful, even if it shouldn't mention your product.
- **Intent:** 50% or more includes people asking for help or complaining about the problem. Raise it to keep only people asking for a tool or a recommendation.

While you move the sliders, the dialog shows how many conversations archived in the last 7 days would pass. When you save, you can have replies drafted for those right away: up to 25, best scores first, at about $0.01 each. New conversations are scored against the new thresholds from the next scan on. Scores already given don't change.

The **Archived** tab lists the closest calls first, so the conversations that almost passed are at the top.

## Pasting a link

You don't have to wait for a scan. In the **Inbox**, click **Paste a link**, paste a thread URL, and click **Draft a reply**.

| Link | How it's read |
| --- | --- |
| **Reddit** | Through the thread's RSS feed. Startica stores the post and the first 5 replies so far, so the draft knows what has already been said. Because of Reddit's rate limit, this can take up to a minute. |
| **Hacker News** | Through the Algolia API. A comment link also pulls in the story's title. |
| **Bluesky** (`bsky.app/profile/<handle>/post/<id>`) | Through Bluesky's public API, with the first 5 replies. |
| **Mastodon** (`https://<server>/@<user>/<id>`, on any server) | Through that server's public API, with the first 5 direct replies. |
| **Discourse** (`https://<forum>/t/<topic>/<id>`, optionally with a post number, on any forum) | Through the forum's public JSON. A topic link reads the first post; a post link reads that post. Up to 5 replies are added. |
| **X** | Only with an X API token, as one read toward the daily cap. Without a token, or once the cap is reached, paste the post's text. |
| **Other sites** | Paste the post's text in the **Post text** field. See [Manual channels](/guides/manual-channels). |

Mastodon and Discourse run on many different domains, so Startica recognizes their links by their shape, not by the domain. A Mastodon-style link on any server is treated as Mastodon, and any `…/t/<slug>/<number>` link as Discourse.

If Startica can't read a link, it asks for the text. For Reddit: "Couldn't read that Reddit link right now (Reddit limits how often it can be read). Try again in a minute, or paste the post's text." For Bluesky, Mastodon, Discourse and Hacker News: "Couldn't read that _channel_ link right now. Try again, or paste the post's text." For X: "Paste the post's text too. (With an X API token in Settings, Startica reads X links itself.)"

Pasted links skip the age check, the near-duplicate check and the thresholds. They're still scored, so you can see the AI's view, but they always get a draft.

The optional **Community** field sets which community the thread belongs to. Startica uses it to find that community's self-promotion rules. If you leave it blank:

- Reddit links get the subreddit from the URL.
- Discourse links get the forum's host name (for example `forum.example.com`). The rules are found by the forum's address, so a link on a watched forum matches it whatever the forum's name is.
- Other links get no community.

## Related

- [Drafting replies](/guides/drafting-replies): what happens after a conversation qualifies
- [Listening trends](/guides/listening-trends): what the search finds over time
- [X API (optional, paid)](/credentials/x-api): set up X search
- [Costs](/concepts/costs): what scoring, drafting and X reads cost
- [Jobs](/reference/jobs): the `listen_scan` and `opportunity_score` jobs
