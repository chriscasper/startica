---
title: Bing Webmaster Tools
description: Connect Bing Webmaster Tools to a product with your API key, so Startica can show clicks and impressions from Bing and Copilot and your top Bing queries and pages.
layout: doc
---

Startica can read Bing Webmaster Tools to show clicks and impressions from Bing search and Copilot, and your top queries and pages on Bing, on [SEO & GEO → Search](/seo/search#the-bing-view). It's optional: [Google Search Console](/credentials/search-console) covers most search traffic for most sites. Bing Webmaster Tools and its API are free, and setup takes about five minutes if your site is already verified there.

A Bing connection belongs to one product, and each product links one site.

## What you need

| Item | Value |
| --- | --- |
| Bing Webmaster Tools | An account with your site added and verified |
| API key | Generated under **Settings → API access** in Bing Webmaster Tools |
| The site's address | Exactly as Bing Webmaster Tools lists it, such as `https://fieldnote.example/` |

## 1. Add and verify the site

1. Open [Bing Webmaster Tools](https://www.bing.com/webmasters) and sign in.
2. Add your site. If it's already verified in Google Search Console, you can import it from there, which verifies it in one step. Otherwise follow Bing's steps to verify it.

Skip this if the site is already in your account.

## 2. Generate an API key

1. In Bing Webmaster Tools, open **Settings** (top right) **→ API access**.
2. Accept the terms, then generate an **API key**.
3. Copy the key.

One key belongs to your Bing Webmaster Tools account and covers every site in it. Generating a new key replaces the old one.

> [!WARNING]
> The API key isn't limited to reading. As the dialog says, "A Bing API key can do anything your Bing Webmaster Tools account can; Startica only reads with it." That includes submitting addresses and changing site settings on every site in the account. Treat the key like a password, and generate a new one if it leaks.

## 3. Connect in Startica

1. Make sure the right product is active in the header.
2. In **Settings → Products → Connections for …**, find **Bing Webmaster Tools** and click **Connect**. The dialog "Connect Bing Webmaster Tools" repeats the setup steps, with a link.
3. Under **Site**, enter the site's address as Bing lists it, for example `https://fieldnote.example/`. A bare domain such as `fieldnote.example` is read as `https://fieldnote.example/`, and a trailing slash is added if you leave it out.
4. Under **API key**, paste the key.
5. Click **Save and sync**.

Startica first checks that the key can read the site. If it can't, the dialog shows why (see [Troubleshooting](#troubleshooting)) and nothing is saved; in [demo mode](/guides/demo-mode) the check is skipped. Otherwise it stores the key encrypted with your OS keychain and starts the first sync right away. The card shows **Checking…**, then **Connected** with the site, or **Error** with the reason.

To change the site or the key, click **Replace key**. Leave **API key** empty to keep the saved key.

Startica compares the site with the verified sites the key can read, ignoring upper and lower case and a trailing slash. `http` and `https`, and `www.`, must match.

## What Startica pulls

| Data | Bing method | How often Bing updates it |
| --- | --- | --- |
| Clicks and impressions for the site, per day | `GetRankAndTrafficStats` | Daily |
| Clicks, impressions and average position for top queries, per week | `GetQueryStats` | Weekly |
| The same for top pages, per week | `GetPageStats` | Weekly |

Things to know:

- **Bing and Copilot together.** Bing counts clicks and impressions from Bing search and Copilot together and doesn't split them. The **Search** screen calls this view **Bing and Copilot**.
- **No site position.** Bing's daily totals have no position, so the **Average position** tile shows a dash. Queries and pages have one. When Bing reports a week with no position, that week is left out of the average position.
- **Weekly queries and pages.** Short ranges on **Search** may show no queries or pages.
- **No countries, devices or sitemaps** from Bing.

Bing returns everything it has on each request. The first sync keeps up to 16 months; later syncs keep rows from 14 days before the newest stored day, because Bing's weekly rows change for a while. Syncs run when you save the connection, every day at 08:15 while Startica is open, and when you click **Sync now**. See [How syncing works](/seo/search#how-syncing-works).

Bing's API takes the key as part of the request address (`apikey=…`), over HTTPS to `ssl.bing.com`. Startica uses Bing's JSON API; Bing retired its older SOAP and POX APIs on 2026-08-31.

## Disconnect or revoke

- The trash button on the **Bing Webmaster Tools** card removes the connection and deletes the saved key from Startica. Search data already synced stays in the local database.
- To cut off access on Bing's side as well, generate a new key under **Settings → API access** in Bing Webmaster Tools. The old key stops working.

## Troubleshooting

When you save, Startica checks the key and site first and shows any problem in the dialog. When a later sync fails, the card in **Settings** shows **Error** and the message, and the **Search** screen's Bing view shows "Last sync failed:" with the same message.

| Message or symptom | Cause and fix |
| --- | --- |
| "Enter the site as Bing Webmaster Tools lists it, e.g. https://example.com/" | The **Site** field is empty or isn't a web address. |
| "Paste the credentials to connect" | No key is saved yet. Paste the API key. |
| "No Bing API key saved" | The connection has no key. Click **Replace key** and paste it. |
| "Bing refused the API key. Generate a new one in Bing Webmaster Tools → Settings → API access." | The key is wrong, or was replaced by a newer one. Generate a key, then click **Replace key** and paste it. |
| "The Bing key has no verified sites. Add and verify the site in Bing Webmaster Tools first." | The account the key belongs to has no verified site. Do step 1. |
| "The Bing key can't read …. Its verified sites: …." | The site you entered isn't one of the account's verified sites. Click **Replace key** and enter the site exactly as listed, or add and verify it in Bing. |
| "This Bing account can't read that site. Add and verify the site in Bing Webmaster Tools with the account the key belongs to." | Bing says the account isn't allowed to read the site. Verify it with the account that generated the key. |
| "Bing is limiting requests from this key right now. Startica tries again on the next sync." | Bing's rate limit for your key. Wait for the next daily sync, or click **Sync now** later. |
| "Bing is limiting requests for this site right now. Startica tries again on the next sync." | Bing's rate limit for the site. Same as above. |
| "Bing Webmaster Tools: …" | Another error from Bing, with its reason. |
| No queries or pages on **Search** | Bing updates them weekly. Pick a longer range, or wait for Bing's next weekly update. |

More in [Troubleshooting](/troubleshooting/).
