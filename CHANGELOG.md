# Changelog

All notable changes to Startica are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Running from source is a separate app, "Startica Dev":** its own data folder, keychain entry, posting sign-ins and port (58301), so development never touches an installed Startica's data or keys, and both can run at once.

### Fixed

- **The installed app opening on "This page couldn't load"** when its data folder had keys saved in browser dev mode. The app now moves those keys into the OS keychain when it starts, and an unreadable key no longer breaks the pages that check for one.

### Added

- **Download page** at mystartica.com/download with the latest release's installers for macOS (Apple Silicon and Intel), Windows and Linux, and your system's highlighted.
- **Release notes with download links:** each GitHub release now lists its installers with links and sizes, install notes while builds are unsigned, and the changelog entry. 0.x releases are marked beta.

## [0.0.1] - 2026-10-14

First public release. Installers are unsigned for now, so the documented way in is building from source.

### Added

- **Desktop app** for macOS, Windows and Linux: an Electron shell with a local Next.js server and one SQLite file per install. No account, no Startica server and no telemetry. The server listens on `127.0.0.1` only and requires a per-launch session token; API keys, OAuth tokens and connection credentials are encrypted with the OS keychain. Tray icon, launch at login, and close-to-tray so scheduled jobs keep running.
- **Four modules in one app:** Marketing, SEO & GEO, Accessibility and Security share your products, your sites and one scan per site.
- **Dashboard, Today and Roadmap:** a home page that sums up every module, a short daily list of moves, and an AI-written growth roadmap built from playbooks and re-planned weekly. A background status indicator shows what's running and lets you stop it.
- **Marketing:**
  - **Intel:** researches your site and market and writes a product brief, personas, competitors, keywords and communities to watch, all editable.
  - **Inbox:** finds conversations on Reddit, Hacker News, Bluesky, Mastodon, Discourse forums and, with your own API token, X; or reads a pasted link. Scores them for fit and drafts replies in your voice.
  - **Assisted posting (beta):** opens the site in a separate window with your reply filled in and waits for you to press the site's own button, then saves the link. Startica never posts on its own.
  - **Content Studio:** a voice bank, posts, threads, articles and email sequences per channel.
  - **Ads:** campaign plans and copy for Google, Meta and Reddit, AI-drawn creatives in every size, hand-off files, results from the spend you enter, and scale, keep, rewrite or stop suggestions. Startica never launches ads or spends money.
  - **Analytics:** Google Analytics 4 or Umami, Stripe, and your product's database through a read-only login you create, with per-reply and per-piece attribution through UTM links.
  - Landing page, onboarding, SEO and GEO audits.
- **SEO & GEO:** site health checks for search engines and AI crawlers on the shared scan; clicks, queries and positions from Google Search Console and Bing Webmaster Tools; AI visibility, which asks an AI assistant your customers' questions and shows whether it recommends you; one ranked list of opportunities with drafts; agent readiness; and the sites AI answers cite.
- **Accessibility:** crawls your sites in a real browser and checks every page against WCAG 2.2 A and AA with axe-core; groups issues across pages and ranks what to fix first; AI fix suggestions and an alt text review; a manual checklist, a printable report, an accessibility statement and an ACR draft; spelling, readability, content rules, links and PDFs. Never claims a site is compliant.
- **Security:** proves a site is yours first, then checks HTTPS, certificates, security headers, cookies, exposed files, SPF and DMARC on every scan; monitors subdomains, certificates, look-alike domains, third-party scripts and known-vulnerable libraries; a report mapped to OWASP Top 10; AI help, report import and a disclosure kit. Defensive checks only.
- **Issues in GitHub or GitLab:** open an issue for an accessibility or security problem with your own token; Startica closes it when the problem is fixed.
- **Bring your own AI:** Claude or OpenAI, with task-to-model routing, a monthly budget cap, and every call logged with tokens and cost.
- **First-run setup and demo mode:** a three-step welcome and a Getting started checklist, and a demo with the fictional Fieldnote product in a separate data folder.
- **Releases and updates:** a GitHub Actions workflow builds macOS, Windows and Linux installers into a draft release (signed and notarized once certificates are set up), and the installed app updates itself from GitHub Releases.
- **Developer tooling:** `yarn seed:demo`, eval sets for the scorer, Accessibility and Security, browser and desktop smoke tests, and CI on macOS and Linux.

[Unreleased]: https://github.com/chriscasper/startica/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/chriscasper/startica/releases/tag/v0.0.1
