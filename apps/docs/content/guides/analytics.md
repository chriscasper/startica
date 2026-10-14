---
title: Analytics
description: See traffic, signups, subscriptions and what your posted replies and content brought in, from GA4 or Umami, Stripe, your product database and numbers you enter.
layout: doc
---

The **Analytics** page shows the last 30 days for your product: traffic, signups, subscriptions and revenue, and what each reply and piece you posted through Startica brought in. Numbers come from your web analytics (GA4 or Umami), Stripe and your product database, plus anything you enter by hand. Startica only reads these sources; it never changes them.

## Data sources

| Source | What Startica reads | Set it up |
| --- | --- | --- |
| Google Analytics 4 (GA4) | Sessions, users, key events, traffic sources, key events by event name, and visits per tracking link | [Google Analytics](/credentials/google) |
| Umami | The same as GA4: visits, visitors, custom events, sources from the referrer, and visits per tracking link | [Umami](/credentials/umami) |
| Stripe | Active subscriptions, MRR, new subscriptions and cancellations per day | [Stripe](/credentials/stripe) |
| Product database | Any daily metrics your view returns, such as signups | [Product database](/credentials/supabase) |
| Manual entry | Any number you type in | On the Analytics page |

You connect these in **Settings**. Each one is optional. Sections that need a missing connection say so and link to Settings.

### Web analytics: GA4 or Umami

Traffic numbers come from one web analytics connection per product: GA4 or Umami. Connect either one. When both are connected and working, Startica shows GA4; when only one of them works, it shows that one. The cards name the source, for example "All traffic, from Umami." See [Both GA4 and Umami](/credentials/umami#both-ga4-and-umami).

Below, "sessions" and "key events" mean GA4's sessions and key events, or Umami's visits and the custom events you chose as key events.

### GA4

Startica reads your GA4 property with a read-only service account key that you add to the property as a Viewer. It pulls the last 30 days of:

- `sessions`, `users` and `key_events` per day;
- sessions by source / medium;
- sessions and key events per `utm_content` value (this is how posts are matched; see [Attribution](#attribution));
- key events per event name.

### Umami

Startica reads your Umami website (Umami Cloud or your own server) with an API key. It pulls the same last 30 days, one day at a time: visits (as sessions), visitors (as users), visits by referrer (search engines as `organic`), visits per page and per `utm_content`, custom events per name, and the key events you chose. See [Umami](/credentials/umami#what-startica-reads).

### Stripe

Startica reads all your subscriptions with a restricted key and works out:

| Metric | How it's calculated |
| --- | --- |
| `active_subscriptions` | Subscriptions with status active, trialing or past due, as of today. |
| `mrr` | The monthly value of those subscriptions' recurring prices. Yearly and weekly prices are converted to a monthly amount. |
| `new_subscriptions` | Subscriptions created, per day, last 30 days. |
| `cancellations` | Subscriptions canceled, per day, last 30 days. |

Active subscriptions and MRR are recorded for the day of each sync, so their history builds up one day at a time from when you connect.

> [!NOTE]
> The **MRR** tile always shows US dollars. Startica doesn't convert currencies. If your Stripe prices are in another currency, read the number as that currency.

### Product database

Startica reads a view in your product's Postgres database (Supabase or any other) through a read-only login. **Set up** on the **Product database** card writes a SQL script that creates both; you run it in your SQL editor and paste the connection string. The view must return three columns, one row per day per metric:

```sql
-- startica.daily_metrics (the default view name)
-- day date, metric text, value numeric
select '2026-10-08'::date as day, 'signups' as metric, 4::numeric as value;
```

Startica reads the last 30 days. Two metric names have a place on the page: `signups` and `active_users`. All metrics are stored and passed to the roadmap re-plan. See [Product database](/credentials/supabase) for setting up the view and read-only login.

## What the page shows

### Tiles

| Tile | Source | Shows |
| --- | --- | --- |
| Sessions (30d) | GA4 or Umami | Total sessions (Umami: visits) |
| Key events (30d) | GA4 or Umami | Total key events |
| Signups (30d) | Product database | Total of the `signups` metric |
| Active users | Product database | Latest value of `active_users` |
| Subscriptions | Stripe | Latest active subscriptions |
| MRR | Stripe | Latest monthly recurring revenue |

A tile with no data shows a dash and why:

- **Needs GA4 or Umami** (or product DB, or Stripe): that connection isn't set up and working for this product yet.
- **No `active_users` metric yet: add it** (or `signups`): the product database is connected, but its view doesn't define that metric. Add a metric with exactly that name in the database's **Change setup** dialog (Settings → Products → Connections → Product database).
- **No data in the last 30 days:** connected and defined, but nothing to show yet.

### Charts

| Chart | Data |
| --- | --- |
| **Sessions per day** | All traffic, from GA4 or Umami ("All traffic, from Google Analytics." or "All traffic, from Umami."). |
| **Signups per day** | `signups` from the product database. Without it, this chart shows **Key events per day** from GA4 or Umami instead. |

Hover a chart to see the exact value for a day. Days are your computer's local days. Days with no data are shown as 0.

Click **Show as table** under a chart to see every day's value as a table.

### Search and AI assistants

Shown once GA4 or Umami has traffic-source data for the last 30 days. "Sessions from search engines' results and from AI assistants that linked to the site, last 30 days."

| Part | Shows |
| --- | --- |
| **Organic search** | Sessions with the medium `organic`, from any search engine. Umami visits get it when the referrer is a search engine. |
| **AI assistants** | Sessions from AI assistants' links, such as ChatGPT, Perplexity or Claude: sources on Startica's list of assistant addresses, and sessions GA4 tagged with the medium `ai-assistant` (GA4 only). With Umami, only the referrer counts: a visit tagged only `utm_source=chatgpt.com` with no referrer is direct. |
| The top 4 assistants | Sessions per assistant, or "No visits from AI assistants yet." |

**Search details** opens [SEO & GEO → Search](/seo/search), which has the same counts for any range, the top search engines, and clicks and queries from Search Console and Bing. Visits from Google's AI Overviews and AI Mode arrive as organic search from `google`, not as AI assistants. See [Visits from search and AI assistants](/seo/search#visits-from-search-and-ai-assistants).

### Posted by Startica

A table of the latest 50 Inbox replies and Content Studio pieces you posted (with **Post…** or **Mark as posted**), newest first:

| Column | Meaning |
| --- | --- |
| Posted | The date you marked it posted. |
| Where | The subreddit, community or channel, linked to the post if you gave a link. |
| Post | The text. Badges show **Content** (a Content Studio piece), **Removed** (removed by moderators or deleted) and **Links product** (it carries a tracking link). |
| Replies | Replies on the post, from the latest check. |
| Visits | Sessions (GA4) or visits (Umami) that arrived through its tracking link. |
| Key events | Key events from those sessions. With Umami, only for the key events you listed, by first-click attribution. |

Replies are checked every 6 hours for two weeks after posting, for Reddit, Hacker News, Bluesky, Mastodon and Discourse links, and for X links if you've added an [X API token](/credentials/x-api). LinkedIn, Facebook and other links aren't checked. Visits and key events need GA4 or Umami; without either, those columns show a dash. Only posts that link to the product can bring tracked visits.

### Top traffic sources

The top 10 source / medium pairs by sessions over the last 30 days, from GA4 or Umami. With Umami, the source is the referrer's domain, such as `news.ycombinator.com / referral`. With GA4, visits through Startica's tracking links show as, for example, `reddit / community`, or `other / email` for an email campaign. Visits from [ads](/ads#results-in-analytics) show as `google / paid`, `meta / paid` or `reddit / paid`.

### Numbers you entered

Your manual numbers, newest first. See [Manual metrics](#manual-metrics).

## Manual metrics

Use manual entry for anything Startica can't read, such as waitlist signups or newsletter subscribers.

1. In the **Numbers you entered** card, click **Add a number**.
2. In **Record a number**, enter a **Date**, a **Metric** name (for example `waitlist_signups`) and a **Value**.
3. Save.

Metric names are stored in lowercase with underscores, so "Waitlist Signups" becomes `waitlist_signups`. Entering the same metric for the same date again replaces the earlier value. Delete a row with its trash icon.

Manual numbers are listed in the table but not charted. The roadmap re-plan reads them along with your other metrics.

## Sync schedule

| When | What happens |
| --- | --- |
| When you connect | Startica syncs that connection right away, which also tests it. |
| Every day at 08:15 | Startica syncs every connection, in your computer's local time. |
| **Sync now** | In Settings, under the connections, syncs all of the product's connections. |

Each sync re-reads the full last 30 days and overwrites what was stored, so late-arriving data gets corrected. Search Console and Bing, which also sync here, work differently: see [How syncing works](/seo/search#how-syncing-works).

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

[Ads](/ads#tracking-links) are tagged the same way, with `utm_medium=paid` and the ad's id in `utm_content`. Their visits and key events per ad are shown on each campaign's [Results](/ads/results) tab, not on this page.

The match uses `utm_content`. Keep the link exactly as written when you post. If you edit the link or remove the query string, visits can't be attributed.

> [!TIP]
> Mark your GA4 signup or purchase event as a key event, or list it under **Key events** on the Umami connection. Then the **Key events** column tells you which posts led to signups, not just visits.

## How Startica uses these numbers

Besides this page, your metrics feed:

- the weekly [roadmap](/guides/roadmap) re-plan, which reads 30-day totals for every metric;
- each posted piece's results in [Content Studio](/guides/content-studio).

## Related

- [Google Analytics](/credentials/google)
- [Umami](/credentials/umami)
- [Search performance](/seo/search)
- [Stripe credentials](/credentials/stripe)
- [Product database (Supabase or Postgres)](/credentials/supabase)
- [Privacy and security](/concepts/privacy-security)
