---
title: Replies to your posts
description: How Startica collects replies to what you posted, lists them in the Inbox's Replies tab, and drafts an answer when you ask.
layout: doc
---

When people answer something you posted, the Inbox's **Replies** tab lists what they said, so you can keep the conversation going. Startica reads replies to your Inbox replies and to [Content Studio](/guides/content-studio) posts that you posted with a link, for two weeks after posting. It reads them through each site's public pages and APIs, without signing in, and never reads private messages.

## Where replies come from

Replies are read with the same check as [engagement tracking](/guides/drafting-replies#engagement-tracking), every 6 hours while Startica is open, so they add no requests:

| Channel | What's read |
| --- | --- |
| Reddit | The comments below your comment or post, from its public feed. Reddit's feeds don't say which comment answers which, so every reply is shown as a reply to yours. |
| Hacker News | Every reply below your comment or story, nested. |
| Bluesky | The thread below your post, up to 6 replies deep. |
| Mastodon | The replies below your post, read through the server in its link. |
| Discourse | The posts that reply to yours, and replies to those, from the topic around your post. Below a topic you started, every later post. |
| X, LinkedIn, Facebook, other sites | Nothing. |

Your own replies are left out: Startica takes your name from your post on that site. Comments the site marks as removed or deleted are left out too. At most 50 replies are kept per post on each check, newest first.

## The Replies tab

Each reply shows who wrote it, when, what it answers (with a link to your post) and its text.

| Status | Means |
| --- | --- |
| **New** | Not looked at yet. New replies make a move on [Today](/guides/today). |
| **Seen** | You looked at it, or asked for a drafted answer. |
| **Answered** | You posted an answer with Startica, pressed **I answered it**, or Startica saw your answer below it on the site (not on Reddit). |
| **Dismissed** | Nothing to say. |

The filters above the list show **New and seen**, **Answered** or **Dismissed**. **Mark all seen** marks the new ones on the page; **Reopen** brings an answered or dismissed reply back.

## Draft an answer

**Draft an answer** turns the reply into a conversation and drafts your answer, as for any thread in the Inbox. The drafter is told it's a reply to your own post, sees what you posted, and is asked to answer their point without repeating your post or mentioning the product again unless they ask. The answer's card appears under the reply, with the usual **Edit**, **Regenerate**, **Post…**, copy and **Mark as posted** (see [Drafting replies](/guides/drafting-replies)).

When you post it, the reply is marked answered, and your answer is tracked for engagement and replies like any other post. Answers are listed under their reply, not in the other Inbox tabs, and aren't counted in [listening trends](/guides/listening-trends).

> [!NOTE]
> Nothing is posted for you. Like every reply, you check the answer and press the site's own button.

## Related

- [Drafting replies](/guides/drafting-replies)
- [Posting with Startica](/guides/assisted-posting)
- [Jobs](/reference/jobs): the `engagement_sync` job
