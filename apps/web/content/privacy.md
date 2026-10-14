---
title: Privacy
layout: page
eyebrow: Privacy
lede: Startica has no servers, no accounts and no telemetry. Here is exactly what leaves your computer, and when.
description: What Startica keeps on your computer, what it sends over the network and to whom, and what this website collects.
---

_Last updated: October 14, 2026_

Startica is a desktop app. It keeps your data in a SQLite database on your own computer and has no server of its own. The project doesn't collect, receive or store anything you do in the app.

## What stays on your computer

Everything Startica creates or stores: your products, intel, conversations, drafts, voice profiles, content, ad plans and creatives, roadmap, metrics, scan results and page screenshots, security findings and the log of AI calls. It's all in one database file in your data folder ([where to find it](https://docs.mystartica.com/reference/data-folder)).

Secrets, such as your API keys, service-account keys and database connection details, are encrypted with your operating system's keychain before they're saved.

## What goes over the network

Startica connects only to the services below. Most of them are used only after you set them up, and always with your own credentials.

| Service | When | What is sent |
|---|---|---|
| **Anthropic (Claude API) or OpenAI** | When a background job uses AI: building intel, scoring, drafting, content, ads, roadmap, audits, and the AI help you ask for in Accessibility, SEO & GEO and Security | The prompt for that task, which can include your product brief, the thread being answered, voice samples, recent metrics, or the HTML, images and findings from your own pages. Sent with your API key to the provider you choose, under [Anthropic's](https://www.anthropic.com/legal) or [OpenAI's](https://openai.com/policies) terms. Some tasks use the provider's web search. Ad pictures are drawn by OpenAI's image model, only with an OpenAI key and only when you ask. |
| **Reddit** | Hourly scans, and when you paste a Reddit link | Requests for public RSS feeds of the subreddits you watch, and searches for your keywords |
| **Hacker News (Algolia)** | Hourly scans | Searches for your keywords through Algolia's public HN API |
| **Bluesky** | Hourly scans | Searches for your keywords through Bluesky's public API (`api.bsky.app`), without an account |
| **Mastodon servers** | Hourly scans | Requests for the public timelines of the hashtags you watch, on the servers you name |
| **Discourse forums** | Hourly scans | Requests for new topics and keyword searches on the forums you watch, without an account |
| **X API** | Only if you add your own token | Searches for your keywords and reads of posts you paste or published, billed to your X developer account, within the daily cap you set |
| **Your product's websites** | Building intel, audits, and scans of the sites you add | Ordinary page loads in a built-in browser, at most one a second, identified as `StarticaBot`. Scans also fetch `robots.txt`, sitemaps and the PDFs and links your pages point to. Once you prove a site is yours, security checks also request a few well-known paths (such as `/.git/HEAD` and `/.well-known/security.txt`), read the TLS certificate and look up the domain's public DNS records. Only sites you add are scanned. |
| **Pages AI answers cite** | Only if you use AI visibility | Off-site presence reads the public pages that AI answers cited, to see whether you and your competitors appear on them |
| **Public security data** | Only for verified sites, once a day | crt.sh (certificate logs) receives the site's domain; OSV.dev receives the names and versions of JavaScript libraries found on your pages; FIRST EPSS receives CVE ids; the CISA list of exploited vulnerabilities is downloaded whole. No other data is sent. |
| **Google** | Only if you connect Google Analytics or Search Console | Read-only Analytics Data and Search Console API requests with your own credentials |
| **Umami** | Only if you connect it | Read-only requests for your site's visits and events, to your own Umami instance or Umami Cloud, with your own API key |
| **Bing Webmaster Tools** | Only if you connect it | Requests for your site's search numbers with your own API key, once a day |
| **Supabase / your database** | Only if you connect it | Read-only queries for the metrics you set up, through a read-only login you create; Startica refuses logins that can change data |
| **Stripe** | Only if you add a key | Read-only requests with your restricted key, once a day |
| **GitHub or GitLab** | Only if you connect an issue tracker | The issues you ask Startica to open (by hand, or after each scan if you turn that on): the problem, how to fix it and the pages it's on. Sent with your own token, to the repository you choose |
| **Sites you post to** | Only when you click **Post…** | The posting window opens that site's page (Reddit, Hacker News, X, LinkedIn, Bluesky, your Mastodon server or a Discourse forum), signed in as you, and fills in your text. Nothing is sent until you press the site's own button. |

Startica sends **no telemetry, analytics, crash reports or usage data** to the project or anyone else.

**Updates:** an installed copy of Startica checks the repository's public release files on GitHub for a newer version 30 seconds after launch and every 6 hours. That request carries no data about you or your use of the app, and you can turn automatic checks off in the tray menu. Running from source (`yarn dev:desktop`) doesn't check.

## Posting

Startica never posts anything by itself, never sends email, never launches or pays for ads, and never changes your site. On supported sites, **Post…** opens the site in a separate Startica window, fills in your text, and waits for you to press the site's own button. Startica then reads only the response to that submit to save your post's link. For other channels and email campaigns, you copy the text into your own tools.

You sign in to each site inside that window. The sign-in is kept on your computer between launches; Startica never sees your password. No AI controls the window, and nothing from the pages you post on is sent to Claude. The [posting guide](https://docs.mystartica.com/guides/assisted-posting) has the details.

## This website and the docs

mystartica.com and docs.mystartica.com are static sites hosted on Cloudflare. They don't use cookies, analytics or tracking scripts. Fonts load from Google Fonts. Cloudflare processes standard request data, such as IP addresses, to serve and protect the sites. Your theme choice (light or dark) is stored only in your browser.

If you email hello@mystartica.com, your message is used only to reply to you.

## Changes and contact

Changes to this page are tracked in the [public repository](https://github.com/chriscasper/startica). Questions: [hello@mystartica.com](mailto:hello@mystartica.com).
