---
title: Google Search Console
description: Connect Google Search Console to a product with a read-only service account, either the one GA4 already uses or a new one, so Startica can show your search performance.
layout: doc
---

Startica reads Google Search Console to show the queries people find your site with, and the clicks, impressions and positions for each query and page, on [SEO & GEO → Search](/seo/search). It reads Search Console with a service account: a key from a Google Cloud project you own, which can only see the Search Console properties you add it to. If you've already [connected Google Analytics](/credentials/google), you can reuse its key, and setup takes about five minutes.

Search Console is free, and so is its API. A Search Console connection belongs to one product, and each product links one property.

## What you need

| Item | Value |
| --- | --- |
| A Search Console property | For your product's site, which you own or have full access to. Adding users needs owner rights. |
| Google Cloud project | The one your GA4 service account is in, or any project you own |
| API to enable | **Google Search Console API** |
| Service account | The GA4 one, or a new one with no Cloud roles and a **JSON** key |
| Access in Search Console | The service account's email added to the property as a **Restricted** user |
| The property's name | As Search Console shows it: a domain such as `fieldnote.example`, or an address such as `https://fieldnote.example/` |

Restricted access is read-only. Startica asks Google only for read access to Search Console (the `webmasters.readonly` scope), so it can't submit sitemaps, remove pages or change any setting, even if you give the service account more.

> [!NOTE]
> If your Google account belongs to a Google Workspace organization, an organization policy can block creating service account keys. Ask your admin to allow it for your project, or use a project under a personal Google account. Personal Google accounts aren't affected.

## 1. Enable the Search Console API

1. Open the [Google Search Console API page](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com) in the Google Cloud Console and sign in.
2. In the project picker at the top, pick the project your service account is in. To reuse the GA4 key, that's the project where you enabled the Google Analytics Data API.
3. Click **Enable**.

The API has to be enabled in the project that owns the service account, even when the Search Console property belongs to another Google account.

## 2. Pick a service account

**To reuse the GA4 service account**, skip this step. You need its email, which looks like `startica-reader@your-project.iam.gserviceaccount.com`. Find it under **IAM & Admin → Service accounts** in the Cloud Console, or as `client_email` in the GA4 `.json` key.

**To use a separate one**:

1. Go to **IAM & Admin → Service accounts** and click **Create service account**.
2. Give it a name such as `startica-search`. It needs no roles: skip the optional permission steps and click **Done**.
3. Open the new service account. Go to **Keys → Add key → Create new key**, choose **JSON**, and click **Create**. A `.json` file downloads.
4. Copy the service account's email.

A separate key means you can revoke Search Console access without touching GA4. One key for both is less to manage. Either works.

## 3. Add it to the property

1. Open [Google Search Console](https://search.google.com/search-console) and pick the property for your site.
2. Go to **Settings → Users and permissions** and click **Add user**.
3. Paste the service account's email, choose **Restricted** permission, and click **Add**.

Google's help describes adding people by their Google account; a service account's email is added the same way, and Search Console doesn't send it an email.

## 4. Connect in Startica

1. Make sure the right product is active in the header.
2. In **Settings → Products → Connections for …**, find **Google Search Console** and click **Connect**. The dialog "Connect Google Search Console" repeats the setup steps, with links.
3. Under **Property**, enter the property. See [Property formats](#property-formats).
4. Choose the key:
   - With GA4 connected, **Use the GA4 service account key** is ticked for a new connection. Leave it ticked to reuse the GA4 key. Any key pasted below is then ignored, and if the connection had a key of its own, Startica deletes it.
   - To use another key, untick it, and under **Or a service account key of its own** (or **Service account key**, without GA4), click **Choose file…** and pick the `.json` file, or paste its contents.
5. Click **Save and sync**.

Startica first checks that the key can read the property. If it can't, the dialog shows why (see [Troubleshooting](#troubleshooting)) and nothing is saved. (In [demo mode](/guides/demo-mode), which makes no outside calls, the check is skipped.) Otherwise it stores a pasted key encrypted with your OS keychain and starts the first sync right away. The card shows **Checking…** while it runs, then **Connected** with the property (and "uses the GA4 key" if it does), or **Error** with the reason. The first sync reads 16 months and can take a minute. Once it's connected, delete any `.json` file you downloaded.

To change the property or the key, click **Change**. Leave the key field empty to keep the saved key.

> [!WARNING]
> A service account key never expires on its own. Anyone with the `.json` file can read every Search Console property and GA4 property the service account was added to. Delete the file once it's in Startica, and delete the key in Google Cloud if you stop using it.

## Property formats

Search Console has two kinds of property, and the name you enter must match one exactly:

| Kind | In Search Console | Enter |
| --- | --- | --- |
| Domain | `fieldnote.example`, covering every subdomain and both `http` and `https` | `fieldnote.example` or `sc-domain:fieldnote.example` |
| URL prefix | `https://fieldnote.example/`, covering only addresses that start with it | The full address, starting with `https://` or `http://` |

Startica turns what you type into the form the API uses, and the card shows the result:

| You type | Saved as |
| --- | --- |
| `fieldnote.example` | `sc-domain:fieldnote.example` |
| `Fieldnote.example/blog` | `sc-domain:fieldnote.example` (anything after the domain is dropped) |
| `sc-domain:fieldnote.example` | `sc-domain:fieldnote.example` |
| `https://fieldnote.example` | `https://fieldnote.example/` (a trailing slash is added) |

So a domain on its own always means a Domain property. For a URL-prefix property, type the address with `https://` (or `http://`), exactly as Search Console lists it, including `www.` if it has it. `www.fieldnote.example` on its own means the Domain property `sc-domain:www.fieldnote.example`, which usually doesn't exist.

If you have both kinds for the same site, use the Domain property: it covers the whole site.

## What Startica pulls

| Data | Split by | From |
| --- | --- | --- |
| Clicks, impressions and average position for the site | Day | `searchAnalytics.query` |
| The same for each query, page, country and device | Day, and one of query, page, country or device | `searchAnalytics.query` |
| Sitemaps: address, when submitted and read, pages listed, errors and warnings | — | `sitemaps.list` |

Startica asks for web search results only (`type: "web"`, not Images, Video, News or Discover), and for the freshest data (`dataState: "all"`), so the last day or two are included while Google may still revise them. Each request returns up to 25,000 rows, and Startica reads at most 200,000 rows per breakdown for each month-long window, so a very large site's long tail can be incomplete but its newest days are always read. Google also limits what it exports to the top rows: about 50,000 a day per site.

The first sync reads 16 months, everything Search Console keeps, a month at a time, newest month first. Later syncs, every day at 08:15 while Startica is open and when you click **Sync now**, re-read the last 5 days and anything newer, overwriting what was stored. See [How syncing works](/seo/search#how-syncing-works).

Search Console counts days in Pacific Time, so a day's numbers may not line up exactly with GA4's, which uses the property's time zone.

## Disconnect or revoke

- The trash button on the **Google Search Console** card removes the connection and deletes its saved key from Startica. Search data already synced stays in the local database. A connection that reuses the GA4 key has no key of its own; removing it leaves GA4 untouched.
- To cut off access on Google's side as well, remove the service account under **Settings → Users and permissions** in Search Console, or delete its key under **IAM & Admin → Service accounts → Keys** in Google Cloud. Deleting a key the GA4 connection also uses stops GA4 syncing too.

## Troubleshooting

When you save, Startica checks access first and shows any problem in the dialog. When a later sync fails, the card in **Settings** shows **Error** and the message, and the **Search** screen shows "Last sync failed:" with the same message. Most messages can appear in either place.

| Message or symptom | Cause and fix |
| --- | --- |
| "Enter the Search Console property, e.g. example.com or https://example.com/" | The **Property** field is empty. |
| "Paste the whole service account key: the contents of the .json file, starting with {" | The key field has only part of the file, or a different kind of key. Paste the whole `.json` file of a service account key. |
| "Paste the credentials to connect" | No key is saved yet and **Use the GA4 service account key** isn't ticked. Paste a key or tick the box. |
| "GA4 has no saved key for this product: connect GA4 first, or paste a key here." | Shown when saving with **Use the GA4 service account key** ticked, and the GA4 connection has no key. Connect GA4 first, or untick the box and paste a key. |
| "This connection uses the GA4 key, but GA4 isn't connected for this product. Connect GA4 or paste a key here." | The connection reuses the GA4 key, and GA4 was removed. Connect GA4 again, or click **Change**, untick the box and paste a key. |
| "No service account key saved for Search Console" | The connection has no key of its own. Click **Change** and paste the key, or tick **Use the GA4 service account key**. |
| "The Search Console key isn't valid JSON: paste the whole .json file" | The saved key is damaged. Click **Change** and paste the file again. |
| "The GA4 key isn't valid JSON: paste the whole .json file" | The connection reuses the GA4 key, and that key is damaged. Click **Replace key** on the **Google Analytics 4** card and paste it again. |
| "The Search Console key isn't a service account key: paste the .json file from Google Cloud → Service accounts → Keys" (or "The GA4 key …" when reusing it) | The key isn't a service account's `.json` key (it has no `"type": "service_account"`, `client_email` or `private_key`). Create a key as in step 2 and paste it. |
| "The service account key's private key can't be read: paste the .json file again" | The `private_key` in the file was changed or cut off. Paste the original file. |
| "Google refused the service account key (…). If you deleted or rotated the key, paste a new one." | Google didn't accept the key, for example because it was deleted in Google Cloud or the service account was disabled. Create a new key and paste it. The reason from Google is in the parentheses. |
| "The Google Search Console API isn't turned on for the service account's Google Cloud project. Enable it in Google Cloud Console → APIs & Services → Library → Google Search Console API, then sync again. (…)" | Do step 1 in the project that owns the service account. Google can take a few minutes to apply it. |
| "The service account can't read any Search Console property yet. In Search Console, open Settings → Users and permissions for … and add …." | The service account hasn't been added to any property. Do step 3 with the email shown. |
| "The service account can't read …. It can read: …. Use one of those, or add … to … in Search Console." | The property you entered isn't one the service account was added to, often because of the format (Domain or URL prefix, `http` or `https`, `www.`). Enter one of the listed properties exactly, or add the service account to yours. If you enter a URL prefix such as `https://www.fieldnote.example/` and the service account can read the site's Domain property (`sc-domain:fieldnote.example`), Startica uses the Domain property without asking. See [Property formats](#property-formats). |
| "Search Console didn't let the service account read this property (…). In Search Console, open Settings → Users and permissions and add …" | During a sync, Google answered 403 or 404, for example because the service account was removed from the property. Add the email shown in the message again. |
| "Search Console: …" | Another error from the API, with Google's reason. If it's about quotas, Startica tries again on the next sync. |
| The card stays **Checking…** | The first sync is still running, or Startica was closed before it finished. Click **Sync now**. |
| Creating a key fails with "Service account key creation is disabled" | A Google Workspace organization policy blocks keys. See the note under [What you need](#what-you-need). |
| **Search** shows fewer clicks for queries than in total | Not an error: Google hides rare queries. See [Hidden queries](/seo/search#hidden-queries). |

More in [Troubleshooting](/troubleshooting/).
