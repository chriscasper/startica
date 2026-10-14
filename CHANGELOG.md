# Changelog

All notable changes to Startica are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Four modules in one app.** Startica now covers more than marketing: **Accessibility**, **SEO & GEO** and **Security** sit beside Marketing in the sidebar, each with its own color, and share your products, your sites and one scan per site.
- **Accessibility:** crawls your sites in a real browser and checks every page against WCAG 2.2 A and AA with axe-core; groups the same problem across pages and ranks what to fix first; a score with history; AI fix suggestions, an alt text review and a second opinion on items that need review; a manual checklist, a printable report, an accessibility statement and an ACR draft; links, spelling, readability, your own content rules and linked PDFs. Never claims a site is compliant.
- **SEO & GEO:** site health checks for search engines and AI crawlers on the same scan; clicks, queries and positions from Google Search Console and Bing Webmaster Tools; AI visibility, which asks an AI assistant your customers' questions and shows whether it recommends you; one ranked list of opportunities with drafts to copy; agent readiness; and the sites AI answers cite.
- **Security:** proves a site is yours (DNS record, file or Search Console), then checks HTTPS, certificates, security headers, cookies, exposed files, SPF and DMARC on every scan; findings with a score and recheck; a report mapped to OWASP Top 10 and related SOC 2 and ISO 27001 controls; monitoring of subdomains, certificates, look-alike domains, third-party scripts and known-vulnerable libraries; AI help, report import and a disclosure kit. Defensive checks only.
- **Issues in GitHub or GitLab:** open an issue for an accessibility or security problem, by hand or after each scan, with your own token; Startica closes it when the problem is fixed.
- **OpenAI as a second AI provider:** use Claude or OpenAI, chosen in the welcome wizard or Settings, with the same budget cap and logging.
- **Umami analytics** as an alternative to Google Analytics.
- **Posting with Startica (beta):** a **Post…** button opens the site in a separate window, fills in your reply or post, and waits for you to press the site's own button; Startica then saves the link. Works for Reddit, Hacker News, X, LinkedIn, Bluesky, Mastodon and Discourse forums, in the desktop app. Startica never presses the button for you.
- **New listening channels:** Bluesky keyword search, Mastodon hashtags, and Discourse forums, all through public APIs with no account. Pasted Bluesky, Mastodon and Discourse links are read automatically, and replies to your posts there are tracked for two weeks.
- **X search (optional, paid):** add your own X API bearer token to find X posts for your top keywords, with a scan interval and a daily read cap to keep costs down.
- **First-run setup:** a three-step welcome (connect AI, describe your product, a few extras) that starts building intel right away, then a *Getting started* checklist on Today. Setup can be rerun from Settings.
- **Demo mode:** look around with the fictional Fieldnote product in a separate data folder, with scans, AI and posting off. Your own data is untouched.
- **Email campaigns** in Content Studio: a 3–5 email sequence with subjects, preview text and send days, to paste into your email tool. Startica never sends email.
- **Ad plans use your research:** Intel's keywords and the communities you watch are passed to the ad plan, which starts its targeting from them.
- **Creatives warn about long words:** a creative says which sizes had to shrink the words a lot, or cut them off.
- **Ad creatives:** each campaign gets a Creatives page. Describe a picture and OpenAI's image model draws it with your key (the cost is shown first), or upload your own; a template adds the headline, button, price and logo and renders every size the platform takes, offscreen. Startica can suggest three ideas from your ads.
- **Ad results:** enter spend from the ad manager and see visits, signups, cost per visit and cost per result for each ad (from GA4 or Umami), with a weekly read-out.
- **Dashboard:** Startica now opens on a Dashboard that sums up every module for the active product: what needs you (broken or risky things first, then waiting work), marketing numbers, and each site's accessibility, search and security status, with AI spend and failed jobs.
- **Background status indicator:** while anything runs in the background, an indicator at the top right of every page says so. Hover over it to see each task, how long it has run, why it is running (scheduled, or what started it) and stop it.
- **What to do next for ads:** scale, keep, rewrite or stop suggestions per ad, from a target cost per result; the most pressing one shows on Today, and any can go to the Roadmap or be rewritten with AI.
- **Automatic updates:** the installed app checks GitHub Releases 30 seconds after launch and every 6 hours, downloads updates in the background and offers to restart. The tray menu has **Check for Updates…** and a switch to turn automatic checks off.
- **Release builds:** a GitHub Actions workflow builds macOS (Apple Silicon and Intel), Windows and Linux installers and attaches them to a draft release, signed and notarized when the certificates are set up.

## [0.1.0] - 2026-10-09

First open-source release. Startica is built from source for now (no signed installers yet).

### Added

- **Desktop app** for macOS, Windows and Linux: Electron shell with a local Next.js server, one SQLite file per install, no account and no telemetry. Tray/menu-bar icon, launch at login, and close-to-tray so scheduled jobs keep running.
- **Security without logins:** the server listens on `127.0.0.1` only and requires a per-launch session token; secrets (API keys, OAuth tokens, connection credentials) are encrypted with the OS keychain.
- **Intel:** crawls your site, researches the market with Claude's web search, and writes a product brief, personas, competitors, keywords and communities to watch. Everything is editable, and your edits survive rebuilds.
- **Inbox:** finds conversations on Reddit (public RSS feeds) and Hacker News (Algolia), or from a pasted link (X, LinkedIn, Facebook groups), scores them with Claude Haiku, and drafts replies in your voice. Near-duplicates are archived without an AI call. Copy, open, post it yourself and mark it as posted; Startica never posts on its own.
- **Content Studio:** voice bank (paste samples or import from a Reddit or HN user), style guides distilled per voice, and channel-ready posts, threads and articles. Posted pieces are tracked like replies.
- **Analytics:** Google Analytics 4 (Connect with Google), Stripe (restricted key) and your product's database (Connect with Supabase plus a read-only metric builder, or any Postgres URL), with per-reply and per-piece attribution through UTM links. Manual metrics for anything else.
- **Roadmap and Today:** an AI-written growth roadmap across the funnel stages, built from eight playbooks and re-planned weekly; landing, onboarding, SEO and GEO audits; and a short daily list of moves.
- **Cost control:** task-to-model routing editable in Settings, a monthly AI budget cap, and every Claude call logged with tokens and cost on the System page.
- **Developer tooling:** `yarn seed:demo` loads a fictional demo product (Fieldnote); `yarn eval score` runs the scorer's eval set; browser and desktop smoke tests; CI on macOS and Linux.

[Unreleased]: https://github.com/chriscasper/startica/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/chriscasper/startica/releases/tag/v0.1.0
