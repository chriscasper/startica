---
title: Content Studio
description: Write posts, threads, articles, newsletter issues and email campaigns for a channel, in a voice you pick, then edit, copy, post and track how they did.
layout: doc
---

Content Studio writes original content for you: posts, threads, articles, newsletter issues and email campaigns, shaped for one channel and written in a voice you choose. It never posts or sends anything by itself. You post the piece under your own account, either with **Post…** (X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse, in the desktop app) or by copying it, and Startica records where it went so it can track results.

Content Studio has three tabs:

| Tab | Purpose |
| --- | --- |
| **Create** | Pick a channel, format, voice and topic, and get ideas. |
| **Library** | Every piece, newest first: edit, rewrite, post or copy, mark as posted, add notes. Shows the latest 50. |
| **Calendar** | When each piece and reply is planned, reminders, best times to post and AI content plans. See [Content calendar](/guides/content-calendar). |
| **Voices** | Build voice profiles. See [Voice profiles](/guides/voice-profiles). |

You need a product in Settings first. Content is written from your product's intel (brief, personas), so [build intel](/getting-started/first-run) before you start.

## Write a piece

On the **Create** tab, fill in the **Write something** card:

| Field | Options |
| --- | --- |
| Channel | Reddit, X, LinkedIn, Hacker News, Mastodon, Bluesky, Discourse, Blog, Newsletter, Email, Other |
| Format | Post, Thread, Article, Newsletter issue, Email campaign |
| Voice | Any ready voice profile, or **Plain (no voice)** |
| Topic | What the piece should be about, in a sentence or two (at least 3 characters) |

Click **Write it**. The piece is written in the background and appears in the **Library** tab, which shows **Writing…** until it's done.

Writing uses the `draft` model task, which is Claude Sonnet or GPT-6.1 Sol by default. See [AI models](/concepts/ai).

> [!TIP]
> Be specific in the topic. "Three ways to back up field notes when you have no signal for a week" gives a better piece than "backups".

### Channel norms

Startica gives the AI strict rules for each channel:

| Channel | Rules the AI follows |
| --- | --- |
| Reddit | A specific, non-clickbait title and a body that gives real value. Reads like a community member, not a brand. No links unless essential; if it mentions the product, it says you made it. |
| X | Each tweet at most 280 characters. Threads are numbered (`1/`, `2/` …) and separated by blank lines. At most one hashtag. |
| LinkedIn | A first line that earns the "see more" click, short paragraphs, 600–1300 characters, a question or takeaway at the end, at most 3 hashtags. |
| Hacker News | Plain and factual, no marketing language. For Show HN: what it is, why you built it, what's interesting technically, what you'd like feedback on. |
| Blog | A title, an intro that states the reader's problem, 3–6 sections with headings, 700–1200 words, one clear next step. Markdown. |
| Newsletter | A subject line as the title, a warm opening, one main story or lesson, 300–600 words, one call to action. Markdown. |
| Email | With the **Email campaign** format: a sequence of emails (see [Email campaigns](#email-campaigns)). |
| Bluesky | One post of at most 300 characters, including any link (a hard limit). Conversational and specific, one or two hashtags at most. A thread separates posts with blank lines and numbers them (`1/`, `2/` …), each under 300 characters. |
| Mastodon | One post of at most 500 characters, including any link. Friendly and plain, no marketing tone. 1–3 relevant hashtags in CamelCase at the end. A thread separates posts with blank lines, each under 500 characters. |
| Discourse | A specific, descriptive title and a body that starts a real discussion or shares something useful, 150–600 words, Markdown with short paragraphs. Reads like a forum member; mentions the product only if it's on topic, saying you made it. |
| Other | No rules of its own: the AI follows the norms of the channel described in the topic. |

The format is passed along with the channel. Pick a combination that makes sense (for example, X with Thread, or Blog with Article).

> [!TIP]
> **Post…** only posts single posts on Bluesky and Mastodon, and is hidden for Bluesky text over 300 characters and Mastodon text over 500. Pick the **Post** format there, or copy a thread and post it by hand.

### What the AI won't do

The writing instructions tell the AI to:

- Lead with value for the reader, and mention the product only where it fits naturally.
- Say plainly that you are the founder whenever it mentions the product.
- Never invent facts, numbers, features, testimonials or personal experiences that aren't in your product information or your guidance.
- Follow the voice for style only, never copying the source's opinions or claims.

Still read every piece before you post it.

## Email campaigns

Pick **Email** as the channel or **Email campaign** as the format; picking one selects the other. An email campaign only goes with the Email channel, and choosing another channel switches the format back to **Post**.

The AI writes a short sequence of emails toward one goal, such as a welcome, a launch, re-engagement or onboarding. Say the goal in the topic, for example "Welcome sequence for new Fieldnote users: get them to their first synced notebook".

What the AI is asked to write:

| Part | Rules |
| --- | --- |
| Sequence | 3 to 5 emails, unless the topic asks for a different number. Value first, the ask later. |
| Subject | Under 50 characters, specific, not clickbait |
| Preview text | Under 90 characters, adding to the subject (shown after the subject in the inbox) |
| Send day | Days after the first email; the first is day 0 |
| Body | 80–250 words, plain and personal, one idea and one call to action per email. Markdown is fine; no images. No spam words, fake urgency or ALL CAPS. |

In the **Library**, a campaign shows each email separately: **Email 1**, **Email 2** and so on, with its send day ("Day 0 (first)", "Day 3"), subject, preview text and the start of its body. Each email has two copy buttons: **Subject** copies the subject line, and **Email** copies the body.

The text box below the emails edits the whole campaign at once. Each email is a section like this:

```text
## Email 1 · Day 0
Subject: Welcome to Fieldnote
Preview: Here's how to start

Hi there,
…
```

Keep the `## Email 1 · Day 0` headings and the `Subject:` and `Preview:` lines when you edit. The list above updates as you type. If Startica can't find the headings, it shows "Keep the “## Email 1 · Day 0” headings to see each email separately." instead of the list. **Rewrite** works on the whole campaign.

> [!NOTE]
> Startica never sends email. Copy each email into your own email tool and schedule it there. The product link in a campaign is tagged with `utm_medium=email`, so visits from it show separately in Google Analytics.

**Mark posted** works for campaigns like any other piece, but there's no engagement to track: Startica can't read your email tool.

## Get ideas

The **Ideas** card on the **Create** tab suggests topics. Click **Suggest ideas** (or **New ideas** once you have some). The AI reads your brief and personas plus up to 25 of the most relevant conversations Startica has found, and suggests 8 ideas across channels (Reddit, X, LinkedIn, Hacker News, Bluesky, Mastodon, Discourse, Blog, Newsletter and Email), each with a one-line reason.

Click an idea to copy its topic and channel into the form. Then pick a format and voice and click **Write it**.

**SEO & GEO → Opportunities** is another source of topics: **Write it in Content Studio** on a query close to page 1, or on a comparison question AI assistants answer without you, creates a Blog article here and starts writing it, with guidance from the opportunity. It's written in the product's newest ready voice profile, or the default voice if there's none. See [Opportunities](/seo/opportunities#write-it-in-content-studio).

## Edit a piece

In the **Library**, each piece shows its channel, format, voice and date, an editable **Title** (shown when the piece has a title, and always for Reddit, Hacker News, Discourse, Blog and Newsletter) and an editable body. Below the body is a one-line note from the AI on the angle it chose.

Change the text directly. A **Save edits** button appears once you've changed something.

## Rewrite with guidance

Click **Rewrite** to get a new version. The dialog asks **What should change? (optional)**, for example "Shorter. Funnier. Don't mention the product. Open with a question…" (up to 1000 characters).

- With guidance, the AI sees the current version and your instructions and revises it.
- Without guidance, the AI writes the piece again from scratch.

The new version replaces the old one. Unsaved edits are lost, but saved ones are kept: once a piece has two or more versions, **Versions** lists them and **Restore** brings one back.

## Refine it in a chat

**Refine** on a piece that isn't posted opens a chat beside the page: ask whether it suits the channel, ask for a stronger opening, or say what to cut. A revised version appears under the AI's reply with **Apply**. An email campaign is revised email by email, in the same `## Email 1 · Day 0` format. Save or undo your own edits first. See [Refining AI suggestions](/guides/refine).

## Product mentions and tracking links

If your product has a website set in Settings, every piece is written with a tracking link to it. The AI may use the link at most once, and only if the format allows links. If the finished piece mentions the product, Startica keeps the link so it can match visits in Google Analytics or Umami to that piece.

The link is your website with UTM parameters added. For example:

```text
https://fieldnote.example/?utm_source=bluesky&utm_medium=content&utm_campaign=bluesky-2026-10-09&utm_content=content-1a2b3c4d
```

`utm_content` holds an id unique to that version of the piece. Each rewrite gets a new id, so visits are attributed to the exact version you posted. See [Analytics](/guides/analytics) for how visits are matched.

> [!NOTE]
> `utm_source` is the piece's channel (`bluesky`, `mastodon`, `discourse`, `linkedin`, `x`, `reddit`, `hackernews`, `blog`, `newsletter` or `email`) and `utm_campaign` is `<channel>-<date>`. `utm_medium` is `email` for Email and Newsletter pieces and `content` for everything else, so you can tell them apart from Inbox replies, which use `community`.

If you don't want the product mentioned, say so in the topic or in **Rewrite** guidance.

## Post it

### With Post… (X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon, Discourse)

In the desktop app, pieces written for these channels have a **Post…** button next to **Copy**, when Startica can build the posting page:

| Channel | Needs |
| --- | --- |
| X | A single post (not a thread), up to 4,000 characters |
| Hacker News, Reddit | A title |
| LinkedIn | Up to 3,000 characters. Read the [terms warning](/guides/assisted-posting#linkedin-and-its-terms) first. |
| Bluesky | A single post, up to 300 characters |
| Mastodon | A single post, up to 500 characters, and your server set in **Settings → Channels → Posting** |
| Discourse | A title, and a watched Discourse forum on the **Intel** page. The topic goes to the product's first watched forum. |

1. Click **Post…**. Unsaved edits are saved, and a **Post with Startica** window opens on the site's new-post form with the piece filled in.
2. Check it on the page. On Reddit, pick the subreddit there. On Discourse, pick the category.
3. Press the site's own button (**Post** on X, LinkedIn, Bluesky and Mastodon; **submit** on Hacker News and Reddit; **Create Topic** on Discourse).
4. Startica saves the link, marks the piece posted in the **Library**, and the window closes.

**Post…** stays visible when the **Title** is empty for Hacker News, Reddit or Discourse; clicking it says "Add a title first: this channel's posts need one". If a Discourse forum holds the new topic for a moderator, the piece is marked posted without a link; click **Add link** once it's approved.

The first time, you sign in to the site inside that window. This is in beta, tested only against stand-ins so far. See [Posting with Startica](/guides/assisted-posting) for the details, the fallbacks and the current limits.

### Copy and post (every channel)

Click **Copy** to copy the piece to your clipboard. If it has a title, the title comes first, then a blank line, then the body. Post it yourself on the channel.

Then click **Mark posted**. The **Mark as posted** dialog asks for an optional link to the post. Unsaved edits are saved first.

- Add the link if you can. For Reddit, Hacker News, Bluesky, Mastodon and Discourse links (and X links, if you have an [X API token](/credentials/x-api)), Startica checks the post's score and replies every 6 hours for two weeks, and flags it if it was removed.
- If you skipped the link, an **Add link** button appears on the posted piece. Adding it later keeps the original posting date.

The link decides where Startica looks for replies, so a piece written for "Blog" but posted on Reddit is still tracked as a Reddit post.

## See how it did

A posted piece shows what Startica knows about it, when available:

- Points (or likes) and replies, with the date of the latest check (Reddit, Hacker News, Bluesky, Mastodon and Discourse links, and X links with an X API token).
- A **Removed** badge if moderators removed it or it was deleted.
- Visits and key events from Google Analytics or Umami through its tracking link, when one of them is connected and the piece links to the product.

Click **How did it do?** to write notes in your own words (likes, comments, signups, up to 2000 characters). The notes appear on the piece under **How it did**.

Posted pieces also appear in [Analytics](/guides/analytics) under **What Startica did** → **Posted by Startica**. The weekly [roadmap](/guides/roadmap) re-plan counts how many pieces you posted per channel and the replies they got.

## Plan it and add an image

**Plan** on a piece sets when you want to post it; Startica reminds you when it's due. See [Content calendar](/guides/content-calendar). **Image** makes a picture with your words in the channel's sizes. See [Post images](/guides/post-images).

## Delete a piece

Use the trash icon on a piece and confirm. This cannot be undone.

## Costs

Each **Write it**, **Rewrite** and **Suggest ideas** is one AI call on the `draft` task. Engagement checks and GA4 or Umami matching are free. See [Costs](/concepts/costs).
