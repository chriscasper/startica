---
title: Manual channels
description: How to get drafted replies for threads on X, LinkedIn, Facebook groups and any other site by pasting them in, and when X can be searched with your own API token.
layout: doc
---

Startica finds threads on Reddit, Hacker News, Bluesky, Mastodon and Discourse forums on its own, and on X if you add your own paid X API token. For everything else, you bring the thread. Paste the link and the post's text into the **Inbox**, and Startica scores it and drafts a reply the same way it does for discovered threads.

This works for X (without a token), LinkedIn, Facebook groups, Discord or Slack messages with a link, or any page with a URL.

## Why these channels are manual

| Channel | Why Startica doesn't read it on its own |
| --- | --- |
| X | Search needs X's paid API. You can add your own token to turn on X search: see [X API (optional, paid)](/credentials/x-api). Without one, X is paste-only. Scraping is against X's terms. |
| LinkedIn | No public search API. Scraping is against its terms. |
| Facebook groups | The Groups API was deprecated. Scraping is against its terms. |
| Other sites | No general way to read them. |

Startica doesn't scrape these sites or automate them. You find the thread, you paste it, and you post the reply yourself. For X and LinkedIn, the desktop app's **Post…** can fill your reply in on the site for you; you still press the site's own button.

## Paste a thread

1. Open the **Inbox**.
2. Click **Paste a link**.
3. Fill in the form:

   | Field | What to enter |
   | --- | --- |
   | **Link** | The full URL of the post. Required. |
   | **Post text** | The text of the post you want to reply to. Required for every site except Reddit, Hacker News, Bluesky, Mastodon and Discourse links, and X links when you have an X API token. |
   | **Community (optional)** | The group, page or community name, for example the Facebook group's name. |

4. Click **Draft a reply**.

The card appears in the **In progress** tab while it's scored and drafted, then moves to **To review**.

> [!TIP]
> Include enough context in **Post text** for a good reply. If the post is a reply in a longer thread, paste the original post too, and the replies that matter. The AI only sees what you paste.

## What gets stored

For a link Startica can't read, it stores only what you give it:

| Stored | Value |
| --- | --- |
| Channel | Taken from the link: `x.com` or `twitter.com` is X, `linkedin.com` is LinkedIn, `facebook.com` or `fb.com` is Facebook, anything else is shown as "Other" (Bluesky, Mastodon and Discourse links are recognized too, and read by Startica) |
| Link | The URL you pasted |
| Text | Your **Post text** |
| Community | Your **Community** value, or none |
| Author, title, posting time | Not stored, since Startica can't read them |

With an X API token, a pasted X link is read through the API (one read toward your daily cap). Startica then stores the post's text, posting time, likes and reply count, but still no author, and the link becomes `x.com/i/status/<id>`. If you also paste text, your text is used.

Everything stays in your local database. The text is sent to your AI provider (Claude or OpenAI) for scoring and drafting, like any other conversation. See [Privacy and security](/concepts/privacy-security).

If you paste the same link again with new text, the stored text is replaced and the thread is scored and drafted again.

## How pasted threads are handled

Pasted threads always get a draft. They skip the 7-day age check, the near-duplicate check and the relevance and intent thresholds. They're still scored, so the card shows the AI's relevance and intent scores and explanation.

From there, the workflow is the same as for any other thread: edit, regenerate, copy and open, mark as posted. See [Drafting replies](/guides/drafting-replies).

In the desktop app, some pasted threads also offer **Post…**, which opens the site with your reply filled in. You press the site's own button yourself.

| Pasted link | Post… |
| --- | --- |
| X post (`x.com/<user>/status/<id>`) | Opens X's own composer with your reply in it. You press **Reply**. Up to 4,000 characters. |
| LinkedIn post (`linkedin.com/feed/update/…` or `linkedin.com/posts/…`) | Opens the post and types your reply into its comment box. You press **Comment**. Up to 3,000 characters. Read the [LinkedIn terms warning](/guides/assisted-posting#linkedin-and-its-terms) first. |
| Facebook and other sites | No: copy only |

See [Posting with Startica](/guides/assisted-posting).

## Self-promotion rules for manual channels

Before drafting, Startica looks up the thread's community to read its **Self-promotion rules**. The lookup matches the community name you entered (ignoring case) against your communities on the **Intel** page for the same channel.

To use this for a Facebook group, for example:

1. On the **Intel** page, open **Communities** and click **Add community**.
2. Set **Channel** to Facebook and **Name** to the group's name.
3. Describe the group's rules in **Self-promotion rules**.
4. When you paste a thread from that group, enter the same name in **Community**.

Without a match, the rules count as unknown, and the draft leans toward not mentioning your product.

> [!NOTE]
> Watching an X, LinkedIn, Facebook or Bluesky community has no effect on discovery. Only Reddit subreddits, Mastodon hashtags and Discourse forums are scanned as communities; X and Bluesky are searched by keyword. See [Finding conversations](/guides/finding-conversations).

## Engagement tracking

Startica checks replies on links you saved for Reddit, Hacker News, Bluesky, Mastodon and Discourse, and on X links if you have an X API token (each check is one paid read). Replies you post on LinkedIn, Facebook or other sites are recorded as posted, and their tracked visits still show up through GA4 if the reply includes your product link, but Startica can't count replies under them. See [Analytics](/guides/analytics).
