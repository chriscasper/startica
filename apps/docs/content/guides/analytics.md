---
title: Analytics
description: See traffic, conversions, revenue and what your posted replies and content brought in, compared with the period before, from GA4 or Umami, Stripe, your product database and numbers you enter.
layout: doc
---

The **Analytics** page (**Marketing → Analytics**) shows how your product is doing: traffic, conversions, subscriptions and revenue, and what each reply and piece you posted through Startica brought in. Every number is compared with the period before. Numbers come from your web analytics (GA4 or Umami), Stripe and your product database, plus anything you enter by hand. Startica only reads these sources; it never changes them.

## Data sources

| Source | What Startica reads | Set it up |
| --- | --- | --- |
| Google Analytics 4 (GA4) | Sessions, users, new users, page views, engaged sessions, engagement time and key events per day; splits by source / medium, landing page, page, country, device, browser, key event name and tracking link | [Google Analytics](/credentials/google) |
| Umami | The same as GA4 where Umami has it: visits, visitors, page views, engaged visits, time, sources from the referrer, entry pages, pages, countries, devices, browsers, custom events and visits per tracking link | [Umami](/credentials/umami) |
| Stripe | Active subscriptions, trials, MRR, new subscriptions, cancellations, MRR gained and lost, and revenue paid, per day | [Stripe](/credentials/stripe) |
| Product database | Any daily metrics your view returns, such as signups and active users | [Product database](/credentials/supabase) |
| Manual entry | Any number you type in | On the Analytics page |

You connect these in **Settings → Products → Connections**. Each one is optional. Tiles and cards that need a missing connection say so and link to Settings.

### Web analytics: GA4 or Umami

Traffic numbers come from one web analytics connection per product: GA4 or Umami. Connect either one. When both are connected and working, Startica shows GA4; when only one of them works, it shows that one. The cards name the source, for example "All traffic, from Umami." See [Both GA4 and Umami](/credentials/umami#both-ga4-and-umami).

Below, "visits" means GA4's sessions or Umami's visits, and "key events" means GA4's key events or the Umami custom events you chose as key events.

Umami has no new visitors, and can't split key events or engagement by source or landing page. Where a number needs that, Analytics shows a dash and a note says why.

### GA4

Startica reads your GA4 property with a read-only service account key that you add to the property as a Viewer. Per day, it reads:

- sessions, users, new users, page views, engaged sessions, engagement time and key events;
- sessions, key events and engaged sessions by source / medium, and by landing page;
- sessions by page path, country, device category and browser;
- key events by event name;
- sessions and key events per `utm_content` value (this is how posts are matched; see [Attribution](#attribution)).

Pages, landing pages, countries and browsers keep the top 50 values per day. See [What Startica pulls](/credentials/google#what-startica-pulls).

### Umami

Startica reads your Umami website (Umami Cloud or your own server) with an API key, one day at a time: visits, visitors, page views, engaged visits (visits minus bounces: visits with more than one page view), total time, visits by referrer (search engines as `organic`), entry pages as landing pages, pages, countries, devices (laptops count as desktop), browsers, visits per `utm_content`, custom events per name, and the key events you chose. See [Umami](/credentials/umami#what-startica-reads).

### Stripe

Startica reads all your subscriptions, and the invoices paid, with a restricted key. It rebuilds each day from the subscriptions' start and end dates, so the charts have history from the first sync. Days are UTC days, like Stripe's dashboard.

| Metric | How it's calculated |
| --- | --- |
| `active_subscriptions` | Subscriptions with status active, trialing or past due at the end of each day. Today uses their current status. |
| `trials` | Those subscriptions that were in their trial that day |
| `mrr` | The monthly value of the active subscriptions' recurring prices. Yearly and weekly prices are converted to a monthly amount. Uses each subscription's current price, so upgrades and downgrades show from today. |
| `new_subscriptions` | Subscriptions that started that day |
| `cancellations` | Subscriptions canceled that day: the day the customer canceled (`canceled_at`), which can be before the subscription ends |
| `mrr_new` | MRR of the subscriptions that started that day |
| `mrr_churned` | MRR of the subscriptions that ended that day (`ended_at`) |
| `revenue` | Invoices paid that day (`amount_paid`). Needs read access to invoices on the key. |

Subscriptions that never started (`incomplete` or `incomplete_expired`) are left out. Without read access to invoices, everything else still syncs, and the **Revenue paid** tile says "Needs read access to invoices on the Stripe key". See [Stripe](/credentials/stripe#what-the-key-needs).

> [!NOTE]
> Amounts are always shown in US dollars. Startica doesn't convert currencies. If your Stripe prices are in another currency, read the numbers as that currency.

### Product database

Startica reads a view in your product's Postgres database (Supabase or any other) through a read-only login. **Set up** on the **Product database** card writes a SQL script that creates both; you run it in your SQL editor and paste the connection string. The view must return three columns, one row per day per metric:

```sql
-- startica.daily_metrics (the default view name)
-- day date, metric text, value numeric
select '2026-10-08'::date as day, 'signups' as metric, 4::numeric as value;
```

Startica reads the whole [history](#history) on every sync. Two metric names have their own tiles and charts: `signups` and `active_users`. Every other metric is listed under **Conversions** → **Other product numbers**, summed over the period. All metrics are passed to the roadmap re-plan. See [Product database](/credentials/supabase) for setting up the view and read-only login.

## Tabs and period

The page has five tabs. The address keeps the tab and period, so you can bookmark a view.

| Tab | Address | Shows |
| --- | --- | --- |
| **Overview** | `/analytics` | The main numbers, the weekly AI summary, what changed, the funnel and your manual numbers |
| **Traffic** | `?tab=traffic` | Visits, engagement, channels, sources, landing pages, pages, countries, devices and browsers |
| **Conversions** | `?tab=conversions` | Key events, signups, active users and your other product numbers |
| **Revenue** | `?tab=revenue` | MRR, subscriptions, trials, cancellations and revenue paid, from Stripe |
| **What Startica did** | `?tab=startica` | What your posted replies, Content Studio pieces and ads brought in |

### The period

Pick the period above the tabs' content: **7 days**, **30 days** (the default) or **90 days**, and **6 months**, **12 months** or **16 months** when the product keeps that much [history](#history). The address gets `?range=` with the number of days. The period ends today, and days are your computer's local days (Stripe's are UTC).

The line next to the picker gives the dates, how much history Startica keeps with a **keep more** link to the setting, and, for anything older, to open GA4 or Umami.

### Comparison with the period before

Every number is compared with the period of the same length just before it:

- Counts and amounts show the change as a percentage, such as +12.5%.
- Rates, such as key events per visit, show the change in points, such as +0.4 pts.
- Green is good and red is bad. For cancellations, fewer is green.

When the stored data doesn't cover the whole period before, there's no comparison, and the line says "Not enough older data yet to compare with the period before." That happens on a new connection with a long period, or when the period before is older than the history.

### Tiles

A tile shows the number for the period and its change. Hover a tile's label for how it's counted. A tile with no data shows a dash and why:

- **Needs GA4 or Umami** (or product DB, or Stripe): that connection isn't set up and working for this product yet.
- **No `active_users` metric yet: add it** (or `signups`): the product database is connected, but its view doesn't define that metric. Add a metric with exactly that name in the database's **Change setup** dialog (Settings → Products → Connections → Product database).
- **No data in this period:** connected and defined, but nothing to show yet.

### Charts

Charts show one value per day. When there's a period before to compare with, it's drawn as a dashed line, day for day, and a legend names both lines. Hover a chart to see the exact values for a day. Days with no data are shown as 0.

Click **Show as table** under a chart to see every day's value, and the period before's, as a table.

## Overview

### Overview tiles

| Tile | Source | Shows |
| --- | --- | --- |
| Visits | GA4 or Umami | Total visits in the period |
| Key events | GA4 or Umami | Total key events |
| Key events per visit | GA4 or Umami | Key events divided by visits |
| Signups | Product database | Total of the `signups` metric |
| Active users | Product database | The latest value of `active_users` in the period |
| MRR | Stripe | Monthly recurring revenue at the end of the period |
| Subscriptions | Stripe | Active, trialing and past due, at the end of the period |
| Cancellations | Stripe | Cancellations in the period |

### This week, read by AI

The [weekly AI summary](#weekly-ai-summary): a headline, a short summary, and **Worked**, **Watch** and **Try next**.

### What changed

"The biggest changes against the period before, worked out from the numbers (no AI)." Startica checks these rules and shows up to 5, strongest first. Each has a **Details** link to the tab with the numbers behind it.

| Shown when | Example |
| --- | --- |
| Visits went up or down by 15% or more, and by at least 20 visits | "Visits up 32% on the period before (1,240 vs 940), most of it from Communities (+210)." The channel is named when it moved most, by 10 visits or more. |
| Key events per visit changed by 20% or more (with at least 5 key events) | "Key events per visit rose from 2.1% to 2.9%." |
| A source sent 10 or more visits, and none the period before | "New source: 24 visits from forum.example, which sent none the period before." |
| AI assistants sent 10 or more visits, at least 50% more than before | "AI assistants sent 18 visits (9 the period before), most from *assistant*." |
| A landing page got 50 or more visits, but few stayed engaged | "/pricing: 120 visits landed there, but only 22% stayed engaged." |
| Your best post of the period brought 5 or more visits | "Your reply in r/fieldwork brought 41 visits and 3 key events these 30 days." |
| 2 or more of the period's posts were removed | "2 of your posts these 30 days were removed by moderators or deleted: check those communities' rules." |
| MRR changed by 5% or more | "MRR grew to $1,280 (+$140, +12.3%)." |
| Cancellations at least doubled, to 3 or more | "6 cancellations, up from 2 the period before." |
| Signups changed by 20% or more (with at least 5 the period before) | "Signups up 25% (40 vs 32)." |

A landing page counts as low engagement when its engaged share is under 35% and under 70% of the site's. With no big changes, the card says "No big changes: everything moved less than about 15%."

### From visit to customer

A funnel: **Visits** → **Key events** → **Signups** → **New subscriptions**, with only the steps that have a source connected. Each step shows its count in the period, and what share of the step before it got there. The steps come from different sources (web analytics, the product database and Stripe), so read them as rough rates.

### Charts on Overview

| Chart | Data |
| --- | --- |
| **Visits per day** | All traffic, from GA4 or Umami ("All traffic, from Google Analytics." or "All traffic, from Umami."). |
| **Signups per day** | `signups` from the product database. Without it, this chart shows **Key events per day** from GA4 or Umami instead. |

### Numbers you entered

Your manual numbers, newest first. See [Manual metrics](#manual-metrics).

## Traffic

Needs GA4 or Umami.

| Tile | Shows |
| --- | --- |
| Visits | Total visits |
| Visitors per day | Daily visitors, averaged over the period: someone who comes back on another day counts again |
| New visitors | GA4's new users. Umami doesn't report new visitors. |
| Page views | Total page views |
| Pages per visit | Page views divided by visits |
| Engaged visits | The share of visits that were engaged. GA4: engaged sessions, which lasted 10 seconds or more, had a key event, or viewed 2 or more pages. Umami: visits that viewed more than one page. |
| Time per visit | Engaged time divided by visits |
| Key events per visit | Key events divided by visits |

Below the tiles, the **Visits per day** chart, then these cards:

| Card | Shows |
| --- | --- |
| **Channels** | Visits per channel, with the change, the share of all visits, the engaged share and key events. With Umami, engaged and key events show a dash. |
| **Search and AI assistants** | See [below](#search-and-ai-assistants). |
| **Sources** | The top 25 source / medium pairs, with their channel and key events |
| **Landing pages** | The first page of each visit, with visits, engaged share and key events (GA4) |
| **Pages viewed** | Visits that viewed each page |
| **Countries**, **Devices**, **Browsers** | Visits per country, device (with its share) and browser |

### Channels

Startica groups every source / medium pair into a channel:

| Channel | Includes |
| --- | --- |
| Organic search | The medium `organic`, from any search engine. Umami visits get it when the referrer is a search engine. |
| AI assistants | AI assistants' addresses, such as ChatGPT, Perplexity or Claude (the same list as [SEO & GEO](/seo/search#visits-from-search-and-ai-assistants)), and the medium `ai-assistant` |
| Communities | Startica's reply links (`utm_medium=community`), and Reddit, Hacker News (`news.ycombinator.com`), Lobsters, Product Hunt, Indie Hackers, DEV, Hashnode, Stack Overflow and Stack Exchange, Discord and Discourse |
| Social | X (`x.com`, `t.co`), LinkedIn, Bluesky, Mastodon, Facebook, Instagram, YouTube, Threads, TikTok, Pinterest and Substack, and the medium `social` |
| Email | Startica's email links (`utm_medium=email`), the medium `newsletter`, and webmail sites |
| Paid | Startica's ad links (`utm_medium=paid`), and mediums such as `cpc`, `ppc`, `display` or `paid_social` |
| Referral | Other sites that linked to you (medium `referral`), and Content Studio pieces (`utm_medium=content`) on a channel that isn't a community or social site, such as a blog |
| Direct | No source: typed or bookmarked addresses, and Umami visits without a referrer |
| Other | Anything else |

With Umami, the source is the referrer's domain, such as `news.ycombinator.com / referral`. With GA4, visits through Startica's tracking links show as, for example, `reddit / community`, or `other / email` for an email campaign. Visits from [ads](/ads#results-in-analytics) show as `google / paid`, `meta / paid` or `reddit / paid`.

### Search and AI assistants

"Visits from search results and from AI assistants that linked to the site."

| Part | Shows |
| --- | --- |
| **Organic search** | Visits in the Organic search channel, with the change |
| **AI assistants** | Visits from AI assistants' links, with the change. With Umami, only the referrer counts: a visit tagged only `utm_source=chatgpt.com` with no referrer is direct. |
| The top assistants | Visits per assistant, up to 6, or "No visits from AI assistants yet." |

**Search details** opens [SEO & GEO → Search](/seo/search), which has the top search engines, and clicks and queries from Search Console and Bing. Visits from Google's AI Overviews and AI Mode arrive as organic search from `google`, not as AI assistants. See [Visits from search and AI assistants](/seo/search#visits-from-search-and-ai-assistants).

## Conversions

| Tile | Source | Shows |
| --- | --- | --- |
| Key events | GA4 or Umami | Total key events |
| Key events per visit | GA4 or Umami | Key events divided by visits |
| Signups | Product database | Total of `signups` |
| Signups per visit | Product database and GA4 or Umami | Signups divided by visits |

| Card | Shows |
| --- | --- |
| **Key events per day** | Chart of the events you marked as key events |
| **Signups per day** | Chart of `signups` from the product database |
| **Key events by name** | Every key event, so you can tell signups from other goals |
| **Converting channels** | Key events per channel, with visits and key events per visit. GA4 only: Umami can't split key events by source. Visits through Startica's tracking links still show key events, under **What Startica did**. |
| **Converting landing pages** | Landing pages by the key events of the visits that started there. GA4 only. |
| **Active users** | Chart of `active_users` from the product database: the latest value each day |
| **Other product numbers** | Every other metric your product database view returns, summed over the period, with the change |

## Revenue

Needs Stripe.

| Tile | Shows |
| --- | --- |
| MRR | Monthly recurring revenue at the end of the period |
| Paying subscriptions | Active and past due subscriptions at the end of the period, not counting trials |
| Trials | Subscriptions in their trial at the end of the period |
| Revenue per customer | MRR divided by paying subscriptions |
| New subscriptions | Subscriptions that started in the period |
| Cancellations | Cancellations in the period |
| Cancellation rate | Cancellations in the period divided by subscriptions at its start |
| Revenue paid | Invoices paid in the period. Needs read access to invoices on the Stripe key. |

**MRR movement** shows **New** (MRR of subscriptions that started in the period), **Lost** (MRR of ones that ended) and **Net**. Upgrades and downgrades aren't split out: they change MRR from the day Startica sees them.

The charts are **MRR** and **Subscriptions** (at the end of each day), **New subscriptions per day** and **Cancellations per day** (by the day the customer canceled, which can be before the subscription ends).

## What Startica did

| Tile | Shows |
| --- | --- |
| Posted | Inbox replies and Content Studio pieces marked as posted in this period |
| Linking the product | Those that link to the product |
| Visits from posts | Visits through those posts' tracking links, since they were posted. Needs GA4 or Umami. |
| Key events from posts | Key events from those visits |

### Where it worked

One row per community or channel you posted in during the period:

| Column | Meaning |
| --- | --- |
| Where | The subreddit, community or channel. A badge shows how many posts there were removed. |
| Posts | How many you posted, and how many of them linked the product when not all did |
| Replies | Replies people wrote back, from the latest check |
| Visits | Visits through the posts' tracking links |
| Key events | Key events from those visits |
| Visits per linked post | Visits divided by the posts that linked the product |

### Ads

Shown when you entered spend for an [ad campaign](/ads) in the period: each campaign's **Spend**, **Visits** and **Key events** through its links, and **Cost per key event**. The campaign name opens its [Results](/ads/results) tab, which has the numbers per ad.

### Posted by Startica

The Inbox replies and Content Studio pieces you posted (with **Post…** or **Mark as posted**) in the period, newest first, up to 100:

| Column | Meaning |
| --- | --- |
| Posted | The date you marked it posted. |
| Where | The subreddit, community or channel, linked to the post if you gave a link. |
| Post | The text. Badges show **Content** (a Content Studio piece), **Removed** (removed by moderators or deleted) and **Links product** (it carries a tracking link). |
| Replies | Replies on the post, from the latest check. |
| Visits | Sessions (GA4) or visits (Umami) that arrived through its tracking link. |
| Key events | Key events from those sessions. With Umami, only for the key events you listed, by first-click attribution. |

Replies are checked every 6 hours for two weeks after posting, for Reddit, Hacker News, Bluesky, Mastodon and Discourse links, and for X links if you've added an [X API token](/credentials/x-api). LinkedIn, Facebook and other links aren't checked. Visits and key events need GA4 or Umami; without either, those columns show a dash. Only posts that link to the product can bring tracked visits.

## Weekly AI summary

Every Monday at 08:45, after the morning sync, the AI reads the last 7 full days (ending yesterday) against the 7 days before, with the last 30 days for context, and writes:

| Part | What it is |
| --- | --- |
| Headline | One sentence: the most important thing about the week |
| Summary | Two to four sentences on how the week went and why |
| **Worked** | Up to 3 things that worked, each with its number |
| **Watch** | Up to 3 things to watch |
| **Try next** | 1 to 3 concrete things to do this week, each with why |

It shows on **Overview** under **This week, read by AI**, with the dates, when it was written and by which model. Earlier summaries are listed under **Earlier weeks**. The first **Try next** item also appears on [Today](/guides/today) as an **Analytics** move for 7 days after the summary was written.

- **Write it now** (or **Write again**) on the card writes one on request.
- The Monday run only covers products with a working GA4, Umami, Stripe or product database connection, needs an AI key, and skips a week that already has a summary.
- If a run fails, the card shows the error and keeps the last good summary.

The AI only gets the numbers on this page: no page content and no credentials. It's told to use only those numbers, and to say when they're too small to read much into. It uses the `draft` model task (Claude Sonnet or GPT-6.1 Sol by default), with the prompt version `analytics-summary@1`, counts toward the [monthly AI budget](/concepts/costs#the-monthly-budget), and is logged like every AI call. See [AI models](/concepts/ai). Check anything surprising against the numbers.

## Manual metrics

Use manual entry for anything Startica can't read, such as waitlist signups or newsletter subscribers.

1. On **Overview**, in the **Numbers you entered** card, click **Add a number**.
2. In **Record a number**, enter a **Date**, a **Metric** name (for example `waitlist_signups`) and a **Value**.
3. Save.

Metric names are stored in lowercase with underscores, so "Waitlist Signups" becomes `waitlist_signups`. Entering the same metric for the same date again replaces the earlier value. Delete a row with its trash icon.

Manual numbers are listed in the table but not charted. The roadmap re-plan reads them along with your other metrics. They're never dropped when the history is shortened.

## History

Startica keeps 90 days of history per product by default. To keep more, choose **6 months**, **12 months** or **16 months** under **Keep analytics history for** in **Settings → Products**, on the **Connections** card. The **keep more** link next to the period picker opens it.

| Change | What happens |
| --- | --- |
| Longer | A sync starts and reads the older days. 16 months of Umami can take about half an hour. |
| Shorter | The next sync drops synced days older than the new history. |

Numbers you entered by hand are never dropped. For anything older than the history, open GA4 or Umami directly.

## Sync schedule

| When | What happens |
| --- | --- |
| When you connect | Startica syncs that connection right away, which also tests it. |
| Every day at 08:15 | Startica syncs every connection, in your computer's local time. |
| **Sync now** | In Settings, under the connections, syncs all of the product's connections. |
| A longer history | Syncs the product's connections to read the older days. |

What each sync reads:

| Source | First sync | Later syncs |
| --- | --- | --- |
| GA4, Umami | The whole history | The last 5 days, which GA4 and Umami may still correct |
| Stripe, product database | The whole history | The whole history again |

GA4 and Umami read the whole history again after you replace the connection or choose a longer history. Each sync overwrites what was stored for the days it reads, so late-arriving data gets corrected. Search Console and Bing, which also sync here, work differently: see [How syncing works](/seo/search#how-syncing-works).

Scheduled syncs only run while Startica is open. If the app is closed at 08:15, that day's scheduled sync is skipped; click **Sync now**. See [Background jobs](/guides/background).

Each connection in **Settings → Products → Connections** shows when it last synced. If a sync fails, the connection shows the error and the other connections still sync.

### Lag

Expect Analytics to trail reality by up to a day, since it syncs once a day. GA4 itself can also take time to process recent data, so today's and yesterday's numbers may change on later syncs.

## Attribution

Startica tags every product link it writes, in Inbox replies and in Content Studio pieces, with UTM parameters. GA4 and Umami record them with each visit, and Startica matches the visits back to the exact reply or piece.

| Parameter | Value |
| --- | --- |
| `utm_source` | The channel, such as `reddit`, `hackernews` or `bluesky`. Content Studio pieces use their channel too, including `blog`, `newsletter` and `email`. |
| `utm_medium` | `community` for Inbox replies, `content` for Content Studio pieces, or `email` for Email and Newsletter pieces ([email campaigns](/guides/content-studio#email-campaigns)) |
| `utm_campaign` | Where it was posted plus the date, for example `r-fieldwork-2026-10-09` |
| `utm_content` | A unique id for that reply or piece version |

For example, a reply in r/fieldwork that mentions Fieldnote links to:

```text
https://fieldnote.example/?utm_source=reddit&utm_medium=community&utm_campaign=r-fieldwork-2026-10-09&utm_content=3f2c9a1e-...
```

[Ads](/ads#tracking-links) are tagged the same way, with `utm_medium=paid` and the ad's id in `utm_content`. Their totals per campaign are under **What Startica did** → **Ads**, and the numbers per ad on each campaign's [Results](/ads/results) tab.

The match uses `utm_content`. Keep the link exactly as written when you post. If you edit the link or remove the query string, visits can't be attributed.

> [!TIP]
> Mark your GA4 signup or purchase event as a key event, or list it under **Key events** on the Umami connection. Then the **Key events** column tells you which posts led to signups, not just visits.

## How Startica uses these numbers

Besides this page, your metrics feed:

- the weekly [roadmap](/guides/roadmap) re-plan, which reads 30-day totals for counts, the latest value for levels such as MRR, subscriptions, trials and active users, and the latest weekly summary;
- the [weekly AI summary](#weekly-ai-summary) and its move on [Today](/guides/today);
- each posted piece's results in [Content Studio](/guides/content-studio).

## Related

- [Google Analytics](/credentials/google)
- [Umami](/credentials/umami)
- [Search performance](/seo/search)
- [Stripe credentials](/credentials/stripe)
- [Product database (Supabase or Postgres)](/credentials/supabase)
- [Privacy and security](/concepts/privacy-security)
