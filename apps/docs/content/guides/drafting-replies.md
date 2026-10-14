---
title: Drafting replies
description: How to review, edit, post and dismiss the replies Startica drafts in the Inbox, and the rules the drafts follow.
layout: doc
---

The **Inbox** holds the conversations Startica found or you pasted, each with a drafted reply. You read the thread, adjust the draft, and post it under your own account: either with **Post…**, which fills it in on the site for you (X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse, in the desktop app), or by copying it into the thread and marking it as posted. Either way, you press the site's own button. Startica never posts for you.

The Inbox shows the product selected in the sidebar's product switcher.

## The Inbox tabs

| Tab | Shows | Statuses |
| --- | --- | --- |
| **To review** | Drafts ready for you, and drafts that failed | `drafted`, `failed` |
| **In progress** | Threads being scored or drafted | `new`, `drafting` |
| **Posted** | Threads you posted with Startica or marked as posted | `posted` |
| **Archived** | Threads that didn't qualify | `archived` |
| **Dismissed** | Threads you dismissed | `dismissed` |

Each tab shows a count and the 50 most recent items, newest first. There are no other filters. The page updates on its own as jobs finish.

## How a thread moves through the Inbox

```text
new ──scored──▶ drafting ──▶ drafted ──Post… or Mark as posted──▶ posted
  │                 │            │
  │                 └─▶ failed   └──Dismiss──▶ dismissed
  │
  └──below thresholds, too old, or a duplicate──▶ archived
                                         │
                       Draft a reply anyway ──▶ drafting
```

| Status | What it means |
| --- | --- |
| `new` | Stored, waiting to be scored. The card shows "Scoring…". |
| `archived` | Didn't clear the thresholds, was older than 7 days, or is a near-copy of a thread already seen. |
| `drafting` | The AI is writing a draft. The card shows "Writing a draft…". |
| `drafted` | A draft is ready to review. |
| `failed` | The draft couldn't be written. The card shows the error. |
| `posted` | You posted it with **Post…**, or marked it as posted. |
| `dismissed` | You dismissed it, with a reason. |

How threads get scored is covered in [Finding conversations](/guides/finding-conversations).

## Reading a card

Each card shows:

- The channel, community, author and how long ago it was posted.
- The thread title, linked to the original.
- **Relevance** and **Intent** scores as percentages. Scores of 70% or more are highlighted.
- The post text. Long posts are cut off; click **Show more**.
- **Why it matched:** the AI's one- or two-sentence reasoning for the scores. For archived threads, this is why it was archived.
- The draft, with its version (for example **Draft v2**) and badges:
  - **Mentions the product** or **No product mention**.
  - **Edited by you** if the latest version is your edit.
- A line like "You've mentioned the product in 1 of your last 4 replies here", when you've posted in that community in the last 30 days.
- One sentence from the AI on why it wrote the reply this way, and why the product is or isn't mentioned.

## Edit the draft

The draft is an editable text box. Change anything you like. When your text differs from the saved draft, a **Save edits** button appears. Saving creates a new version marked **Edited by you**.

You don't have to save before posting. **Post…** and **Mark as posted** save your edits first.

## Regenerate with guidance

Click **Regenerate** to get a new draft. The dialog asks **Anything to change? (optional)**. Write plain instructions, for example:

```text
Shorter. Don't mention the product. Answer the question about exporting first.
```

Your guidance is passed to the AI along with the thread. The new draft becomes the next version. Earlier versions are kept in the database but the card shows only the latest.

**Regenerate** is available on drafted and failed cards. It's also how you retry a failed draft.

## Post it

There's no separate approve step. When the draft is right, post it one of two ways. Either way, you're the one who presses the site's button.

### With Post… (X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon, Discourse)

In the desktop app, drafted replies to threads on these sites have a **Post…** button, when Startica can open the thread for posting.

1. Click **Post…**. Unsaved edits are saved, and a **Post with Startica** window opens on the thread with your reply filled in.
2. Check it, then press the site's own button: **reply** on Hacker News, **save** on Reddit, **Comment** on LinkedIn, **Reply** on X, Bluesky, Mastodon and Discourse.
3. Startica saves the link to your reply, the window closes, and the card moves to **Posted**.

The first time, you sign in to the site inside that window. Mastodon replies also need your own server in **Settings → Channels → Posting**. **Post…** is hidden for replies over the site's character limit (X 4,000, LinkedIn 3,000, Mastodon 500, Bluesky 300). On Mastodon the `@author ` mention the reply starts with counts toward the 500. This is in beta, tested only against stand-ins so far. On LinkedIn, read the [terms warning](/guides/assisted-posting#linkedin-and-its-terms) first. See [Posting with Startica](/guides/assisted-posting) for the details and what to do if something goes wrong.

### Copy and open (every channel)

1. Click **Copy & open thread**. The reply is copied to your clipboard and the thread opens in your browser.
2. Paste the reply into the thread and post it there, under your own account.
3. Back in Startica, click **Mark as posted**.
4. Optionally paste the link to your reply in **Link to your reply (optional)**, then click **Mark as posted**.

This is the only way for Facebook and other sites, and in browser mode (`yarn dev:desktop-web`), where **Post…** is hidden. It also works for any reply that **Post…** couldn't finish.

The card moves to **Posted**, where it shows an **Open thread** link. A reply with a saved link also shows **Open your reply**. A reply without one shows **Add link** instead: paste the link in **Link to your reply** and click **Save link**. That covers replies you marked as posted without a link, and replies **Post…** saved without one, such as a Discourse reply held for a moderator.

> [!TIP]
> Add the link to your reply. Without it, Startica can't track replies to it. To get the link on Reddit, use your comment's **Share** or permalink. **Post…** saves the link for you when the site shows it.

If copying fails, Startica tells you. Select the text and copy it by hand.

## Dismiss a thread

Click **Dismiss** on a drafted, failed or archived card, and pick a reason:

| Reason | Use it when |
| --- | --- |
| Off topic | The thread isn't about your product's problem. |
| Wrong audience | Right topic, wrong people. |
| Too old / thread is dead | The conversation has moved on. |
| Community rules don't allow it | A reply would break the community's rules. |
| Already well answered | Others have said what you'd say. |
| Other | None of the above. |

The reasons are used in two places:

- The weekly roadmap plan sees how many threads you dismissed and why. A pattern of "Off topic" points to noisy keywords. See [Growth roadmap](/guides/roadmap).
- When you export cases for the scorer eval (`yarn eval:export score`, run from source), dismissed threads become examples the scorer should have skipped, and posted threads become examples it should have kept. "Too old" and "Community rules don't allow it" are left out, since the scorer doesn't judge age or rules. See [Prompts and evals](/contributing/prompts-evals).

Dismissing doesn't change scoring automatically. Nothing is retrained.

## Draft an archived thread anyway

Open **Archived**, find the card, and click **Draft a reply anyway**. It goes straight to drafting with no new scoring.

## What the drafts follow

The drafting prompt gives the AI your product brief, personas and notes, the thread, the community's self-promotion rules, and how often you've mentioned the product there recently. The rules it follows:

- **Be useful first.** Answer the question or add something concrete. The goal is a reply that would be good even with the product removed.
- **Sound like a community member.** Plain words, no marketing language, no hype, no sign-off, no emoji unless the thread uses them. Match the thread's length and tone; most replies are 2 to 6 sentences.
- **Mention the product only when it truly helps** and the community's rules allow it.
- **Disclose.** When the product is mentioned, the reply says plainly that you made or run it, for example "full disclosure: I built this, so I'm biased, but…". The product is mentioned once.
- **Lean toward no mention** when the community's rules are strict or unknown.
- **Don't invent** product facts, prices, numbers or personal experiences that aren't in the product information. Don't criticize competitors unfairly.

> [!NOTE]
> The **Self-promotion rules** on each community on the **Intel** page are what the AI reads. If they're blank, the rules count as unknown. Fill them in for the communities you care about.
>
> Startica finds the thread's community on the same channel: a Discourse forum by its address, a Mastodon hashtag with or without its `@server`, and other channels by name.

### The tracking link

When the product has a URL and the draft mentions the product, the reply includes a tagged link:

```text
https://fieldnote.example/?utm_source=reddit&utm_medium=community&utm_campaign=r-fieldwork-2026-10-09&utm_content=<draft id>
```

| Parameter | Value |
| --- | --- |
| `utm_source` | The channel: `reddit`, `hackernews`, `x`, `linkedin`, `facebook`, `mastodon`, `bluesky`, `discourse` or `other` |
| `utm_medium` | Always `community` |
| `utm_campaign` | The community (or the channel, if there's no community) and the date, for example `r-fieldwork-2026-10-09`, `fieldwork-mastodon-social-2026-10-09` for `#fieldwork@mastodon.social`, or `bluesky-2026-10-09` |
| `utm_content` | The draft's id |

GA4 or Umami reports visits per `utm_content`, which is how Startica ties visits back to a single reply. Keep the link as written when you edit. See [Analytics](/guides/analytics).

If the product has no URL, the draft has no link.

## Engagement tracking

For posted replies with a link (saved by **Post…**, or added in **Mark as posted** or with **Add link**), Startica checks every 6 hours for two weeks:

| Channel | What's checked |
| --- | --- |
| Reddit | Replies below your comment, and whether it was removed or deleted. Reddit's feeds carry no vote counts. |
| Hacker News | Replies below your comment, points on stories, and whether it was deleted. |
| Bluesky | Likes and replies, and whether the post was deleted. |
| Mastodon | Favourites and replies, and whether the post was deleted. Read through the server in the link (your own server, for replies posted with **Post…**). |
| Discourse | Likes and replies, and whether the post was deleted or hidden. |
| X | Only with an [X API token](/credentials/x-api): likes and replies, and whether the post is gone. Each check is one paid read and counts toward the daily cap. |
| LinkedIn, Facebook, other sites | Nothing. |

The checks run only while Startica is open. Results show on the **Analytics** page under **Posted by Startica**, with GA4 or Umami visits and key events for replies that carried the tracking link.

## Related

- [Finding conversations](/guides/finding-conversations)
- [Posting with Startica](/guides/assisted-posting)
- [Manual channels](/guides/manual-channels)
- [Content Studio](/guides/content-studio): longer posts in a saved voice. Inbox replies don't use voice profiles.
