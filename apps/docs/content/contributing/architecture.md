---
title: Architecture
description: How Startica's Electron shell, local Next.js server, SQLite database and background jobs fit together.
layout: doc
---

Startica is a desktop app made of two processes: an Electron shell that owns the window, the tray and the OS keychain, and a local Next.js server that owns everything else (pages, server actions, the SQLite database and the background job runner). This page explains how they connect and why it's built this way. Read it before you change anything in `apps/desktop`, `apps/desktop-web/src/proxy.ts`, `packages/db/src/client.ts` or the job runner.

## Monorepo layout

Startica is a Yarn 4 workspace (`nodeLinker: node-modules`) with these packages:

| Path | Package | What it holds |
|---|---|---|
| `apps/desktop` | `@startica/desktop` | Electron main process (`main.mjs`): window, tray, launch at login, keychain, the posting window (`posting/`), the accessibility scanner (`scanner/`), auto-update (`updater.mjs`), installers |
| `apps/desktop-web` | `@startica/desktop-web` | Next.js 16.4 app the desktop window shows: pages, server actions, `/api/events`, `/api/activity`, startup |
| `packages/core` | `@startica/core` | Business logic, one folder per area under `src/`: AI client and evals (`ai/`), jobs (`jobs/`), channel adapters (`channels/`), listening and drafting (`distribution/`), recording posts (`posting/`), Content Studio (`content/`), Intel (`intel/`), the roadmap, Today's moves, playbooks and audits (`growth/`), metrics connectors (`metrics/`), the product database setup SQL (`integrations/`), first-run setup state (`setup/`), the Dashboard (`dashboard/`), accessibility scans (`a11y/`), SEO & GEO site health (`seo/`), Search Console and Bing (`search/`), AI visibility (`visibility/`), SEO & GEO opportunities (`opportunities/`), agent readiness (`agents/`), off-site presence (`offsite/`), Security (`security/`), Ads (`ads/`), issue trackers (`trackers/`), private-address checks (`net/`) and the demo seed (`demo/`) |
| `packages/db` | `@startica/db` | SQLite schema (Drizzle), migrations, connection, job queue, secrets, change events |
| `apps/web` | `@startica/web` | The mystartica.com website (simple-engine) |
| `apps/docs` | `@startica/docs` | This documentation site (simple-engine) |
| `packages/web-theme` | `@startica/web-theme` | Shared theme for the two sites |
| `packages/brand` | `@startica/brand` | The Startica logo, for the sites and the desktop app |
| `scripts/` | (root) | Install hook: `ensure-electron.mjs` |

`packages/core` and `packages/db` export their TypeScript source directly (`"./*": "./src/*.ts"`), so imports look like `@startica/core/jobs/runner` and `@startica/db/queue`. Next.js compiles them through `transpilePackages`; scripts run them with `tsx`.

## Processes

```text
Electron main process (apps/desktop/main.mjs)
 ├─ window (BrowserWindow, sandboxed) → http://127.0.0.1:58300  (cookie startica_session = launch token)
 ├─ tray / menu-bar icon, launch at login, single-instance lock
 ├─ OS keychain (safeStorage): encrypts and decrypts secrets on request over IPC
 ├─ posting window (posting/window.mjs, on request over IPC): Startica bar + site view (persist:posting)
 ├─ accessibility scanner (scanner/scanner.mjs, on request over IPC): up to 2 hidden scan windows (in-memory "scan" session)
 └─ child process: the app's Electron binary (macOS: its Helper) with ELECTRON_RUN_AS_NODE=1
      └─ Startica server (apps/desktop-web/scripts/serve.mjs in dev, serve-prod.mjs when packaged)
           ├─ Next.js: pages, server actions, /api/events (SSE), /api/activity
           ├─ proxy.ts: rejects any request without the launch token (no exceptions)
           ├─ instrumentation.ts → lib/startup.ts: open and migrate SQLite, set the cipher,
           │                                     create the workspace, pick the scanner backend,
           │                                     start the job runner
           └─ job runner: one loop per queue + croner schedules (only while the app is open)
```

### Why a child process

Next.js's dev server starts helper processes using the current executable. Inside Electron's main process, the current executable is the Electron app, so every helper would start another copy of Startica. Instead, `main.mjs` forks the server with `ELECTRON_RUN_AS_NODE=1`, which makes the Electron binary behave as plain Node. On macOS it forks the helper binary (`Startica Helper`, or `Electron Helper` in dev) rather than the main one: the main binary would register with the Dock as a second, bouncing "exec" app, while the helper is marked a background element (`LSUIElement`). The server and all of its helpers run as Node 24 (the version bundled with Electron), in development and in the installed app, so users don't need a separate Node install.

The child gets `STARTICA_ELECTRON=1`, `STARTICA_DATA_DIR` (Electron's `userData` folder unless you set it) and an IPC channel. When the server is listening, it sends `{ type: "ready", url, token }` to the parent. If the server exits unexpectedly, the app shows an error and quits.

> [!WARNING]
> Electron's `RunAsNode` fuse must stay enabled. The server child depends on it.

## The launch token and proxy

Startica has no login. Instead:

1. The server binds to `127.0.0.1` only, so nothing on the network can reach it.
2. At startup, `server.mjs` (or `serve-prod.mjs`) generates a random 32-byte token and stores it in `STARTICA_SESSION_TOKEN`.
3. The Electron main process receives the token over IPC and sets it as the `startica_session` cookie (httpOnly, `sameSite: strict`) for the window's session.
4. `apps/desktop-web/src/proxy.ts` (Next.js 16's replacement for middleware) checks every request. It accepts the cookie, or a `?token=` query parameter that it swaps for the cookie and strips from the URL. The comparison uses `timingSafeEqual`. Anything else gets a 401.

This keeps other programs and websites on the same machine out of the server. Without `STARTICA_SESSION_TOKEN` the proxy answers 503, which is why you always start the server through `scripts/serve.mjs` and never with `next dev` directly.

In browser mode (`yarn dev:desktop-web`) there's no Electron to set the cookie, so the server prints a one-time `http://127.0.0.1:58301/?token=…` link instead.

## No sign-ins

Startica has no OAuth sign-ins, so there are no callback routes and no path in `proxy.ts` that skips the token. Every connection uses a credential the user pastes: GA4 and Search Console use service account keys, Stripe a restricted key, Bing and Umami an API key (or `username:password` for older self-hosted Umami). The product database uses SQL the user runs themselves (`packages/core/src/integrations/product-db-setup.ts` writes it) and a read-only login that `checkReaderConnection()` in `packages/core/src/metrics/product-db.ts` checks before anything is saved. See [Product database](/credentials/supabase).

A second launch of the app focuses the existing window instead of starting a second server (Electron's single-instance lock).

## Secrets

Secrets (the Anthropic and OpenAI keys, the X API token, issue tracker tokens, connection credentials such as the GA4 service account key and the product database's read-only connection URL) are stored encrypted in the `secrets` table through `packages/db/src/secrets.ts`. The encryption depends on where the server runs:

- **In the desktop app** (`STARTICA_ELECTRON=1`): `ipcCipher()` sends each encrypt or decrypt request to the Electron main process, which uses `safeStorage` (macOS Keychain, Windows DPAPI, Linux libsecret). Ciphertexts start with `ss1.`.
- **Outside Electron** (browser mode, tests, scripts): `fileKeyCipher()` uses AES-256-GCM with a random key in `dev-secret.key` in the data folder.

A key saved in the desktop app can't be decrypted in browser mode. The other way round, the desktop app moves browser-mode secrets into the keychain on startup (`adoptFileKeySecrets`, when `dev-secret.key` is in the data folder), so a data folder used in development keeps working in the installed app. Pages check whether a key is saved with `hasSecretNamed`, without decrypting it, so an unreadable secret fails only the feature that uses it, not the page.

## SQLite: one connection per process

The database is a single file, `startica.db`, opened with Node's built-in `node:sqlite` and used through Drizzle's `sqlite-proxy` driver (`packages/db/src/client.ts`). There are no native modules, so nothing needs rebuilding per platform or Electron version.

- **One connection per process, shared through `globalThis`.** Next.js bundles modules more than once, so a module-level variable would give each bundle its own connection, and separate connections on one thread can deadlock each other. `openDatabase()` stores the connection under `Symbol.for("startica.db")` and every copy of the module finds it there.
- **Pragmas:** WAL journal, `synchronous = normal`, foreign keys on, `busy_timeout = 5000`.
- **Transactions take a process-wide lock.** Statements run synchronously, but code around them is async, so another request could otherwise slip a query into someone else's open transaction. `transaction(fn)` waits for the lock, runs `begin immediate`, and tracks "inside a transaction" with an `AsyncLocalStorage` (also shared through `globalThis`). Statements outside the transaction wait for the lock. Nested `transaction()` calls join the outer one.
- **Keep transactions short and local.** No network calls, no AI calls inside `transaction()`. Everything else in the process waits while it's open.
- **Migrations** live in `packages/db/migrations` and are applied at startup by `migrateDatabase()`.

Pages and server actions get the database through `db()` in `apps/desktop-web/src/lib/dal.ts`. It calls Next's `connection()` (marking the read as request-time work for Cache Components) and makes sure startup has run.

## Startup

`apps/desktop-web/src/instrumentation.ts` runs once when the Next.js server starts (never during `next build`, so a build can't open anyone's database). It calls `start()` in `src/lib/startup.ts`, which runs once per process:

1. Open the database at `<data folder>/startica.db` and apply migrations (from `STARTICA_MIGRATIONS_DIR`).
2. Set the secret cipher: `ipcCipher()` in Electron, `fileKeyCipher()` otherwise.
3. Create the workspace and its default AI model routing on first launch (`ensureWorkspace()`).
4. Start the job runner, unless `STARTICA_DISABLE_JOBS=1`.

## Background jobs

AI calls, network fetches and anything slow run as jobs, never inside a request. The queue is a `jobs` table (`packages/db/src/queue.ts`), and the runner (`packages/core/src/jobs/runner.ts`) lives in the server process:

- **One loop per queue.** A 15-minute Reddit scan never holds up drafting. Jobs within one queue run one at a time.
- **Leases.** `claim()` flips the next ready job to `running` and sets `locked_until` to now plus the job's `visibilityTimeoutSeconds`. If the app quits mid-job, the lease expires and the job can be claimed again on the next launch.
- **Retries.** On failure the job is retried after 1, 4, 9… minutes until `maxAttempts`, then marked `failed`. A successful job is deleted from `jobs`.
- **History.** Every attempt writes a `job_runs` row, shown on the System page. Every AI call writes an `ai_runs` row linked to its job run.
- **Schedules** use [croner](https://github.com/Hexagon/croner) in local time: listening hourly at :07, engagement every 6 hours at :17, metrics daily at 08:15, security monitoring daily at 06:47, due site scans hourly at :37, the roadmap re-plan on Mondays at 07:00, the weekly analytics summary on Mondays at 08:45 (after that morning's metrics sync), and AI visibility on Mondays at 09:30 (only for products with **Run every week** on). The list is `SCHEDULES` in `packages/core/src/jobs/runner.ts`.

Jobs only run while the app is open. That's why closing the window keeps Startica running in the tray. See [Add a background job](/contributing/background-job) and the [jobs reference](/reference/jobs).

## Live updates

There's no polling. Every insert, update or delete that goes through the database layer calls `noteWrite()` (`packages/db/src/events.ts`), which extracts the table name and emits one debounced change event per table (50 ms). Writes to `secrets` and to tables starting with `__` are skipped.

`/api/events` streams those events as server-sent events, with a keep-alive ping every 25 seconds. On the client, the `LiveRefresh` component (`src/components/app/live-refresh.tsx`) takes a list of tables, listens on an `EventSource`, and calls `router.refresh()` when one of them changes. That's how a page updates when a background job finishes.

## The posting window

[Posting with Startica](/guides/assisted-posting) (beta) needs a real browser signed in to the site (X, Hacker News, Reddit, LinkedIn, Bluesky, the user's Mastodon server or a Discourse forum), so it lives in the Electron process, not the server:

1. **Post…** calls a server action that builds a `PostingRequest` (`packages/core/src/posting/requests.ts`: site, reply or new post, the page to open, the text; `postingContext()` in `apps/desktop-web/src/lib/posting.ts` adds the user's Mastodon server, the product's first watched Discourse forum, and whether replies on X are tracked, which is only with an X API token) and sends it to the parent process as `{ type: "posting-open" }` over the child-process IPC channel (`apps/desktop-web/src/lib/posting.ts`). Outside Electron there's no channel, so the button is hidden.
2. `apps/desktop/posting/window.mjs` opens a `BaseWindow` with two views: the Startica bar (`bar.html`, whose only bridge is `bar-preload.cjs`, exposing fill, copy, save link and close) and the site (a sandboxed `WebContentsView` on the persistent partition `persist:posting`, with no preload).
3. After each page load, the site's fixed fill-in script from `posting/sites.mjs` runs with `executeJavaScriptInIsolatedWorld`. It fills the fields and returns; it never submits. Rich-text editors (LinkedIn, Bluesky, Discourse's rich mode) ignore scripted values, so for those the script only focuses the editor and returns `insert: true`, and the window types the text with Electron's `webContents.insertText()`. A site's allowed hosts are a fixed list, or come from the request for sites on any domain (Mastodon, Discourse). `SIGN_IN_HOSTS` in `sites.mjs` adds the Google, Apple, GitHub, GitLab, Discord and Microsoft sign-in pages for every site.
4. The window watches the site view's network traffic through the Chrome DevTools Protocol for the request the site's own button sends, and reads the new post's link from the response (for Hacker News, from the HN API after the redirect). Sites with `needsBody` (Bluesky) also read the request body to tell a new post from a like. A Discourse post held for moderation is reported as pending, without a link. It reports `{ type: "posting-result" }` to the server.
5. The server records it with `recordPostingResult()` (`packages/core/src/posting/record.ts`), the same code **Mark as posted** uses (idempotent), and answers `posting-recorded` so the bar can confirm.

The rules for this code are in [Working rules](/contributing/working-rules#product-rules). The full design is in `ARCHITECTURE.md` at the repo root, section 8.4.

## The accessibility scanner

[Accessibility](/accessibility) scans open each page in a real Chromium browser and run [axe-core](https://github.com/dequelabs/axe-core) in it. The scan logic lives in the server; only the browser part is swappable.

### Core code

`packages/core/src/a11y/`:

| File | What it does |
|---|---|
| `urls.ts` | URL normalization, same-site checks, include and skip patterns (`matchesPattern()`, `DEFAULT_EXCLUDES`), private-host and request checks (`scanRequestAllowed()`) |
| `discovery.ts` | Reads `robots.txt` and sitemaps (indexes followed, up to 10 sitemaps) with the `StarticaAccessibilityScan/0.1` user agent |
| `scanner.ts` | The `ScannerBackend` interface (`scan(request)` returns a `ScanResponse`), `setScanner()` and the in-page script (`runScript`), which returns axe's results, the page's links and its `SeoFacts` |
| `results.ts` | Maps axe tags to WCAG criteria and levels, fingerprints elements into issue groups, and computes page and site scores |
| `scan.ts` | The two jobs: `runSiteScan()` (crawl, check, record, then mark issues new or fixed) and `runPageCheck()` |
| `sites.ts` | Adding, editing and removing sites, and starting scans and checks |
| `playwright-backend.ts` | The Playwright backend for browser development mode and tests |

### Backends

`startScanner()` in `apps/desktop-web/src/lib/scanner.ts` picks a backend once at startup:

| Where the server runs | Backend |
|---|---|
| Desktop app (`STARTICA_ELECTRON=1` with an IPC channel) | Electron: asks the main process to open the page |
| Browser development mode | Playwright's Chromium, if installed |
| [Demo mode](/guides/demo-mode) (`STARTICA_DEMO=1`) | None: scans are off |

With no backend, the Accessibility screens say scans aren't available and disable the scan buttons.

### The Electron scanner

The Electron backend uses the same child-process IPC channel as the keychain and the posting window:

1. For each page, the server sends `{ type: "scan-page", requestId, request }`. The request carries the URL, the timeout, the axe-core source and the in-page script that runs axe and collects the page's links. The server reads axe-core (pinned to exactly 4.14.0) from `node_modules` at run time; it's listed in Next's `serverExternalPackages` and the standalone tracing includes, so it ships with the packaged app.
2. `apps/desktop/scanner/scanner.mjs` loads the page in a hidden `BrowserWindow` (sandboxed, context isolation, no Node.js) on the in-memory partition `scan`. It keeps at most 2 windows and replaces them every 50 pages. The session refuses permission requests, cancels downloads, denies popups, keeps navigation on the site, and blocks requests to Startica's own port and to private-network addresses unless the site itself is local. Its user agent is Chromium's with the Electron and Startica tokens removed and `StarticaAccessibilityScan/0.1` added.
3. After the page loads, axe-core and the in-page script run with `executeJavaScriptInIsolatedWorld` in world 1088 (the posting window uses 1077).
4. The main process answers `{ type: "scan-result", requestId, response }`, or `error` with a reason (for example a timeout). A hung or broken window is replaced.

### Jobs

| Job | Queue | Lease | Notes |
|---|---|---|---|
| `site_scan` | its own | 4 h | A full scan. Pages are recorded in `site_pages` as they're found and checked, so a scan interrupted by quitting resumes where it stopped when the lease expires. Max 1 attempt. |
| `site_page_check` | its own | 1 h | **Check a page** and the recheck buttons. Its own queue, so it never waits behind a full scan. Max 1 attempt. |

Two pages are checked at a time, with at most one page load a second per site.

### Tables

Migration `0003_accessibility` adds:

| Table | Holds |
|---|---|
| `sites` | One row per site: product, start address, page cap, patterns, options, target score, latest score |
| `site_scans` | One row per scan: `scope` (`full`, `page`, `group`), status, counts, score, new and fixed issues, error |
| `site_pages` | Every page found: address, `state` (`queued`, `done`, `skipped`, `failed`), reason, score, title, language |
| `a11y_issue_groups` | One rule failing on one fingerprinted element, across pages: impact, WCAG criteria, status (open or fixed), counts |
| `a11y_occurrences` | Each failing (or needs-review) element on each page: selector, HTML snippet, failure summary |

See [Testing](/contributing/testing#accessibility-stand-in-site) for the stand-in site and tests.

## SEO & GEO site health

[Site health](/seo/site-health) runs on the accessibility scan: the same jobs, the same page loads, the same `sites` and `site_pages`. There's no second crawl. The full design is in `ARCHITECTURE.md` at the repo root, section 10.

### How it hooks into the scan

1. The in-page script (`runScript` in `a11y/scanner.ts`) also returns `seo`: the meta description, canonical, robots meta tag, `h1` texts, Open Graph title and image, the raw text of each JSON-LD block and a word count (`SeoFacts`).
2. Both backends add the main document's `X-Robots-Tag` header to the `ScanResponse` as `xRobotsTag`: `playwright-backend.ts` from the response headers, and `apps/desktop/scanner/scanner.mjs` from the scan session's `webRequest.onHeadersReceived`, per window.
3. `storePageResult()` in `a11y/scan.ts` calls `storePageSeo()`, which stores the page's facts and links and replaces its page-level findings and score, in the page's own transaction.
4. `finishScan()` calls `finishSeo()` after every scan that checked at least one page (full scan, page check, issue recheck, or a stopped scan). It replaces the site-level findings, fetches `robots.txt` and `llms.txt`, and recomputes the page and site scores.
5. A full scan resets `site_pages.in_sitemap` and sets it again from the sitemap it reads, so orphan and noindex-in-sitemap checks always use the current sitemap.

### Core code

`packages/core/src/seo/`:

| File | What it does |
|---|---|
| `rules.ts` | `SEO_RULES`: every check's title, severity (`high`, `medium`, `low`, `info`), category, why and fix, shown as written in the UI; `SEVERITY_WEIGHT` (15, 7, 2) |
| `checks.ts` | Page-level checks (`pageFindings()`): title and description lengths, `h1`, `noindex` from the robots meta tag or `X-Robots-Tag`, canonical elsewhere; `readStructuredData()` with the required properties per JSON-LD type; `duplicateGroups()`; `llmsTxtValid()` |
| `robots.ts` | `robots.txt` as RFC 9309 reads it: `parseRobots()`, `robotsAllows()` (the crawler's own group, else `*`; longest rule wins; `Allow` wins ties; `*` and `$`) |
| `crawlers.ts` | `AI_CRAWLERS` (token, operator, purpose: `training`, `search` or `user`), `PURPOSE_LABEL`, and `AI_CRAWLERS_CHECKED`, the date the list was last checked. Update the date when you edit the list. |
| `site.ts` | `storePageSeo()`, `finishSeo()` (duplicates, broken links, broken canonicals, orphans, missing sitemap, AI crawler access, `llms.txt`, home page structured data and social image), `seoPageScore()`, and `siteSeoFindings()` for the screens |
| `seo.test.ts` | Unit tests for `robots.txt`, the page checks, JSON-LD and the page score |

Each finding has a `group_key`, so one problem shared by several pages (one duplicate title, one broken address, one JSON-LD type missing properties) is one group. Site-level findings without a page (`ai-search-blocked`, `sitemap-missing`, `llms-missing` and so on) have no `page_id`.

`finishSeo()` makes no request for reserved hostnames (`.example`, `.test`, `.invalid`), so the demo's `fieldnote.example` never reaches the network.

The screens are in `apps/desktop-web/src/app/(app)/seo/`: `page.tsx` (Overview), `health/page.tsx` (Site health), `data.ts` (`seoRuleGroups()`, findings grouped by rule then group) and `shared.tsx`. They reuse the Accessibility site picker data, scan buttons and add-site form.

### Tables

Migrations `0005_seo_site_health` and `0006_ai_access` add:

| Table or column | Holds |
|---|---|
| `seo_findings` | One row per finding: site, page (null for site-wide ones), `rule`, `severity`, `group_key`, `detail` (JSON for the UI: lengths, the duplicate title, the broken link's status and where it's linked from, which JSON-LD block, which crawlers) |
| `site_pages.seo` | The page's search facts (`PageSeo`: description, canonical, robots, `xRobotsTag`, `h1`, Open Graph, structured-data types, word count) |
| `site_pages.links` | The page's links, normalized, up to 300 (for broken links and orphans) |
| `site_pages.in_sitemap` | Whether the last full scan's sitemap listed the page |
| `site_pages.seo_score` | The page's site health score |
| `sites.seo_score`, `site_scans.seo_score` | The site's site health score, now and at each scan |
| `sites.ai_access` | Each AI crawler's access, the `llms.txt` status (`present`, `invalid`, `missing`) and when they were checked |

To add a check: add the rule to `SEO_RULES`, produce it in `pageFindings()` (page-level) or `finishSeo()` (site-level, and add it to `SITE_RULES` there so it's replaced on each finish), add a detail line in `health/page.tsx` if it has details, and add a planted case to the stand-in site and the expected findings in `a11y/scan.test.ts`. Document it in [Site health](/seo/site-health#every-check).

## Issue trackers

A product can connect one GitHub or GitLab repository, where Startica opens an issue per accessibility issue group or security finding (see [Issues in GitHub or GitLab](/accessibility/issue-trackers)). The code is in `packages/core/src/trackers/`:

| File | What it does |
|---|---|
| `client.ts` | The `TrackerClient` interface (`checkAccess()`, `createIssue()`, `comment()`, `setState()`) and its two implementations, using `fetch` with a 20-second timeout. GitHub: REST with `Authorization: Bearer <token>` and `X-GitHub-Api-Version: 2022-11-28`; `GET /repos/{repo}`, `POST /repos/{repo}/issues`, `POST …/issues/{n}/comments`, `PATCH …/issues/{n}` (`state_reason: completed` when closing). GitLab: `PRIVATE-TOKEN` header on `/api/v4/projects/{url-encoded path}`; `POST …/issues`, `POST …/issues/{iid}/notes`, `PUT …/issues/{iid}` with `state_event`. |
| `trackers.ts` | Saving and checking a tracker (`saveTracker()`, `trackerBaseUrl()`), the issue's title and Markdown body (`a11yIssueText()`, `securityIssueText()`), **Create issue** (`createIssueForGroup()`, `createIssueForSecurityFinding()`) and the `tracker_sync` job (`runTrackerSync()`, queued by `queueTrackerSync()` at the end of `finishScan()` in `a11y/scan.ts` and after `security_monitor`) |
| `standin.mjs` | Stand-in GitHub and GitLab APIs for tests. See [Testing](/contributing/testing#issue-tracker-stand-in). |

Migration `0004_issue_trackers` adds two tables:

| Table | Holds |
|---|---|
| `issue_trackers` | One row per product: provider, API base address, repository, `secret_id` of the token, labels, `auto_min_impact`, `auto_min_security` (added in Security S2), `close_when_fixed`, status and last error |
| `tracker_issues` | One row per repository issue Startica opened: tracker, `source_kind` (`a11y` or `security`) and `source_id` (the issue group or security finding), number, address and state. Unique on tracker, kind and source, so a finding never gets two issues. |

The token is a secret (`issue-tracker-<tracker id>`) and is only ever sent to the tracker's base address. The base address must be https, or http for a private host (`isPrivateHost()` from `a11y/urls.ts`). `tracker_sync` runs on its own queue with a 600-second lease and 2 attempts, and opens at most `AUTO_CREATE_PER_RUN` (10) issues a run, accessibility and security together.

## Security

The Security module runs on the accessibility scan too, but only for sites whose ownership is verified. Page checks run on the pages the scan already loads; site checks (HTTPS, certificates, exposed files, security.txt, email) run once per full scan. The code is in `packages/core/src/security/`: `rules.ts`, `checks.ts`, `probes.ts`, `verify.ts`, `findings.ts`, `report.ts`, exposure monitoring in `monitor.ts` (the `security_monitor` job), AI help in `ai.ts` and the disclosure kit in `disclosure.ts`. The full design is in `ARCHITECTURE.md` at the repo root, section 11. User docs: [Security](/security).

## Ads

Ads lives in the Marketing module: campaign plans and copy (`ad_plan`, `ad_copy`), creatives drawn by the `image` task and laid out by HTML templates, hand-off files, and results from spend you enter plus GA4 or Umami. Startica never creates campaigns or spends money. The code is in `packages/core/src/ads/`; the creative renderer in the desktop app is `apps/desktop/renderer/render.mjs`. The full design is in `ARCHITECTURE.md` at the repo root, section 8.6. User docs: [Ads](/ads).

## Dashboard

The Dashboard (`/dashboard`, where the app opens) sums up every module for the active product. `dashboardSummary()` in `packages/core/src/dashboard/summary.ts` only reads: it never builds Today's moves or starts work. The screens are listed in `ARCHITECTURE.md` at the repo root, section 13. User docs: [Dashboard](/guides/dashboard).

## Packaging

`yarn build:desktop` runs `apps/desktop/scripts/build.mjs`:

1. `next build` with `output: "standalone"` into its own build folder, `.next-desktop` (set through `STARTICA_STANDALONE=1` and `STARTICA_NEXT_DIST`). It uses its own tsconfig so a running dev server can't break the build.
2. Assemble `apps/desktop/build/server`: the standalone server, its static files, `serve-prod.mjs` and the database migrations.
3. Run electron-builder: DMG and ZIP on macOS, NSIS on Windows, AppImage and `.deb` on Linux, into `apps/desktop/dist`.

electron-builder strips `node_modules` from extra resources, so an `afterPack` hook (`scripts/after-pack.cjs`) copies the assembled server into the app's `resources/server` folder. In the installed app, `main.mjs` starts `resources/server/apps/desktop-web/serve-prod.mjs`, which sets the same environment that `server.mjs` sets in development and then loads Next's standalone `server.js`.

Auto-update is `apps/desktop/updater.mjs`, which uses `electron-updater` against the repository's GitHub releases. See [Releases](/contributing/releases) for building installers and publishing releases.

## Data folder

Dev runs are a separate app, **Startica Dev**. When Electron isn't packaged, `main.mjs` sets the app name and `userData` to "Startica Dev", so `yarn dev:desktop` gets its own data folder, keychain entry ("Startica Dev Safe Storage"), single-instance lock, posting sign-ins and port (58301). An installed Startica (port 58300) never sees dev data or keys, and you can run both at once.

The server's data folder is `STARTICA_DATA_DIR`, which the desktop app always sets to its `userData`. Without it (browser mode, scripts), `dataDir()` in `packages/db/src/paths.ts` uses the dev folder, or the installed app's when `STARTICA_PACKAGED=1`:

| OS | Dev runs | Installed app |
|---|---|---|
| macOS | `~/Library/Application Support/Startica Dev` | `~/Library/Application Support/Startica` |
| Windows | `%APPDATA%\Startica Dev` | `%APPDATA%\Startica` |
| Linux | `$XDG_CONFIG_HOME/Startica Dev` (usually `~/.config/Startica Dev`) | `$XDG_CONFIG_HOME/Startica` |

`STARTICA_DATA_DIR` overrides it. See [Data folder](/reference/data-folder).
