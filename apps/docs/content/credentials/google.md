---
title: Google Analytics
description: Connect Google Analytics 4 to a product with a read-only service account key you create in your own Google Cloud project.
layout: doc
---

Startica reads Google Analytics 4 (GA4) so it can show visits by source, key events, and visits from each reply you posted. It reads GA4 with a service account: a key from a Google Cloud project you own that can only view the GA4 properties you add it to. Setting it up takes about ten minutes, once per property.

A GA4 connection belongs to one product. Each product links one property.

## What you need

| Item | Value |
| --- | --- |
| Google Cloud project | Any project you own. A new one is fine. |
| API to enable | **Google Analytics Data API** |
| Service account | One with no Cloud roles, and a **JSON** key |
| Access in GA4 | The service account's email added to the property as a **Viewer** |
| Property ID | The number under **Admin → Property details** in GA4 |

The Viewer role is read-only. Startica can't change your Analytics settings.

> [!NOTE]
> If your Google account belongs to a Google Workspace organization, an organization policy can block creating service account keys. Ask your admin to allow it for your project, or use a project under a personal Google account. Personal Google accounts aren't affected.

## 1. Enable the Data API

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and sign in.
2. In the project picker at the top, create a new project (for example `startica`) or pick an existing one.
3. Go to **APIs & Services → Library**. Search for **Google Analytics Data API** and click **Enable**.

## 2. Create the service account and its key

1. Go to **IAM & Admin → Service accounts** and click **Create service account**.
2. Give it a name such as `startica-reader`. It needs no roles: skip the optional permission steps and click **Done**.
3. Open the new service account. Go to **Keys → Add key → Create new key**, choose **JSON**, and click **Create**. A `.json` file downloads.
4. Copy the service account's email. It looks like `startica-reader@your-project.iam.gserviceaccount.com`.

## 3. Give it access to the property

1. In Google Analytics, open **Admin → Property access management** for the property.
2. Click **+ → Add users**, paste the service account's email and choose the **Viewer** role. Untick "Notify new users by email" and click **Add**.
3. Open **Admin → Property details** and copy the **Property ID**. It's a number, such as `123456789`.

## 4. Connect in Startica

1. Make sure the right product is active in the header.
2. In **Settings → Products → Connections for …**, find **Google Analytics 4** and click **Connect**. The dialog repeats the setup steps, with links to the Google Cloud pages.
3. In "Connect Google Analytics 4", enter the **Property ID**.
4. Under **Service account key**, click **Choose file…** and pick the downloaded `.json` file. (Or open it in a text editor and paste everything in it.)
5. Click **Save and test**.

Startica stores the key encrypted with your OS keychain and runs a sync right away. The card then shows **Connected** and "Property _id_", or **Error** with the reason. Once it's connected, delete the downloaded `.json` file.

To use another property or a new key, click **Replace key**. Leave **Service account key** empty to keep the saved key and change only the property ID.

> [!WARNING]
> A service account key never expires on its own. Anyone with the `.json` file can read the properties the service account was added to. Delete the file once it's in Startica, and delete the key in Google Cloud if you stop using it.

## What Startica pulls

Each sync requests the last 30 days from the GA4 Data API and stores daily values in the local database.

| Stored metric | GA4 source | Split by |
| --- | --- | --- |
| `sessions`, `users`, `key_events` | `sessions`, `totalUsers`, `keyEvents` | Day only |
| `sessions` | `sessions` | `source:<source> / <medium>` |
| `sessions`, `key_events` | `sessions`, `keyEvents` | `utm_content:<value>`, which carries the draft ID Startica puts in its links (per-reply attribution) |
| `key_events` | `keyEvents` | `event:<event name>` (non-zero only) |

Syncs run every day at 08:15 local time while Startica is open, when you save the connection, and when you click **Sync now**. GA4 itself can take 24 to 48 hours to finalize a day's numbers, so the last day or two may still change. Re-syncing overwrites earlier values for the same day.

To count signups or purchases as key events, mark those events as key events in GA4 (**Admin → Data display → Events**).

## Disconnect or revoke

- The trash button on the **Google Analytics 4** card removes the connection and deletes the saved key from Startica.
- To cut off access on Google's side as well, remove the service account from **Property access management** in GA4, or delete its key under **IAM & Admin → Service accounts → Keys** in Google Cloud.

## Connected before with Connect with Google?

Older versions of Startica had a **Connect with Google** sign-in under **Workspace sign-ins** and a GA4 property picker. Both are gone. A GA4 connection made that way has no key of its own, so its syncs fail. Click **Replace key** on the **Google Analytics 4** card and follow the steps above to connect it with a service account key. You can also delete the old OAuth client in Google Cloud.

## Troubleshooting

| Message or symptom | Cause and fix |
| --- | --- |
| "The GA4 property ID is a number (Admin → Property details)" | Enter the numeric property ID, not the measurement ID (`G-…`) or the property name. |
| "Paste the whole service account key: the contents of the .json file, starting with {" | The key field has only part of the file, or a different kind of key. Paste the whole `.json` file of a service account key. |
| "The GA4 key isn't valid JSON: paste the whole .json file" | The saved key is damaged. Click **Replace key** and paste the file again. |
| "The GA4 key isn't a service account key: reconnect GA4 in Settings → Products → Connections" | The saved key isn't a service account key. Click **Replace key** and paste a service account's `.json` key. |
| "Paste the credentials to connect" | No key is saved for this connection yet. Paste the `.json` key; it can only be left blank when replacing a saved one. |
| "No credentials saved for this connection" | The connection was made with the old Google sign-in. Click **Replace key** and add a service account key. |
| `PERMISSION_DENIED` or "User does not have sufficient permissions for this property" | The service account isn't a Viewer on this property, or the property ID is for another property. Check **Property access management** in GA4. |
| `Google Analytics Data API has not been used in project …` | Enable the Data API in the project that owns the service account. |
| Creating a key fails with "Service account key creation is disabled" | A Google Workspace organization policy blocks keys. See the note under [What you need](#what-you-need). |

More in [Troubleshooting](/troubleshooting/).
