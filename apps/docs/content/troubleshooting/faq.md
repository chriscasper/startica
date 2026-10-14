---
title: FAQ
description: Short answers about Startica's cost, AI and X API spend, which platforms it covers, what it checks on your sites and what it never claims, posting, data, model providers, multiple products, teams, installers and where to get help.
layout: doc
---

Short answers to common questions. For problems and error messages, see [Troubleshooting](/troubleshooting).

## Is Startica free?

Yes. Startica is open source under the MIT license, and there's no paid plan or account. You pay only for the services you use with it, mainly the AI provider you pick (Claude or OpenAI), through your own API key. Reading Reddit, Hacker News, Bluesky, Mastodon and Discourse forums is free, and Google Analytics, Google Search Console, Bing Webmaster Tools, Supabase and Stripe access cost nothing extra through Startica. The one optional paid extra is X search with your own X API token.

## What does the AI cost?

It depends on how much you use it. Startica routes each task to a fitting model from your provider and logs every call with its cost on the **System** page. Some measured examples, on Claude's default models:

| Task | Model | Typical cost |
|---|---|---|
| Scoring one conversation | Claude Haiku | About $0.0002 |
| Drafting one reply | Claude Sonnet | About $0.01 |
| Building a product's intel | Claude Opus with web search | About $0.60 (one real build cost $0.59) |

You set a monthly budget in **Settings** → **General** → **AI** (default $50). When this month's spend reaches it, Startica stops calling the AI until next month. See [Costs and budget](/concepts/costs).

## Can I try it without an API key?

Yes. In the desktop app, click **Look around with a sample product first** on the welcome page. Startica restarts with Fieldnote, a sample product with intel, drafts, content, ads, a roadmap, metrics and sample results in Accessibility, SEO & GEO and Security already filled in, in a separate data folder. Scans, AI and posting are off there, so it needs no key and costs nothing. Click **Leave demo** to return to your own data. See [Try the demo](/guides/demo-mode).

You can also click **Skip for now** on the welcome wizard's **Connect AI** step and add a product without a key. Startica stores it, but nothing that needs the AI (intel, scoring, drafts) runs until you add a key.

## Which platforms does it cover?

| Platform | Finds conversations | Reads pasted links | Post… (desktop, beta) |
|---|---|---|---|
| Reddit | Yes, in watched subreddits | Yes | Yes |
| Hacker News | Yes, by keyword | Yes | Yes |
| Bluesky | Yes, by keyword | Yes | Yes |
| Mastodon | Yes, in watched hashtags (`#tag@server`) | Yes | Yes, from your own server |
| Discourse forums | Yes, in watched forums | Yes | Yes |
| X | Only with your own paid X API token | Only with a token | Yes |
| LinkedIn | No: paste | No: paste the text | Yes (see the terms warning) |
| Facebook groups, other sites | No: paste | No: paste the text | No: copy only |

See [Finding conversations](/guides/finding-conversations), [Manual channels](/guides/manual-channels) and [Posting with Startica](/guides/assisted-posting).

## What else does it check besides marketing?

Your product's websites. Add a site under **Accessibility** and one scan loads each page once and runs three modules' checks on it:

- [Accessibility](/accessibility): automated WCAG 2.2 checks with axe-core, links, spelling, readability and linked PDFs.
- [SEO & GEO](/seo): titles, indexing, broken links, structured data and AI crawler access, plus your Search Console and Bing data, AI visibility and agent readiness.
- [Security](/security): once you prove the site is yours, HTTPS, certificates, security headers, cookies, exposed files and email spoofing, plus daily monitoring of subdomains, certificates, look-alike domains and vulnerable libraries.

The scans and checks don't use AI and cost nothing. Problems show on the Dashboard and Today, and can go to the Roadmap or to GitHub or GitLab issues.

## Does it make my site compliant or secure?

No tool can promise that, and Startica doesn't claim it. Automated accessibility checks cover only part of what WCAG asks for, so Startica lists what a person still has to review, and its statement and ACR draft say "Not Evaluated" for anything not checked by hand. Security checks see only the outside of a site: nothing behind a sign-in, and nothing about how the application handles input. Startica's scores are its own measure of progress, and it never calls a site compliant, certified or secure.

## Can I scan any website?

No, only sites you own or are allowed to test. You confirm that when you add a site, and scans are polite (at most one page a second, `robots.txt` respected by default). Security checks need proof: a DNS record, a file on the site, or Search Console. They're defensive: no exploit payloads, form submissions or password guessing.

## What does X cost?

Nothing, unless you add your own X API token. With a token, X bills your X developer account per post read, about $0.005 each. Startica searches X at most every 6 hours and stops at 100 reads a day by default, about $0.50 a day or $15 a month at most. You can change both limits. See [X API (optional, paid)](/credentials/x-api).

## Is posting on LinkedIn safe for my account?

It's the riskiest of the supported sites. LinkedIn's terms prohibit automated commenting and extensions that automate activity. They don't say anything either way about a box that's filled in for you and then submitted by you, which is all Startica does, and LinkedIn enforces its rules more actively than other sites. The decision is yours; if you'd rather not take the risk, copy the reply and post it yourself. See [LinkedIn and its terms](/guides/assisted-posting#linkedin-and-its-terms).

## Does it post for me?

No. You always post yourself, under your own account. On X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse, the desktop app's **Post…** opens the site with your reply or post filled in, and you press the site's own button; Startica never clicks it or submits anything, then saves the link once you've posted. This is in beta; see [Posting with Startica](/guides/assisted-posting). On every channel you can also click **Copy & open thread**, paste the reply yourself, then click **Mark as posted**.

It doesn't send email either: email campaigns from Content Studio are for you to paste into your email tool. There's no scheduling, bulk posting or AI driving a browser. This keeps you in control and keeps your accounts within each platform's rules.

## Does it run ads for me?

No. [Ads](/ads) plans campaigns for Google Ads, Meta and Reddit and writes the ads, then gives you import files and steps. You import them into the platform's ad manager, review them and launch them yourself, and you pay the platform directly. Startica never connects to an ad account, creates a campaign or spends money, and the import files are paused. It can also make the [ad images](/ads/creatives) and, from the spend you copy in from the ad manager, tell you which ads to [stop, keep, scale or rewrite](/ads/results), but you make every change in the ad manager yourself.

## Does it scrape websites or social networks?

No. It reads Reddit through its public RSS feeds, Hacker News through the public Algolia search API, and Bluesky, Mastodon and Discourse forums through their public APIs, all without an account. X is read only through the official X API, with your own token. For LinkedIn and Facebook groups (and X without a token), you paste the post yourself. It does crawl your own product's websites (respecting `robots.txt` unless you turn that off for your own site) and uses your AI provider's web search for research, audits and AI visibility.

## Where is my data?

On your computer, in one folder:

| OS | Data folder |
|---|---|
| macOS | `~/Library/Application Support/Startica` |
| Windows | `%APPDATA%\Startica` |
| Linux | `~/.config/Startica` |

Your products, conversations, drafts and settings are in a SQLite database there. Secrets are encrypted with your OS keychain. There's no Startica server. Data leaves your computer only when Startica calls a service: your AI provider, Claude or OpenAI (prompts include your product brief and the threads being scored or answered), OpenAI's image model when you draw an ad picture, the channels it reads (Reddit, Hacker News, Bluesky, Mastodon servers, Discourse forums and, with a token, the X API), the sites you open in the posting window, the sites you scan, any analytics and search services you connect, a GitHub or GitLab repository if you connect one for issues, free public security data services (crt.sh, OSV.dev, FIRST EPSS and CISA's exploited-vulnerabilities list) for verified sites, and, in an installed copy, GitHub's release files for updates. See [Privacy and security](/concepts/privacy-security) and [Data folder](/reference/data-folder).

## Can I use another LLM provider?

Startica works with two: Claude (Anthropic) and OpenAI. Pick one in the welcome wizard or in **Settings** → **General** → **AI**, and choose which model handles each task there. Other providers aren't supported today. Startica relies on structured outputs, prompt caching and web search, and adding a provider means writing an adapter next to `anthropic.ts` and `openai.ts` in `packages/core/src/ai/`. See [How Startica uses AI](/concepts/ai).

## Can I use it for more than one product?

Yes. Add each product in **Settings** → **Products** with **Add product**, then switch between them with the product switcher in the header. Each product has its own intel, Inbox, roadmap, content, ads, sites and connections. Each product connects its own Google Analytics property, Stripe account and product database.

## Does it support teams or sync between computers?

No. Startica is single-user: one person, one computer, one database. There are no logins, shared workspaces or sync. If you move to a new computer, copy the data folder and enter your secrets again in Settings.

## Why are there no installers to download?

Startica is early, and installers that others can open without warnings need to be code-signed and notarized (an Apple Developer ID and a Windows code-signing certificate), which isn't set up yet. The release pipeline and auto-update are built, but no release has been published. Until then, you build from source, which also lets you see exactly what you're running. You can build an unsigned installer for your own computer with `yarn build:desktop`. See [Install from source](/getting-started/install).

## Why Electron?

All of Startica's logic is Node.js and TypeScript, and it uses Node's built-in SQLite. Electron ships its own Node, so the installed app doesn't need a separate Node install, and the same code runs on macOS, Windows and Linux. Lighter options like Tauri would have meant rewriting the back end or running Node as a separate sidecar.

## Does it work when the app is closed?

Only if it's still running in the tray. Scheduled conversation scans, site rescans, security monitoring, engagement syncs, metric syncs and the weekly re-plan only run while Startica is open. Closing the window keeps it running in the menu bar or system tray. Turn on **Launch at Login** in that icon's menu or in **Settings → General → App** (built copies only) so it starts in the background when you log in. See [Running in the background](/guides/background).

## How do I get help?

Ask in [GitHub Discussions](https://github.com/chriscasper/startica/discussions). Include your OS, how you run Startica (dev mode, browser mode or a built copy), and any error from the System page or the terminal log.

For bugs with clear steps to reproduce, open an issue on [GitHub](https://github.com/chriscasper/startica/issues).

## How do I report a security issue?

Don't open a public issue. Follow the instructions in [SECURITY.md](https://github.com/chriscasper/startica/blob/main/SECURITY.md) in the repository.

## Can I contribute?

Yes. Start with [Contributing](/contributing).
