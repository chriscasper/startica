---
title: Search performance
description: "The Search screen in SEO & GEO: clicks, impressions, click-through rate and position from Google Search Console and Bing, the query flags, and visits from search and AI assistants."
layout: doc
---

**Search** is the second part of [SEO & GEO](/seo). It shows what people search for when they find your site: how often the site appeared in results (impressions), how often people clicked, and where it ranked, for every query and page. It reads [Google Search Console](/credentials/search-console) and, optionally, [Bing Webmaster Tools](/credentials/bing-webmaster), and adds visits from search engines and AI assistants from [Google Analytics](/credentials/google).

This page explains every part of the screen, what each number means, the rules behind the flags, how syncing works and what the data can't tell you. To connect the sources, see [Google Search Console](/credentials/search-console) and [Bing Webmaster Tools](/credentials/bing-webmaster). Both are free.

## Find it

Open **SEO & GEO → Search** in the left sidebar. Like the rest of Startica, it shows the product picked in the product switcher in the header.

Until Search Console or Bing is connected for the product, the screen shows "Connect Google Search Console" with a link to **Settings → Products → Connections**. While the first sync runs, it says "Reading Search Console: the first sync fetches 16 months and can take a minute." If the last sync failed, the line under the range buttons says "Last sync failed:" and the error. See [Troubleshooting](/credentials/search-console#troubleshooting).

The SEO & GEO **Overview** also has a **Clicks from Google, 28 days** card. See [Overview card](#overview-card).

## Google or Bing

When both Search Console and Bing are connected, a switch at the top picks **Google** or **Bing and Copilot**. With only one connected, the screen shows that one and there's no switch. The two are never added together: Google and Bing report differently, so each has its own view. See [The Bing view](#the-bing-view).

## Ranges and comparison

The range buttons pick **7 days**, **28 days** (the default), **90 days** or **12 months**. Next to them, the screen says which days it shows, for example "2026-09-14 to 2026-10-11, compared with the 28 days before."

- **The range ends at the newest day with data**, not at today. Search engines report with a delay, so ending at today would make the last days look empty.
- **The comparison** is the same number of days right before the range. Each tile and each query's and page's clicks show the change against it. On **12 months**, the line says "compared with the 12 months before".
- **Only against a complete earlier period.** Startica compares only when the stored data covers the whole earlier period. Otherwise the line says "(not enough older data to compare)" and no change figures appear. Search Console keeps 16 months, so **12 months** usually has nothing to compare with, and right after you connect, longer ranges may not either.
- **Recent days can still change.** Startica reads Google's freshest data, which Google calls preliminary and revises for a few days. Each sync re-reads the last 5 days, so the numbers settle on their own.

## The tiles

| Tile | What it means |
| --- | --- |
| **Clicks** | How many times someone clicked through to your site from a search result. |
| **Impressions** | How many times a link to your site appeared in someone's results. A result counts when it's on the page that was shown, even if the person didn't scroll to it. |
| **Click-through rate** | Clicks divided by impressions. |
| **Average position** | The site's average place in results, where 1 is the top result. Lower is better. It's weighted by impressions: a day with 1,000 impressions counts ten times as much as a day with 100. Rows without a position (which Bing sometimes reports) are left out of the average, though their clicks and impressions still count. |

Clicks, impressions and click-through rate show the change in percent. Average position shows the change in places, for example "-1.2"; going down is shown as an improvement, in green. A change under 0.5% (or under 0.05 places) says "no change".

## The chart

**Clicks from Google** (or **from Bing**) shows clicks per day across the range. Hover it to see a day's value.

## Queries

**Queries** lists what people searched for when your site appeared, sorted by clicks, then impressions. For each query: **Clicks** (with the change against the earlier period), **Impressions**, **CTR** and **Position**, all over the selected range. The list shows up to 100 queries for the selected filter, picked from the 500 with the most clicks. Changes show only when the earlier period [can be compared](#ranges-and-comparison).

### Filters

| Filter | Shows |
| --- | --- |
| **All** | Every query. |
| **Non-brand** | Queries that don't mention the product. These are people finding you without knowing your name. |
| **Brand** | Queries that mention the product. They have a **Brand** badge. |
| **Striking distance** | Queries with the **Striking distance** flag. |
| **Low click-through** | Queries with the **Low click-through** flag. |

### Brand and non-brand

A query counts as brand when it contains one of these terms:

- the product's name, as entered in **Settings → Products**;
- the first part of the product's website address, without `www.`. For `https://fieldnote.example`, that's `fieldnote`.

The term has to appear as whole words, written with or without spaces between them. Upper and lower case, punctuation and anything other than the letters a to z and digits don't matter. For Fieldnote:

| Query | Brand? |
| --- | --- |
| `fieldnote` | Yes |
| `field note app` | Yes: "field" and "note" together make "fieldnote" |
| `Field-Note pricing` | Yes |
| `field notes app` | No: "field notes" isn't "fieldnote" |
| `fieldnotes` | No: not the same word |

Terms shorter than 3 characters are ignored. You can't add other brand terms yet.

### Striking distance

**Striking distance** marks a query that ranks on the first or second page of results but not near the top, and is searched for often enough to matter. A better page or a better title could move it up, and on the first page a few places bring many more clicks. A query is flagged when, over the selected range:

- its average position is between 4.5 and 20 (the tooltip says "about 5 to 20"), and
- it has at least 3 impressions a day on average, with a minimum of 20: at least the larger of 20 and 3 × the number of days in the range.

| Range | Impressions needed |
| --- | --- |
| 7 days | 21 |
| 28 days | 84 |
| 90 days | 270 |
| 12 months | 1,095 |

### Low click-through

**Low click-through** marks a query on the first page whose click-through rate is far below what that position usually gets. The title and description people see in results may not match what they want. A query is flagged when, over the selected range:

- its average position is 10 or better,
- it has at least twice the impressions striking distance needs (42 for 7 days, 168 for 28 days, 540 for 90 days, 2,190 for 12 months), and
- its click-through rate is under half of the rough rate Startica expects for that position:

| Average position | Expected click-through rate | Flagged below |
| --- | --- | --- |
| under 1.5 | 25% | 12.5% |
| 1.5 to under 2.5 | 14% | 7% |
| 2.5 to under 3.5 | 9% | 4.5% |
| 3.5 to under 5.5 | 6% | 3% |
| 5.5 to 10 | 3% | 1.5% |

These expected rates are a rough guide for a plain result, used only to point out titles and descriptions worth a second look. Real rates vary a lot by query and by what else is on the results page (ads, images, AI answers). A query can have both flags.

Hover a flag on the screen to see what it means.

[Opportunities](/seo/opportunities#search-opportunities) turns these flags into things to do, over the latest 28 days: non-brand queries in striking distance, with the clicks they'd get near the top, and pages with low click-through, with a title and description the AI can draft. It also lists pages that lost clicks.

### Hidden queries

Google leaves rare queries out of the query list to protect searchers' privacy: those that few people searched for over a few months. Their clicks and impressions still count in the tiles and the chart. When all the query rows Startica stored for the range add up to fewer clicks than the site's total, the **Queries** card says so, for example: "Google hides rare queries for privacy, so 120 of the 1,040 clicks aren't listed under any query." The count uses every stored query, not only those listed on screen. The note is only in the Google view.

On a small site, hidden queries can be a large share of clicks. That's normal.

## Pages

**Pages** lists up to 50 pages people landed on from search, with the same columns as **Queries**. Each page links to the live page. Pages get the same **Striking distance** and **Low click-through** flags as queries, with the same rules, but no brand badge.

## Countries and devices

Google view only. Clicks by country (top 8, as three-letter country codes such as `USA` and `GBR`) and by device (desktop, mobile, tablet), each with a bar for its share of the range's clicks.

## Sitemaps

Google view only. The sitemaps submitted in Search Console, as Search Console last read them, with the date Startica checked. For each: its address, how many pages it lists, when Google last read it (or "waiting for Google to read it", or "not read yet"), and any errors and warnings. Errors are shown in red.

With none submitted, the card says "No sitemap submitted. Submit one in Search Console → Sitemaps so Google finds every page." To check what your sitemap contains, see [Site health](/seo/site-health).

## Visits from search and AI assistants

This card comes from your web analytics, not from Search Console or Bing, and needs [GA4](/credentials/google) or [Umami](/credentials/umami) connected. Its description names the source: "From Google Analytics: …" or "From Umami: …". When both are connected and working, it uses GA4. It counts sessions (Umami: visits) on your site over the same days as the selected range:

| Column | What it counts |
| --- | --- |
| **Organic search** | Sessions with the medium `organic`: visits from a search engine's results. GA4 sets the medium itself; for Umami, Startica gives it to visits whose referrer is a search engine. Below the total, the top 5 sources, such as `google`, `bing` or `duckduckgo`. |
| **AI assistants** | Sessions that came from an AI assistant's link, with a line per assistant. |

A session counts as an AI assistant visit when either:

- **its source is a known assistant's address**. The card says when the list was last checked (2026-10-12):

  | Assistant | Sources |
  | --- | --- |
  | ChatGPT | `chatgpt.com`, `chat.openai.com` |
  | Perplexity | `perplexity.ai`, `www.perplexity.ai` |
  | Claude | `claude.ai` |
  | Gemini | `gemini.google.com`, `bard.google.com` |
  | Copilot | `copilot.microsoft.com`, `edgeservices.bing.com` |
  | Meta AI | `meta.ai`, `www.meta.ai` |
  | Grok | `grok.com` |
  | DeepSeek | `chat.deepseek.com`, `deepseek.com` |
  | Mistral Le Chat | `chat.mistral.ai` |
  | You.com | `you.com` |

- **GA4 gave it the medium `ai-assistant`** (GA4 only). Since May 2026, GA4 has an **AI Assistant** channel that tags visits from the assistants it knows this way. Such a visit from an assistant not in the list above shows under its source.

The address list covers visits from before GA4's channel, and assistants GA4 doesn't know. A visit counts once, as AI, even if its medium is something else.

Umami has no `ai-assistant` medium, so with Umami only the referrer's address counts. A visit that only carries `utm_source=chatgpt.com`, with no referrer, counts as direct, not as AI.

Things to know:

- **Google's AI Overviews and AI Mode are organic.** Visits from links in Google's AI answers arrive from `google` as organic search, so they're in **Organic search**, not **AI assistants**. Bing's Copilot in search results usually arrives as `bing` organic too.
- **Only visits with a link count.** An assistant that mentions your product without a link, or a person who reads an answer and then types your address, isn't counted here. [AI visibility](/seo/ai-visibility) checks the answers themselves.
- **Analytics history is 90 days by default.** The first GA4 or Umami sync reads the product's whole [analytics history](/guides/analytics#history), so a 12-month range only covers more than 90 days once you choose a longer history under **Keep analytics history for** in **Settings → Products**.

The [Analytics](/guides/analytics#search-and-ai-assistants) page shows the same counts on its **Traffic** tab, for the period you pick there.

## The Bing view

With Bing connected, pick **Bing and Copilot**. It works like the Google view, with these differences:

- **Bing and Copilot together.** Bing reports clicks and impressions from Bing search and Copilot as one number and doesn't split them. The screen says: "Bing combines Bing search and Copilot. Daily totals update every day; queries and pages are weekly, so short ranges may show none."
- **Daily totals, weekly queries and pages.** The tiles and chart use Bing's daily totals. Bing updates its query and page lists once a week, with one row per week, so the **7 days** range may show no queries or pages.
- **No average position for the site.** Bing's daily totals don't include a position, so the **Average position** tile shows a dash. Queries and pages have positions. When Bing has no position for a week, that week is left out of the query's average position (its clicks and impressions still count), and a query with no known position at all shows a dash.
- **No hidden-queries note.** Bing's query rows are weekly and its totals daily, so the two don't add up and the screen doesn't compare them.
- **No countries, devices or sitemaps.** Those cards are only in the Google view.

The flags and brand rule are the same as for Google.

## Overview card

The SEO & GEO **Overview** has a **Clicks from Google, 28 days** card, next to **Site health**, **Problems to fix** and **AI search access**. It shows clicks over the latest 28 days of Search Console data, and below it the impressions, the average position and the change in clicks against the 28 days before, for example "3,120 impressions · position 7.4 · +12% clicks". The change only shows when the stored data covers those earlier 28 days. Click it to open **Search**.

When Search Console is connected but the first sync hasn't finished, it shows a dash and "Search Console is connected; numbers appear after the first sync." Without a Search Console connection it shows a dash and **Connect Search Console**. Both open **Search**. The card uses Google data only, and it's on the Overview only once the product has a site.

## How syncing works

Search data syncs as part of the daily metrics sync (`metrics_sync`), together with GA4, Umami, Stripe and the product database. There's no separate job.

| When | What happens |
| --- | --- |
| When you save the connection | Startica first checks that the key can read the property or site, and shows any problem in the dialog without saving. Then it saves and syncs right away. The card shows **Checking…**, then **Connected** or **Error**. |
| The first sync | Search Console: the last 16 months, everything Google keeps, read a month at a time, newest month first. Bing: everything Bing returns, up to 16 months. This can take a minute. |
| Every day at 08:15 | Each later sync reads from the newest stored day, or from 5 days ago if that's earlier. Google revises recent days, so they're read again and overwritten. For Bing, rows from 14 days before that are kept, because Bing's weekly rows change for a while. |
| **Sync now** | In **Settings → Products → Connections**, syncs all of the product's connections. |

Scheduled syncs only run while Startica is open. If it's closed at 08:15, that day's sync is skipped; the next sync catches up, since it starts from the newest stored day. See [Running in the background](/guides/background).

Search Console's own data is about two to three days behind for final numbers. Startica asks for the freshest data Google has, so the last day or two are often there but partial.

## What Startica reads

From Search Console, for each day: totals for the site, and clicks, impressions and position for each query, page, country and device. Each is stored on its own: you can see a query's clicks or a page's clicks, but not which pages a query led to. Only web search results are read, not Google Images, Video, News or Discover.

Startica reads in windows of up to 31 days, newest first, 25,000 rows at a time. To keep a very large site from stalling the app, it reads at most 200,000 rows per breakdown (query, page, country, device) for each window. Google also only exports the top rows for a site: about 50,000 per day. So on very large sites, the long tail of queries and pages can be incomplete; the site totals are always complete, and the newest days are never the ones cut.

From Bing: daily clicks and impressions, and weekly clicks, impressions and position for top queries and pages.

All of it is stored in Startica's local database on your computer. See [Privacy and security](/concepts/privacy-security#what-goes-over-the-network).

## Limits

| Not available | Why |
| --- | --- |
| Google AI Overviews and AI Mode separately | Google counts searches in AI Overviews and AI Mode in the normal web totals. Search Console's **Generative AI performance** report has them on their own, but it has no API, so Startica can't read it. The screen says: "Google counts searches in AI Overviews and AI Mode in these numbers; its API doesn't report them separately." |
| Bing search and Copilot separately | Bing reports them together. |
| Citations in Copilot and Bing's AI answers | Bing's **AI Performance** report has no API. |
| Bing queries and pages day by day | Bing updates them weekly. |
| Bing countries, devices and sitemaps | Startica doesn't read them from Bing. |
| Which pages a query led to | Queries and pages are stored separately. |
| Rankings for queries you don't appear for | Search Console and Bing only report searches where your site was shown. |
| More than 16 months | Search Console keeps 16 months. |

Whether AI assistants mention and recommend your product, with or without a link, is what [AI visibility](/seo/ai-visibility) measures.

## In the demo

In [demo mode](/guides/demo-mode), Search shows 90 days of sample Search Console data for `fieldnote.example` (property `sc-domain:fieldnote.example`, using the GA4 key): growing clicks, two brand queries (`fieldnote` and `fieldnote app`), queries and pages in striking distance, a query and a page with low click-through, hidden queries, five countries, three devices and one sitemap. **Visits from search and AI assistants** shows sample GA4 visits from Google and Bing organic search, and from ChatGPT, Perplexity and Claude. There's no Bing data in the demo, and nothing syncs.

The demo has 90 days of search data and 90 days of GA4 data, so **12 months** shows 90 days, and **90 days** and **12 months** say "(not enough older data to compare)". **7 days** and **28 days** have comparisons.

## Related

- [Google Search Console](/credentials/search-console): connect Search Console
- [Bing Webmaster Tools](/credentials/bing-webmaster): connect Bing
- [SEO & GEO](/seo)
- [Site health](/seo/site-health)
- [AI visibility](/seo/ai-visibility)
- [Opportunities](/seo/opportunities): what to do about the flagged queries and pages
- [Analytics](/guides/analytics)
