---
title: Listening trends
description: What the Inbox's Trends tab shows about the conversations Startica finds, how spikes are detected, and where sentiment and share of voice come from.
layout: doc
---

The Inbox's **Trends** tab shows what the hourly search has been finding for the active product: how many conversations a day, which of your listening keywords and communities they came from, how their authors sound, and how often your product is named next to your competitors. Everything is counted by rules from what's already stored, so the tab makes no AI calls and costs nothing.

## What's counted

Every conversation the search found for the product in the period, including ones scoring archived: they still matched one of your keywords, so they say something about how much people talk about it. Two kinds are left out:

- **Near-duplicates** (cross-posts and reposts, see [Finding conversations](/guides/finding-conversations#how-conversations-are-scored)), so one thread posted in three places counts once.
- **Answers to replies on your own posts** (see [Replies to your posts](/guides/replies)). Those are your conversations, not the market's.

A conversation counts on the day it was posted, in your computer's time zone, or the day it was found if the site gives no date. Pick **Last 30 days** or **Last 90 days** above the charts.

## Keywords and communities

When a conversation is stored, Startica checks its title and text for each of your listening keywords (the ones set to **Listening** or **Both** on Intel). A keyword matches as a whole phrase, ignoring case and extra spaces, with or without a plural "s": "field notes app" matches "Field Notes apps" but not "myfield notes app". One conversation can match several keywords, or none (a subreddit's new posts are read whatever they say).

**By keyword** and **By community** list the busiest ones with their counts for the last 7 days and the whole period. Click one to draw it on the chart on its own; the chart's **Show as table** lists the daily numbers.

If you add, rename or remove a keyword, the last 90 days are matched again the next time the tab opens or the search runs.

## Spikes

A keyword or community spikes when it's much busier than its own recent average:

| Window | Rule |
| --- | --- |
| A day (today or yesterday) | At least 5 conversations, and at least 3 times the daily average of the 14 days before |
| The last 7 days | At least 10 conversations, and at least 2 times the weekly average of the 3 weeks before |

The average counts as at least 1 a day (or a week), so a keyword that's usually silent needs 5 conversations in a day to spike, not 1. A product needs 14 days of listening before day spikes are checked, and 28 before week spikes, so a new product doesn't spike on everything.

The strongest spike also becomes a move on [Today](/guides/today) ("Conversations about … jumped today"). Each keyword or community is offered at most once a week, whether you did the move, skipped it or ignored it.

## Sentiment

When the AI scores a conversation for relevance and intent, it also says how the author sounds: **positive** (pleased, recommending), **negative** (frustrated, complaining), **mixed** or **neutral** (asking or informing). It's part of the same scoring call, so it adds no cost. Conversations scored before this was added, near-duplicates and ones archived as too old have no sentiment and are listed as not scored.

## Share of voice

**Share of voice** counts the conversations that name your product, and each competitor on Intel, by name (whole words, ignoring case). Its percentages are each name's share of all those mentions. It counts names, not opinions: a thread complaining about a competitor counts for that competitor.

> [!NOTE]
> A short or common product name can match conversations that aren't about it. Check a few threads in the Archived tab before reading much into the numbers.

## Related

- [Finding conversations](/guides/finding-conversations): what the search reads
- [Replies to your posts](/guides/replies)
- [Today](/guides/today)
