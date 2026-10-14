---
title: Bring your own credentials
description: Which accounts and keys Startica uses, which ones are optional, where you enter them, and how they are stored on your computer.
layout: doc
---

Startica has no server of its own and ships with no shared API keys. Everything it does runs on your computer and talks directly to services you hold accounts with. So you create the credentials yourself and paste them into **Settings**.

This takes a little setup, and you get three things for it:

- **No middleman.** Your keys, tokens and data never pass through a Startica-run service. There isn't one.
- **Your accounts, your terms.** The Claude or OpenAI API bills your Anthropic or OpenAI account directly, and the optional X API bills your X developer account. Google, Bing, Umami, Stripe, GitHub and GitLab only grant what you approve, and you can revoke access from their side at any time. Your product database only gives Startica a read-only login you created, and you can drop it at any time.
- **Your quotas.** You're not sharing rate limits or a spend pool with other Startica users.

## What you need

Only an AI API key is required: Anthropic or OpenAI, whichever provider you pick. Everything else adds results tracking, search performance, X search or issues in your repository, and you can add it later.

| Credential | What it unlocks | Required? | Where you enter it |
| --- | --- | --- | --- |
| [Anthropic API key](/credentials/anthropic) | Every AI feature (Intel briefs, scoring, drafting, Content Studio, roadmap, audits) with Claude | Required, unless you use OpenAI | The welcome wizard's **Connect AI** step, or **Settings → General → AI → Add API key** |
| [OpenAI API key](/credentials/openai) | Every AI feature with OpenAI | Required, unless you use Claude | The welcome wizard's **Connect AI** step, or **Settings → General → AI → Add API key** |
| [GA4 service account key](/credentials/google) | Google Analytics 4 traffic and key events for one product | Optional | **Settings → Products → Connections → Google Analytics 4 → Connect** |
| [Umami API key](/credentials/umami) | Umami visits, sources, pages and custom events for one product, instead of GA4 or as well (GA4 is shown when both work). Umami Cloud or your own server; `username:password` for older self-hosted installs. | Optional | **Settings → Products → Connections → Umami → Connect** |
| [Search Console service account key](/credentials/search-console) | Clicks, impressions, queries and positions from Google search for one product, on **SEO & GEO → Search**. Can reuse the GA4 key. | Optional | **Settings → Products → Connections → Google Search Console → Connect** |
| [Bing Webmaster Tools API key](/credentials/bing-webmaster) | Clicks and impressions from Bing and Copilot, and top Bing queries and pages, for one product | Optional | **Settings → Products → Connections → Bing Webmaster Tools → Connect** |
| [Product database login](/credentials/supabase) | Daily totals (signups, active users) from your product's database on Supabase or any Postgres. Nothing to create up front: Startica writes a SQL script that creates a read-only login, and you run it. | Optional | **Settings → Products → Connections → Product database → Set up** (or **Use a URL instead** for your own view and login) |
| [Stripe restricted key](/credentials/stripe) | Subscriptions, MRR, new subscriptions and cancellations | Optional | **Settings → Products → Connections → Stripe → Connect** |
| [GitHub or GitLab access token](/credentials/github-gitlab) | Opening, closing and reopening issues in one repository for the accessibility problems and security findings Startica finds | Optional | **Settings → Products → Issue tracker for … → Connect** |
| [X API bearer token](/credentials/x-api) | Finding X posts, reading pasted X links and checking replies on your X posts. Paid per post read on your X account. | Optional, paid | **Settings → Channels → X API (optional, paid) → Add token** |

Reddit, Hacker News, Bluesky, Mastodon and Discourse forums need nothing. Startica reads their public feeds and APIs without an account. X needs your own paid token to be searched; without one, you paste X posts yourself.

Posting with Startica doesn't use credentials either: you sign in to each site yourself in the posting window. See [Posting with Startica](/guides/assisted-posting).

> [!NOTE]
> Connections (GA4 property, Umami website, Search Console property, Bing site, Stripe key, product database) belong to one product. The **Connections for …** card in **Settings → Products** shows the product that's active in the header.

## How credentials are stored

Everything you paste (API keys, the GA4 and Search Console service account keys, the Umami and Bing API keys, connection URLs including the product database's read-only login, GitHub and GitLab tokens) is stored encrypted in the `secrets` table of Startica's local database. Ordinary settings, such as the monthly budget, live in a separate table and are not encrypted.

| How you run Startica | Encryption | Notes |
| --- | --- | --- |
| Desktop app (installed or `yarn dev:desktop`) | Electron `safeStorage`, which uses the OS keychain: macOS Keychain, Windows DPAPI, or libsecret on Linux | Encrypted values start with `ss1.`. The app's server never sees the encryption key; it asks the Electron process to encrypt and decrypt. |
| Browser mode (`scripts/serve.mjs`, smoke tests) | AES-256-GCM with a random key in `dev-secret.key` in the [data folder](/reference/data-folder), file mode `0600` | For development only. Anyone who can read your data folder can read these secrets. |

Secrets are decrypted only inside the app's own server process, when a background job or a settings page needs them. They're never sent anywhere except the service they belong to.

> [!WARNING]
> The two modes can't read each other's secrets. If you saved a key in browser mode and then open the desktop app, the job fails with "This secret was saved outside the desktop app; save it again in Settings." Paste it again in the desktop app.

> [!WARNING]
> On Linux without a keyring (no GNOME Keyring, KWallet or other libsecret provider), Electron falls back to a weak built-in key. Startica logs "No system keyring found; secrets are only lightly protected on this computer." Install and unlock a keyring if you can.

## When you run from source

There's no env file and no environment fallback for any credential. Development uses exactly the same Settings as the installed app: enter your keys in the welcome wizard or in **Settings**, and they're stored encrypted as described above. Use test keys and a low budget for a development data folder. See [Environment variables](/reference/environment) for the few variables Startica still reads.

## Removing credentials

| To remove | Do this |
| --- | --- |
| AI API key (Anthropic or OpenAI) | The key of the provider not in use: **Remove Claude (Anthropic) key** or **Remove OpenAI key** on the **AI** card. The key in use: replace it in **Settings → General → AI → Change keys or budget**. To stop all AI calls, revoke the key in the Claude Console or on the OpenAI platform. |
| A product connection | The trash icon on the connection's row. This deletes its stored key or URL. For GA4 and Search Console, also remove the service account from the property or delete its key in Google Cloud; see [Google Analytics](/credentials/google#disconnect-or-revoke) and [Google Search Console](/credentials/search-console#disconnect-or-revoke). For Bing, generate a new key; see [Bing Webmaster Tools](/credentials/bing-webmaster#disconnect-or-revoke). For Umami, delete the API key in Umami; see [Umami](/credentials/umami#disconnect-or-revoke). For the product database, drop the read-only login; see [Product database](/credentials/supabase#remove-access). |
| GitHub or GitLab token | **Disconnect** on the **Issue tracker for …** card in **Settings → Products**. This deletes the stored token; issues already opened stay in the repository. To revoke it on the service's side, see [GitHub and GitLab](/credentials/github-gitlab#disconnect-or-revoke). |
| X API token | **Remove** on the **X API (optional, paid)** card. To revoke it on X's side, regenerate or delete it in X's console. See [X API](/credentials/x-api#remove-the-token). |

Deleting the [data folder](/reference/data-folder) removes every stored secret at once.
