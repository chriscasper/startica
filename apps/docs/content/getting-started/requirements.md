---
title: Requirements
description: The operating systems, tools, disk space and accounts you need to build and run Startica from source.
layout: doc
---

Startica is built from source for now. You need a few developer tools to build it, and an AI API key (Anthropic or OpenAI) to use it. Everything else is optional.

## Operating systems

| OS | Status |
|---|---|
| macOS | Tested most. Dev mode and the packaged app have been run end to end, including the Keychain. |
| Windows | The installer builds, but it hasn't been run. Expect rough edges. |
| Linux | The AppImage builds, but it hasn't been run. Expect rough edges. |

> [!WARNING]
> Windows and Linux are untested. If you try them, please report what works and what doesn't in [GitHub Discussions](https://github.com/chriscasper/startica/discussions).

### macOS

No extra setup. Secrets are encrypted with the macOS Keychain.

### Windows

Secrets are encrypted with Windows' built-in data protection (DPAPI). This is untested.

### Linux

Startica encrypts secrets with your desktop keyring (libsecret, for example GNOME Keyring or KWallet). Without a keyring, secrets are only lightly protected, and the app prints a warning in the terminal. AppImages need FUSE; on recent Ubuntu that's the `libfuse2` package.

## Tools

| Tool | Version | Why |
|---|---|---|
| Node.js | 24 or newer | Runs the build and dev mode. Startica uses Node's built-in SQLite (`node:sqlite`). |
| Corepack | Ships with Node 24 | Installs the exact Yarn version the repo pins. |
| Yarn | 4 (installed by Corepack) | The repo is a Yarn 4 workspace. Don't install Yarn 1 globally. |
| git | Any recent version | To clone and update the code. |

Check your Node version:

```bash
node --version
```

If `corepack` isn't found, install it:

```bash
npm install -g corepack
```

An installed (built) copy of Startica doesn't need Node. It runs on the Node that's built into Electron.

## Disk space and network

- About 1.5 GB for the cloned repo and its dependencies.
- A few hundred MB more if you build an installer.
- The data folder starts small. It grows with the conversations and drafts you collect, and with scan results, page screenshots and ad images.
- An internet connection. `yarn install` downloads the Electron binary, and the app calls your AI provider's API (Claude or OpenAI), Reddit, Hacker News, Bluesky, Mastodon servers, the Discourse forums you watch, the sites you scan, a few free public security data services for verified sites, and any services you connect. An installed copy also checks GitHub for updates. [Privacy and security](/concepts/privacy-security) lists every one.

## Accounts and keys

### Required

- **An AI API key, from Anthropic or OpenAI.** Every AI step (intel, scoring, drafts, content, ads, roadmap, audits, and the AI help in Accessibility, SEO & GEO and Security) calls Claude or OpenAI with your key. Site scans and checks don't use AI, so you can use Accessibility, Site health and Security without spending anything. You pay the provider directly for what you use, and Startica stops calling the AI when the month's spend reaches the budget you set. See [Anthropic API key](/credentials/anthropic), [OpenAI API key](/credentials/openai) and [Costs and budget](/concepts/costs).

### Optional

These only matter for [Analytics](/guides/analytics), [Search performance](/seo/search), ad pictures and issue trackers. Reddit, Hacker News, Bluesky, Mastodon and Discourse need no accounts or keys. X search is optional and needs your own paid [X API token](/credentials/x-api).

| Credential | Unlocks | Guide |
|---|---|---|
| Google Analytics service account key | Google Analytics 4 traffic and key events | [Google Analytics](/credentials/google) |
| Umami API key (instead of Google Analytics, or as well) | Umami visits, sources and custom events | [Umami](/credentials/umami) |
| Search Console service account key (can be the GA4 one) | Clicks, impressions and queries from Google search | [Google Search Console](/credentials/search-console) |
| Bing Webmaster Tools API key | Clicks, impressions and queries from Bing and Copilot | [Bing Webmaster Tools](/credentials/bing-webmaster) |
| A read-only database login, made by a SQL script Startica writes and you run (Supabase or any Postgres) | Daily totals from your product's own database | [Product database](/credentials/supabase) |
| Stripe restricted key | Subscriptions, MRR and cancellations | [Stripe](/credentials/stripe) |
| OpenAI API key (even if you use Claude for everything else) | AI-drawn pictures for [ad creatives](/ads/creatives) | [OpenAI API key](/credentials/openai) |
| GitHub or GitLab token | Issues opened for accessibility problems and security findings | [GitHub and GitLab](/credentials/github-gitlab) |

You bring your own credentials. Startica has no shared keys of its own. See [Bring your own credentials](/credentials).

## Next

[Install from source](/getting-started/install).
