---
title: Results and what to do next
description: "See what each ad brought and cost, from the spend you enter and the visits your analytics recorded, and get a suggestion per ad: scale, keep, rewrite or stop."
layout: doc
---

The **Results** tab of a campaign shows what each ad brought in and what it cost, and suggests what to do with each one: **scale** it, **keep** it, **rewrite** it or **stop** it. Visits and results come from your web analytics, matched to each ad by its tracking link. Spend comes from you: Startica can't see your ad account, so you copy what the ad manager reports.

This page covers what you need, entering spend, the target cost per result, the numbers, the weekly read-out, and how the suggestions are worked out. To plan a campaign first, see [Ads](/ads).

> [!WARNING]
> Startica doesn't change anything in your ad account. When it says stop or scale, you pause the ad or raise its budget in the platform's ad manager yourself.

## What you need

- **GA4 or Umami connected** for the product, in **Settings → Products**. See [Google Analytics](/credentials/google) or [Umami](/credentials/umami). Without one, the tab says to connect one and shows spend only. Every ad link already carries the ad's id as `utm_content` (see [Tracking links](/ads#tracking-links)), so nothing else needs setting up. With both connected, Startica uses the one that's working, GA4 first.
- **A key event** for your result, such as a signup: a GA4 key event, or an event listed under **Key events** on the Umami connection. Results are those key events. See [Analytics](/guides/analytics).
- **The tagged links kept as written** in the ad manager. An ad whose link lost its `utm_content` shows no visits.
- **Spend entered** from the ad manager, per ad if you can. See [Enter spend](#enter-spend).

Visits and key events per ad are read by the metrics sync (daily, or **Sync now** in **Settings → Products**; see [Analytics](/guides/analytics#sync-schedule)), so they lag the ad manager by up to a day. No AI is used: the numbers and suggestions are worked out by fixed rules, and cost nothing.

## Enter spend

Click **Enter spend** on the **This week** card. Copy the numbers the ad manager reports for a range of days:

| Field | What to enter |
| --- | --- |
| **For** | **The whole campaign**, or one ad (shown as "_group_: ad _n_"). Per ad gives each ad a cost per result; the whole campaign gives the total only. |
| **First day** and **Last day** | The days the spend covers, both included. They start as the last 7 days. The last day can't be after today. |
| **Amount spent** | Required. In your ad account's currency. |
| **Clicks (optional)** and **Impressions (optional)** | With both, the tab shows each ad's click rate, and the suggestions can tell when few people click. |

Spend over several days is spread evenly across them. So if you enter $70 for 14 days, a week of it counts as $35. Clicks and impressions are spread the same way.

Entering weekly is plenty. Don't enter the same days twice for the same ad: entries add up. The **Spend entered** card at the bottom lists every entry with its days, what it's for, amount, clicks and impressions. Delete a wrong one with its trash icon and enter it again.

> [!WARNING]
> **Plan again** replaces every ad in the campaign, and the new ads get new tracking ids. Spend you entered for the old ads is kept, counted for the whole campaign (the spend table shows it as **Whole campaign (or a deleted ad)**), so it's in the totals but not in any one ad's cost. Don't plan a running campaign again; use **Rewrite** on single ads.

Amounts are shown without a currency sign: they're in whatever currency you entered (your ad account's), and Startica doesn't convert them.

## Set a target

The target is what one result (a signup, a trial, a sale) may cost to be worth it. Click **Set a target** (or **Change target**) on the **Per ad** card and enter a cost above zero. Leave it empty to remove it.

- **With a target**, ads well under it get **Scale** and ads well over it get **Stop**.
- **Without one**, Startica compares the ads with each other: the target is the median cost per result of the ads that have results, once at least two do. The card then says "(the median of your ads)".
- **With neither** (fewer than two ads with results and no target), an ad with results gets **Keep**, with a reminder to set a target.

The plan's **Works if** line often names a cost, for example "Cost per signup under $12 by day 21". That's a good target.

## The numbers

### Per ad

The **Per ad** card covers the days from the first day of your first spend entry to today, or the last 30 days if there's no spend yet, and never more than a year. Its description shows the days, where the visits come from, the target, and what a result is (the plan's success metric).

| Column | What it shows |
| --- | --- |
| **Ad** | "_group_: ad _n_", with the ad's first headline below. |
| **Spend** | The spend entered for that ad, in those days. |
| **Clicks** | The clicks entered, or – if you didn't enter any. |
| **Click rate** | Clicks ÷ impressions, when you entered both. |
| **Visits** | Sessions with the ad's `utm_content`, from GA4 or Umami. |
| **Results** | Key events from those visits. |
| **Per visit** | Spend ÷ visits. |
| **Per result** | Spend ÷ results: the number the suggestions judge. |
| **Next** | The suggestion: **Scale**, **Keep**, **Rewrite**, **Stop** or **Too early**. |

The **All ads** row adds them up, including spend entered for the whole campaign ("includes $… entered for the whole campaign"). Whole-campaign spend isn't in any ad's row, so it can't give an ad a cost per result.

### This week

The **This week** card reads out the last 7 days against the 7 before, in a few sentences:

- what was spent, the visits and results, and the cost per result;
- whether the cost per result held steady (within 10%), fell or rose, and from what;
- the best ad by cost per result;
- what to do: every stop, scale and rewrite below;
- how much was entered for the whole campaign, and so isn't in the per-ad costs.

With no spend or visits in the last 7 days, it says "No spend or visits in the last 7 days. Enter spend from the ad manager to see results."

## What to do next

Each ad gets one suggestion, worked out from its numbers over the whole period. The **What to do next** card lists every suggestion except **Too early**, each with its reason, for example "4.21 per result, under the 7.00 target. Raise its budget by 20–30% and watch that the cost holds."

### Enough spend to judge

An ad isn't judged until it has spent enough for the numbers to mean something:

- the target cost per result (yours or the median), if there is one;
- half of the ad's share of the test budget (the plan's test budget ÷ the number of ads ÷ 2);
- 20.

Whichever of these is largest.

Until then it's **Too early**: "Keep _ad_ running: 12.00 spent so far; it needs about 20.00 before the numbers mean much."

### The rules

Once an ad has spent enough, the first rule that applies decides:

| Suggestion | When |
| --- | --- |
| **Stop** | No results after twice the spend needed to judge. |
| **Rewrite** | No results yet, with less than that. |
| **Keep** | Results, but no target to compare with. |
| **Scale** | Cost per result at or under 0.8 times the target. Raise its budget by 20–30% and watch that the cost holds. |
| **Keep** | Cost per result up to 1.2 times the target. |
| **Stop** | Cost per result more than twice the target. |
| **Rewrite** | Cost per result between 1.2 and 2 times the target. |

Two more checks add to the reason:

- **Few clicks.** When you entered clicks and impressions, a click rate under half of a rough industry median counts as low: under 1.5% on Google Ads (median 3%), 0.45% on Meta (0.9%) or 0.2% on Reddit (0.4%). A **Rewrite** then says so, and its guidance asks for a more specific benefit and a headline that stands out.
- **Clicks that never arrive.** When fewer than half of the clicks you entered show up as visits, a **Stop** or **Rewrite** adds "Only _n_% of clicks arrived as visits: check the landing page loads quickly and the link keeps its utm tags."

These are rules of thumb for small tests, not statistics. A handful of results can swing a cost per result a lot, so read the numbers before you act.

### Act on a suggestion

Each suggestion on the card has buttons:

| Button | What it does |
| --- | --- |
| **Rewrite with AI** | Only on **Rewrite**. Queues the AI [rewrite](/ads#ads) of that ad with guidance from the suggestion: for few clicks, "Few people click this ad. Lead with the most specific benefit…"; for visits that don't sign up, "People visit but don't sign up. Make the promise match the landing page exactly…"; for a high cost, "It brings results, but each one costs too much…". The rewrite shows on **Plan and ads**. Then swap the new copy into the ad manager. |
| **Today** | Adds the suggestion to today's list on [Today](/guides/today), as "_suggestion_ in _campaign_", linking back to this tab. "Already on Today" if it's there. |
| **Roadmap** | Adds it to the [Roadmap](/guides/roadmap) as "_suggestion_ (_campaign_)", at the revenue stage with the paid conversion playbook, with the reason and a next step: "Pause the ad in the ad manager" (stop, priority 1), "Raise the ad set's budget by 20–30%" (scale) or "Rewrite the ad in Startica and swap it in". "Already on the Roadmap" if it's there. |

The suggestion is worked out again when you click, so if the numbers changed since the page loaded, you may see "That suggestion has changed: reload the page".

### On Today and the Roadmap

Startica also puts the most pressing ad suggestion on [Today](/guides/today) by itself, with the **Ads** badge: across the product's campaigns marked **Handed off** or **Running**, a stop first, then a scale, then a rewrite. Each time the list is built (or you click **Refresh**), at most one ad move is added, and a suggestion already on today's list isn't added again. Campaigns in **Draft** or **Ended** aren't looked at; set the [status](/ads#statuses) when you launch.

## In the demo

[Demo mode](/guides/demo-mode)'s Reddit campaign, **Reddit: grad student fieldwork**, has a $7 target and two weeks of sample spend, clicks, impressions and GA4 visits for its two ads. The first ad brings signups well under the target and gets **Scale**; the second costs about four times the target and gets **Stop**, which also shows on **Today**. You can enter and delete spend and change the target. **Rewrite with AI** queues a job that just waits, because the AI is off.

## Related

- [Ads](/ads)
- [Creatives](/ads/creatives)
- [Analytics](/guides/analytics)
- [Today](/guides/today)
- [Growth roadmap](/guides/roadmap)
