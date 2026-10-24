---
title: Content calendar
description: Plan when each Content Studio post and Inbox reply goes out, get a reminder when it's due, see the best times to post, and let the AI plan the next week or two.
layout: doc
---

The content calendar shows what you plan to post and when: Content Studio pieces and drafted Inbox replies, by week or by month. When something is due, Startica reminds you and opens it. It never posts for you: you press **Post…** (or copy the text) and then the site's own button, as always.

Open it from **Content Studio → Calendar**, or **Content Calendar** in the tray menu.

## Plan a post or a reply

Every unposted piece in the **Library** and every drafted reply in the **Inbox** has a **Plan** button. It opens a date-and-time field (your computer's time zone) with:

- the best-time hint for the piece's channel, or the reply's community (see [Best times to post](#best-times-to-post));
- **Next good time**, when there is a hint: the next good hour on a good day, at least 30 minutes from now.

Once planned, the button shows the time; click it to move the time or **Clear** it. A planned piece shows the time as a badge in the **Library**.

## The calendar

| Part | What it shows |
| --- | --- |
| **Week** / **Month** | Planned items per day with their time and channel. Posted ones are dimmed with a check; a spark marks items from a content plan. Use the arrows and **Today** to move around. |
| An item | Click it to open it above the calendar, with **Post…**, **Copy**, **Mark posted** and **Plan** right there. |
| **Best times to post** | The hints Startica has per channel and per watched community. |
| **Content plans** | Plans the AI made, with their status, cost and **Plan again**. |

Items past their time and not posted are counted at the top: post them, or move them.

## Reminders

Every 15 minutes while Startica is open (in the window or the tray), the `calendar_remind` job looks for planned items that are due (up to 10 minutes early) and not posted yet. Each is reminded once:

- a desktop notification. One item: "Time to post on Bluesky"; clicking it opens the item on the calendar. Several: "3 posts are due"; clicking it opens the calendar.
- a **Calendar** move on [Today](/guides/today).

Moving a planned time sets up a new reminder. Items planned for today also appear on Today when it's built or refreshed.

> [!NOTE]
> Startica doesn't post at the planned time. The reminder is your cue: check the text, press **Post…**, then press the site's own button. Jobs only run while Startica is open, so a reminder due while it was closed comes the next time it opens.

## Best times to post

Startica suggests good hours and days by rules, without AI:

| From | Used for | Needs |
| --- | --- | --- |
| Your own posts on a channel: when each went out against the points and replies it got (Inbox replies and Content Studio pieces with a tracked link, last 180 days) | The channel's hint | At least 8 measured posts |
| When the conversations Startica found in a watched community were posted (last 60 days) | The community's hint, and the channel's when you don't have 8 posts there yet | At least 30 conversations |

Hours are judged with their neighbors and only count when your posts there did better than your average post (or, for communities, when that hour is clearly busier than the rest). Below the minimum, or when the numbers show no pattern yet, the hint says "Not enough data yet" with how much it has.

## Plan with AI

**Plan with AI** fills the next week or two with planned posts:

| Field | Options |
| --- | --- |
| How far ahead | The next week or the next two weeks, starting tomorrow |
| Posts per week | 1 to 14 |
| Channels | Any Content Studio channel; each shows its best-time hint |
| Guidance | Optional, up to 1000 characters, for example "Lead up to the template launch on Thursday" |

The dialog shows the cost before you start. The `content_plan` job (the `draft` task, prompt `content-plan@1`) reads your intel, the latest [weekly analytics read-out](/guides/analytics), your best-performing posts and replies, what's already planned and the best-time hints, and proposes topics, channels and times with a one-line reason each. Every slot becomes a piece in the **Library** with that time and reason ("In the content plan: …"), written in your newest ready voice by the usual writing job. Edit, rewrite, move or delete any of them.

**Plan again** on a plan replaces that plan's pieces that aren't posted yet, including your edits and their images, and keeps posted ones. A failed plan shows its error; **Plan again** retries it.

## Costs

Planning a post, reminders and best-time hints are free. **Plan with AI** is one AI call for the plan plus one per piece written. See [Costs](/concepts/costs).
