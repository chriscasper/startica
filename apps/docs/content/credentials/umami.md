---
title: Umami
description: "Connect Umami to a product, on Umami Cloud or your own server: an API key, the website ID and optional key events."
layout: doc
---

Startica can read [Umami](https://umami.is) instead of Google Analytics. It reads visits, visitors, page views, traffic sources, landing pages, pages, countries, devices, browsers, custom events and the visits from each reply or piece you posted, and shows them on the same screens as GA4. It works with Umami Cloud and with your own Umami server. Setting it up takes a few minutes.

An Umami connection belongs to one product. Each product links one Umami website.

## What you need

| Item | Value |
| --- | --- |
| Umami | Umami Cloud, or your own Umami. Version 3.4 or later can create API keys; version 3.1 or later is needed for visits per tracking link. |
| Credential | An **API key** (`umami_…`). On an older self-hosted Umami without API keys: a `username:password`. |
| Website ID | The website's ID from **Settings → Websites → Edit** in Umami. It looks like `4fb7a6c2-1d2e-…`. |
| Key events (optional) | The names of the custom events that count as conversions, such as `signup` or `purchase` |

Startica only reads from Umami. It never changes your websites, events or settings.

## What Startica reads

Umami and GA4 use different words for similar numbers. Startica stores Umami's numbers under the same names as GA4's, so every screen shows either one:

| Startica shows | From GA4 | From Umami |
| --- | --- | --- |
| Sessions | Sessions | **Visits** |
| Users | Total users | **Visitors** (unique per day) |
| New visitors | New users | Not available: Umami doesn't report new visitors |
| Page views | Views | **Views** |
| Engaged visits | Engaged sessions: 10 seconds or more, a key event, or 2 or more pages | Visits minus **bounces**: visits with more than one page view |
| Time per visit | Engagement time | **Visit duration** (total time) |
| Key events | Events you marked as key events in GA4 | The **custom events** you list under **Key events**, or every custom event when the list is empty |
| Key events by event name | Key events per event name | Every custom event per event name |
| Traffic sources | Source / medium | The **referrer**'s domain: search engines become `<engine> / organic` (for example `google / organic`), other sites `<domain> / referral`, and visits without a referrer `(direct) / (none)` |
| Engagement and key events per source | Engaged sessions and key events per source / medium | Not available: Umami can't split these by source |
| Landing pages | Sessions, key events and engaged sessions per landing page | Visits per **entry** page. Key events and engagement aren't split by landing page. |
| Visits per page | Sessions per page path | Visits per page path (query string dropped) |
| Countries, devices, browsers | Sessions per country, device category and browser | Visits per country, device (laptops count as desktop) and browser |
| Visits per tracking link | Sessions per `utm_content` | Visits per `utm_content` |
| Key events per tracking link | Key events per `utm_content` | Chosen key events per `utm_content`, by first-click attribution. Only when you listed key events. |

The search engines Startica recognizes in a referrer are Google, Bing, DuckDuckGo, Yahoo, Ecosia, Yandex, Baidu, Brave Search, Startpage, Qwant, Kagi and Naver.

Pages, landing pages, countries and browsers keep the top 50 values per day. Where Umami has no number, Analytics shows a dash with a note.

Umami's list of referrers leaves out visits without a referrer. Startica counts those as direct: for each day, `(direct) / (none)` is the day's visits minus the visits in the referrer list.

These numbers show on:

- [Analytics](/guides/analytics): the traffic and key-event tiles and charts, channels, sources, landing pages, pages, countries, devices and browsers, and visits and key events for each post under **What Startica did**;
- [Content Studio](/guides/content-studio): each posted piece's visits and key events;
- [SEO & GEO → Search](/seo/search#visits-from-search-and-ai-assistants) and Analytics: visits from search engines and AI assistants;
- [Accessibility](/accessibility/results#priority): how many visits the pages with an issue got, for priority.

## Connect Umami Cloud

1. Sign in to [Umami Cloud](https://cloud.umami.is).
2. Open **Settings → API keys** and click **Create key**. Copy the key. It starts with `umami_`.
3. Open **Settings → Websites**, click **Edit** on the website and copy its **Website ID**.
4. In Startica, make sure the right product is active in the header.
5. In **Settings → Products → Connections for …**, find **Umami** and click **Connect**.
6. In "Connect Umami", leave **Server** empty, paste the **Website ID**, optionally list your **Key events**, and paste the key under **API key**.
7. Click **Save and sync**.

> [!WARNING]
> Umami Cloud has no read-only key. A key can do everything your Umami account can, except change your password and manage users. Startica only reads with it, but anyone who gets the key could change or delete your websites. If you stop using Startica, delete the key in **Settings → API keys**.

Umami Cloud only accepts API keys. A `username:password` doesn't work there.

## Connect your own Umami

### Umami 3.4 or later

You can use your own account's key, but a key has all of its user's access. For a key that can only read, give Startica a user of its own:

1. Sign in to Umami as an admin. Put the website in a team (**Settings → Teams**), if it isn't in one. A view-only user only sees websites that belong to a team it's in.
2. Under **Settings → Users**, create a user, for example `startica`, with the role **View only**.
3. Add that user to the team as **View only**.
4. Sign in as the new user, open **Settings → API keys** and click **Create key**. Copy the key.
5. Copy the website's **Website ID** from **Settings → Websites → Edit**.

Then connect it in Startica:

1. In **Settings → Products → Connections for …**, find **Umami** and click **Connect**.
2. Under **Server**, enter your Umami's address, such as `https://umami.example.com`. Startica adds `/api`. An address that already ends in `/api` is kept as it is.
3. Paste the **Website ID**, optionally list your **Key events**, and paste the key under **API key**.
4. Click **Save and sync**.

### Older Umami

Umami before 3.4 has no API keys. Instead of a key, enter the user name and password of a user that can see the website, as `username:password`, under **API key**. Use a **View only** user as above, so the password can't change anything.

Startica signs in with them on every sync. This doesn't work for a user with two-factor sign-in turned on: Startica says so and asks for an API key or another user.

> [!NOTE]
> Startica reads visits per tracking link only from Umami 3.1 or later. On an older Umami, the breakdowns it can't answer are skipped and everything else still syncs. See [Limits](#limits).

## After you save

Startica first checks that the credentials can read the website, and that the server answers like Umami's API with that website's ID. If not, the dialog shows why (see [Troubleshooting](#troubleshooting)) and nothing is saved. (In [demo mode](/guides/demo-mode), which makes no outside calls, the check is skipped.) Then Startica stores the key encrypted on your computer and syncs right away. The card shows **Checking…**, then **Connected** or **Error** with the reason.

Once saved, the card shows "Umami Cloud" or your server's address, the start of the website ID, and the key events you listed. Click **Change** to use another website, server, key or key events. Leave **API key** empty to keep the saved key.

## Choose key events

Key events are what Startica counts as conversions: the **Key events** tile and chart on Analytics, and the **Key events** column for each post. In Umami they're [custom events](https://docs.umami.is/docs/track-events) your site sends, such as `signup` or `purchase`.

- **List the events that matter**, separated by commas, such as `signup, purchase`. Names must match the event names in Umami exactly.
- **Leave it empty** to count every custom event. That's fine if your site only tracks conversions, but a site that also tracks clicks on buttons or links counts those too.

Key events per tracking link (which post led to a signup) are only read when you list key events. Umami counts them with first-click attribution: a visit's conversion goes to the tracking link it arrived through first.

To change the list later, click **Change** on the **Umami** card.

## Both GA4 and Umami

A product can have both connections, for example while you move from one to the other. Each syncs on its own, but every screen shows one of them: the product's **web analytics**.

| GA4 | Umami | Screens show |
| --- | --- | --- |
| Connected | Connected | GA4 |
| Error or not tested yet | Connected | Umami |
| Connected | Error or not tested yet | GA4 |
| Error or not tested yet | Error or not tested yet | GA4 |
| Not connected | Connected, Error or not tested yet | Umami |

Screens name the source they show, for example "All traffic, from Umami." on Analytics. To show Umami while GA4 works, remove the GA4 connection.

## Syncing

The first sync of a connection reads the product's whole [analytics history](/guides/analytics#history) (90 days by default, up to 16 months) from Umami, one day at a time in your computer's time zone, and stores the daily values in the local database. Later syncs read only the last 5 days, which Umami may still correct. Changing the connection with **Change**, or choosing a longer history, reads the whole history again. Re-syncing overwrites earlier values for the same day. Every day gets a key-event total, zero included, so after you change **Key events** the next sync replaces the old totals. Key events per tracking link, and sources, pages and tracking links on days without visits, are only stored when there's something to count, so an old value for such a day can stay.

Syncs run every day at 08:15 local time while Startica is open, when you save the connection, and when you click **Sync now**. See [Background jobs](/guides/background).

Umami can't split its numbers by day, so Startica asks for each day separately: one request for the day's totals and, on days with visits, seven more for sources, pages, tracking links, landing pages, countries, devices and browsers. Then one request for custom events, and, with key events listed, one per key event for each day that had visits through a tracking link. Startica waits about a third of a second between requests, about 3 a second, which keeps under Umami Cloud's limit of 50 requests every 15 seconds. A later sync usually takes under a minute. The first sync reads the whole history and takes longer: a few minutes for 90 days, and about half an hour for 16 months.

## Limits

- **AI visits need a referrer.** Startica counts a visit as coming from an AI assistant when its referrer is the assistant's address, such as `chatgpt.com`. GA4's `ai-assistant` medium doesn't exist in Umami. A visit that only carries `utm_source=chatgpt.com` and no referrer counts as direct. See [Visits from search and AI assistants](/seo/search#visits-from-search-and-ai-assistants).
- **Older Umami skips some breakdowns.** When Umami answers that it doesn't know a breakdown (Umami before 3.1 has no tracking-link breakdown, and older versions no attribution), Startica skips it: no visits or key events per post, and everything else still syncs.
- **Umami Cloud's free plan keeps about 6 months.** For a website without a team on an account without a subscription, Umami Cloud only answers from the start of the month 6 months ago. So on that plan, a history of 12 or 16 months in Startica can't reach further back than about 6 months.
- **Days in your time zone.** Umami days follow your computer's time zone; GA4 days follow the property's time zone.
- **History is capped by Settings.** Startica keeps 90 days by default. Choose more under **Keep analytics history for** in **Settings → Products → Connections**, up to 16 months. For anything older, open Umami.
- **No split by source or landing page.** Umami can't split key events or engagement by source or landing page, and has no new visitors, so those show a dash on Analytics. Key events per post still work, through the tracking links.

## Disconnect or revoke

- The trash button on the **Umami** card removes the connection and deletes the saved key from Startica. Numbers already synced stay in the local database.
- To cut off access in Umami as well, delete the key under **Settings → API keys**, or delete the view-only user you made for Startica.

## Troubleshooting

| Message or symptom | Cause and fix |
| --- | --- |
| "Enter Umami Cloud, or your Umami's address (e.g. https://umami.example.com)" | **Server** isn't an address. Leave it empty for Umami Cloud, or enter your Umami's address. |
| "Paste the Website ID from Umami (Settings → Websites → Edit); it looks like 4fb7a6c2-…" | Paste the website's ID, not its name, domain or tracking code. |
| "Paste the credentials to connect" | No key is saved yet. Paste the API key, or `username:password` on an older self-hosted Umami. |
| "Umami refused the credentials: create a new API key in Umami (Settings → API keys), or check the username and password." | The key was deleted or mistyped, the user name or password is wrong, or you used `username:password` on Umami Cloud, which only takes API keys. |
| "Umami has no website with that ID for these credentials (or the server address isn't your Umami). Copy the Website ID from Umami: Settings → Websites → Edit; a view-only user only sees websites that belong to a team it's in." | The ID is for another website, the key's user can't see it, or **Server** points somewhere else. A view-only user only sees websites in a team it belongs to: put the website in a team and add the user to it. |
| "That address didn't answer like Umami's API: check the server address (Startica adds /api to your own Umami's address)." (or "…: check the server address.") | **Server** answered, but not like Umami, for example a web page instead of the API, or a different website ID. Enter the address you open Umami at, such as `https://umami.example.com`. |
| "Umami didn't find /…: check the server address, or update Umami." | **Server** doesn't point at Umami's API, or your Umami is too old for that request. Enter the address you open Umami at, such as `https://umami.example.com`. |
| "This Umami user signs in with two-factor authentication, which Startica can't do. Use an API key (Umami 3.4 or later), or a separate view-only user without two-factor." | Use an API key, or a view-only user without two-factor sign-in. |
| "Umami didn't accept the username and password." | The sign-in didn't return a session. Check the user name and password. |
| "Umami is limiting requests right now; Startica tries again on the next sync." | Umami Cloud's rate limit was hit, for example by another tool using the same key. Wait, then click **Sync now**. |
| "Umami: …" | Umami answered with an error; Umami's own message, or the HTTP status, follows. A 5xx status means a problem on the Umami server. |
| "No credentials saved for this connection" | The saved key is missing. Click **Change** and paste the key again. |
| "fetch failed" or "The operation was aborted due to timeout" | Startica couldn't reach the server, or it didn't answer within 30 seconds. Check the address and that the server is up and reachable from this computer. |
| Key events stay at 0 | None of the listed events happened in the period you're looking at, or the names don't match Umami's exactly. Check the event names under **Events** in Umami. |
| Visits per post stay at 0 | Your Umami is older than 3.1, or the posts' links lost their `utm_content`. See [Attribution](/guides/analytics#attribution). |
| Analytics still shows Google Analytics | GA4 is connected and working too, and wins. See [Both GA4 and Umami](#both-ga4-and-umami). |

More in [Troubleshooting](/troubleshooting/).

## Privacy

- The key (or `username:password`) is stored encrypted on your computer, like every credential. See [How credentials are stored](/credentials/#how-credentials-are-stored).
- Requests go only to your Umami: `api.umami.is` for Umami Cloud, or the server you entered. They carry the key, the website ID and the dates asked for. Nothing goes through a Startica service.
- Startica only sends read requests, plus the sign-in for `username:password`.

See [Privacy and security](/concepts/privacy-security#what-goes-over-the-network).
