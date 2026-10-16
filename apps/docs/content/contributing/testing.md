---
title: Testing
description: How Startica is tested, from Vitest unit tests on real SQLite to the browser and desktop smoke tests and CI.
layout: doc
---

Startica has three layers of tests: unit tests (Vitest in the packages, `node --test` in `apps/desktop`), a browser smoke test that drives the real server, and a desktop smoke test that launches the real Electron app. All three run against isolated data, so they never touch your Startica database. Every pull request must pass the first two; changes to the Electron shell must pass the third.

## The checks

```bash
yarn typecheck && yarn lint && yarn test && yarn smoke:desktop
```

| Command | What runs |
|---|---|
| `yarn typecheck` | `tsc --noEmit` in every workspace; in `apps/desktop-web`, `next typegen` first so route types exist |
| `yarn lint` | ESLint (Next.js config) in `apps/desktop-web`. Other workspaces have no lint config yet. |
| `yarn test` | Vitest in `packages/core` and `packages/db`, and `node --test` for the posting window in `apps/desktop` |
| `yarn smoke:desktop` | The browser smoke test (despite the name, it doesn't start Electron) |

## Unit tests (Vitest)

Tests sit next to the code as `*.test.ts` files in `packages/core/src` and `packages/db/src`. Run them all with `yarn test`, or one package in watch mode:

```bash
yarn workspace @startica/core vitest
yarn workspace @startica/core vitest src/channels
```

### Real SQLite, not mocks

Database tests use a real SQLite file in a temporary folder with the real migrations. The setup from `packages/core/src/jobs/runner.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, migrateDatabase, openDatabase } from "@startica/db/client";

let workspaceId = "";

beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-core-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
});
afterAll(() => closeDatabase());
```

The connection is per process, so each test file opens its own database and closes it at the end. Tests that store secrets need a cipher first: call `setCipher(fileKeyCipher(<path in the temp folder>))` from `@startica/db/secrets`.

### No network, no AI

Unit tests must not call Claude, OpenAI, Reddit, Hacker News, Bluesky, Mastodon, Discourse, X or any other service. Structure code so the parts worth testing are pure functions:

- **Channel adapters:** save a real response as a fixture in `packages/core/src/channels/__fixtures__/` and test the parser against it (`parseRedditFeed()` with `reddit-new.atom`), or test the pure helpers with small hand-built objects (`open-networks.test.ts` covers Bluesky, Mastodon and Discourse link parsing, post mapping and `channelFromUrl()`). Anonymize usernames in fixtures.
- **Adapters with state:** stub `fetch` with `vi.stubGlobal` and use a temporary database. `x.test.ts` does this to check the X adapter's rationing: no request without a token, nothing within the scan interval, `since_id` on the next scan, and the daily read cap.
- **Posting requests:** `posting/posting.test.ts` checks which replies and pieces get a posting request (character limits, threads, a missing Mastodon server or Discourse forum) and the pages they open. `content/campaign.test.ts` checks that email campaigns round-trip through their text sections.
- **First-run setup:** `setup/setup.test.ts` checks that a new workspace starts with nothing done, that the wizard and checklist flags are remembered, and that the Getting started checklist pre-selects the first 5 suggestions listening can read, in intel's order.
- **Metrics connectors:** test the summarizing function with hand-built API objects and a fixed `now` (`summarizeSubscriptions()` in `metrics/metrics.test.ts`).
- **Product database:** `integrations/integrations.test.ts` checks the setup SQL (identifiers that could inject SQL are refused), the reader's connection URL built from a pasted string, keeping the saved password, refusing logins that can write, the error messages and SSL. If `initdb` is installed (Homebrew or the usual Linux and macOS folders), it also starts a throwaway Postgres on port **58394**, runs the generated SQL on a Supabase-like database and checks that `startica_reader` reads only the daily totals; without Postgres those tests are skipped.
- **Accessibility:** `a11y/a11y.test.ts` covers the pure parts: URL normalization, which URLs a crawl may open, which requests a scanned page may make (never Startica's port; private addresses only from a local site), sitemaps and sitemap indexes, mapping axe tags to WCAG criteria and levels, element fingerprints, and the score. `a11y/scan.test.ts` is the exception to "no network": it runs real scans against the local [stand-in site](#accessibility-stand-in-site) with Playwright's Chromium, and skips itself if Chromium isn't installed. See below.
- **SEO & GEO:** `seo/seo.test.ts` covers the pure parts: `robots.txt` groups and rule precedence (a crawler's own group, else `*`; the longest rule; case-insensitive names), the page checks (missing and overlong basics, `noindex` in the sitemap from the meta tag or `X-Robots-Tag`, canonicals elsewhere), JSON-LD (types inside `@graph`, invalid blocks, missing properties) and the page score. The site checks run against the stand-in site in `a11y/scan.test.ts`.
- **Issue trackers:** `trackers/trackers.test.ts` runs against the [stand-in GitHub and GitLab APIs](#issue-tracker-stand-in): only https servers (or http on this computer or network), a bad token recorded as the tracker's error, one repository issue per finding with where it fails and how to fix it, the automatic `tracker_sync` (impact threshold, closing fixed issues, reopening ones that come back), GitLab, and a code fence an HTML snippet can't break out of.
- **Jobs:** test the database logic directly, or run the runner on a job that has nothing to do. `runner.test.ts` enqueues `listen_scan` for a product without a brief, which finishes without any network call. `distribution/scan.test.ts` stubs the adapters to check that `listen_scan` keeps going when one source fails and queues what the others found, that an X API error is recorded for Settings instead of failing the scan, how drafting matches a conversation to its watched community (`matchCommunity()`), and that a Mastodon reply's length counts the `@author` mention.

Use the fictional demo product (Fieldnote, `https://fieldnote.example`) in test data, never a real business.

### Accessibility stand-in site

The scan tests never touch a real site. `packages/core/src/a11y/standin/` is a small static site with known failures, served by `server.mjs`:

```bash
yarn workspace @startica/desktop-web a11y-standin   # http://localhost:58395
```

| Page | Planted failure |
|---|---|
| `/` | The shared header (below) |
| `/pricing.html` | Low-contrast text |
| `/signup.html` | An input with no label, and a button with no text |
| `/about.html` | No `lang` on the page |
| `/sitemap-only.html` | Only in the sitemap, not linked from any page; has an empty link |
| `/clean.html` | None: scores 100 |
| `/private/notes.html` | Disallowed by `robots.txt`, so it's skipped |
| `/missing.html` | Linked but missing: answers 404, so it fails |

Five pages share a header whose logo image has no alt text, so its link has no name either. Each of those is one issue group on five pages. A full scan should find exactly **7 open issue groups**.

The same pages have planted [SEO & GEO](/seo/site-health) problems:

| Where | Planted problem | Findings |
|---|---|---|
| `/pricing.html` | No meta description; a JSON-LD block with a missing comma | `description-missing`, `jsonld-invalid` |
| `/about.html` | The same title as pricing ("Pricing: Fieldnote"), two `h1`s, no meta description | `title-duplicate`, `h1-multiple`, `description-missing` |
| `/sitemap-only.html` | `noindex` while listed in the sitemap, linked from nowhere, no meta description | `noindex-in-sitemap`, `orphan-page`, `description-missing` |
| `/missing.html` | Linked from the home page, answers 404 | `broken-internal-link` |
| `robots.txt` | Blocks `GPTBot` (training) and `OAI-SearchBot` (AI search) | `ai-training-blocked` (FYI), `ai-search-blocked` |
| `/llms.txt` | Doesn't exist | `llms-missing` |

That's exactly **13 SEO findings**: `title-duplicate` counts once for each of its two pages. The home page has a description, an `Organization` block and a social image, and `/clean.html` and `/signup.html` have none of these problems.

`a11y/scan.test.ts` checks, with real Chromium:

- a full crawl finds exactly the planted failures, with the right page states (done, skipped, failed);
- the same crawl finds exactly the 13 planted SEO findings, and gives the site a site health score;
- rechecking a page after a fix (served by the stand-in's `transform` option, without touching its files) marks the issue fixed and raises the score;
- a scan interrupted mid-way resumes where it stopped.

> [!WARNING]
> If you change a check, the fingerprinting or the crawl, keep the stand-in and the expected counts in step. Both smoke tests expect 7 open issues, and `a11y/scan.test.ts` expects the exact set of SEO findings.

### Issue tracker stand-in

Tests never open issues on a real GitHub or GitLab. `packages/core/src/trackers/standin.mjs` is a small HTTP server that answers just the endpoints Startica calls, for both services, and keeps the issues it receives in memory:

```ts
import { startTrackerStandin, STANDIN_TOKEN } from "./standin.mjs";

const api = await startTrackerStandin(0); // a free port
// Save a tracker with base_url: api.url and token: STANDIN_TOKEN ("test-token")
const opened = [...api.issues.values()]; // { title, body, labels, state, comments }
await api.close();
```

Any token other than `test-token` gets a 401. Because the stand-in runs on `localhost`, an `http://` server address is allowed.

### Desktop unit tests (node --test)

`apps/desktop` is plain JavaScript, so its unit tests use Node's built-in test runner instead of Vitest:

```bash
yarn workspace @startica/desktop test
```

This runs `node --test "posting/*.test.mjs"`. `posting/sites.test.mjs` checks that every site's fill-in script is valid JavaScript even with awkward text (quotes, `</script>`), that each site's response parser turns a submit response into the right link (X, Reddit, Hacker News, LinkedIn, Bluesky, Mastodon, Discourse), that the right requests count as a submit (a Bluesky like doesn't; a Discourse post held for approval comes back as pending, without a link), and that the submitted text is read from the request. The fill-in scripts themselves run in Chromium in the desktop smoke test. `yarn test` runs these too, and they don't need Electron.

## Browser smoke test

```bash
yarn smoke:desktop
```

This runs `apps/desktop-web/scripts/smoke.mjs`, which needs Playwright's Chromium (`yarn workspace @startica/desktop-web playwright install chromium`, once). It:

1. Creates a temporary data folder and starts the server on port **58399** with its own Next.js build folder, `.next-smoke`, so it can run next to your dev server on 58301.
2. Checks that a request without the launch token gets a 401.
3. Opens the one-time token link and waits for `/welcome`: a fresh data folder opens the welcome wizard.
4. Walks the wizard: on **Connect AI** it picks **OpenAI** and checks that the step asks for an **OpenAI API key**, then clicks **Skip for now**. It enters a product with the website `example.com`, unticks **Start building intel now** so no real research runs, sets a Mastodon server in **A few extras**, clicks **Finish** and checks that Today shows the **Getting started** checklist with the new product.
5. Checks the communities step: it marks the product's intel ready and inserts three suggestions straight into the database (two subreddits and a Hacker News community), opens **Review suggestions**, and checks that **Watch 2 communities** watches exactly the two readable ones.
6. Checks that the wizard's Mastodon server was saved (Settings shows it), and adds a second product in Settings.
7. Loads every page (`/today`, `/welcome`, `/inbox`, `/content`, `/roadmap`, `/intel`, `/analytics`, `/accessibility`, `/accessibility/issues`, `/accessibility/pages`, `/seo`, `/seo/health`, `/security`, `/settings`, `/system`) and fails on a non-200 response or an error screen.
8. Adds the [accessibility stand-in site](#accessibility-stand-in-site) (served on port **58395** for the whole run) on **Accessibility** through the UI (**Add the site**, ticking **I own this site or am allowed to test it**), clicks **Scan now** and waits for the scan to finish with the Playwright backend. It checks that **Open issues** says 7, that the header logo's missing alt text is one issue on several pages ("probably part of a shared template") listing each page, and that a page report lists the page's issues with their elements. It opens **SEO & GEO** and checks that the **AI crawlers** table shows `OAI-SearchBot` as **Blocked**, and that **Site health** lists "Broken internal link", "Several pages share the same title" and "No llms.txt" (saving `startica-smoke-seo-health.png` to the temp folder). Then it connects the [issue tracker stand-in](#issue-tracker-stand-in) in **Settings → Products → Issue tracker** as the GitHub repository `fieldnote/web`, opens the "Images must have alternative text" issue, clicks **Create GitHub issue**, and checks that the issue page links to the new GitHub issue and that the stand-in received exactly one issue with the right title.
9. Collapses the sidebar's **Marketing** section, reloads, and checks that it stays collapsed and that the **Accessibility** section's links still show.
10. Saves Intel notes through a server action.
11. Clicks "Run test job" on the System page and waits for the job table to update live. The smoke test reads no env file and never has an AI key, so the ping must fail with "No Anthropic API key". That shows the job reached the AI client.
12. In **Settings → General → AI**, opens **Add API key**, chooses OpenAI under **Use**, saves a dummy OpenAI key, and checks that the card says "Using OpenAI." and the tasks moved to OpenAI's models (GPT-6 Luna).
13. In **Settings → Products**, opens the **Product database** setup, clicks **Write the SQL**, checks the script creates `startica_reader` and grants it only the view, and checks that a connection string to an unreachable database is refused before anything is saved.
14. Fails if the browser reported any page errors, then deletes the temp folder.

Each step prints `✓` or `✗`, and the command exits with code 1 if anything failed. The first run takes a while because Next.js compiles every page.

When you add a page or a key flow, add it here.

## Desktop smoke test

```bash
yarn workspace @startica/desktop smoke
```

This runs `apps/desktop/scripts/smoke.mjs`, which launches the real Electron app through Playwright with port **58398**, a temporary `STARTICA_DATA_DIR` and the build folder `.next-desktop-smoke`. It clears `ELECTRON_RUN_AS_NODE` for you. It checks that:

- the window opens the welcome wizard (`/welcome`) and has the right title,
- the desktop app offers **Look around with a sample product first**, and **Skip setup** goes to Today,
- the Electron scanner works: it adds a product for the [stand-in site](#accessibility-stand-in-site) (port **58395**), adds the site on **Accessibility**, scans it in the hidden scan windows and checks for the 7 planted issues and at most two hidden windows. This runs in dev and `--packaged` runs, which proves axe-core ships with the packaged server,
- saving an AI key in Settings round-trips through the OS keychain ("Anthropic API key: saved" only appears once the server can decrypt it),
- [Posting with Startica](/guides/assisted-posting) works end to end (dev runs only, below),
- closing the window keeps the app running in the tray, and reopening brings the window back on Today,
- [demo mode](/guides/demo-mode) works (dev runs only): it writes `startica-mode.json` with `{"demo":true}` into the same temporary data folder and launches the app again on port **58397**. It checks that Today opens on Fieldnote with the demo banner, that the Inbox has no **Post…** button, that **Accessibility** shows the sample results for `fieldnote.example` with scanning off, and that the demo has its own `demo/startica.db`.

### Posting against stand-ins

The desktop smoke test never touches the real sites. `apps/desktop/scripts/posting-standins.mjs` serves local stand-ins on port **58396** for all seven sites (X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse) that mimic the markup each site's fill-in looks for and each site's response to a submit; `STARTICA_POSTING_TEST_BASE` points the posting window at them, and `STARTICA_POSTING_PARTITION` gives it a throwaway in-memory session so your real sign-ins are never touched (both ignored in packaged builds). The test seeds a drafted reply per site (and a Mastodon server, `mastodon.example`, in the posting settings), clicks **Post…** in the Inbox, and checks per site that:

- the reply was filled into the right box (a text box's value, or a rich editor's text for LinkedIn, Bluesky and Discourse; on Mastodon, after the "@author " mention),
- nothing was sent before the (simulated) user pressed the site's button,
- after the press, the post was recorded with the right link,
- text edited on the page before the press is what gets saved.

It does the same for three Content Studio new posts: a Hacker News post (title and text filled in, link recorded), a Bluesky post (typed into a compose box that starts empty, link recorded) and a Discourse new topic on a forum that holds new topics for a moderator (filled in, then saved as posted without a link). New posts on X, LinkedIn and Mastodon are covered only by the unit tests above, not by the smoke test. `--packaged` runs skip these checks.

> [!WARNING]
> If you change a site's selectors or response parsing in `apps/desktop/posting/sites.mjs`, change its stand-in in `posting-standins.mjs` in the same commit, so the smoke test keeps matching the real site. The stand-ins only prove the code matches them; check a change against the live site too, with a real account, before calling it done.

It saves `desktop-settings.png`, `desktop-today.png`, `desktop-accessibility.png` and the posting screenshots (`desktop-posting-bar.png`, `desktop-posting-site.png`, `desktop-inbox-posted.png`) to a folder you pass as an argument, or to the system temp folder:

```bash
yarn workspace @startica/desktop smoke ./screenshots
```

Run it for any change in `apps/desktop`, the keychain path, startup or posting.

### Testing a built app

After `yarn build:desktop`, test the packaged app instead of the dev setup:

```bash
yarn workspace @startica/desktop smoke --packaged
```

It launches the unpacked app from `apps/desktop/dist` (`mac/Startica.app`, `win-unpacked/Startica.exe` or `linux-unpacked/startica`). This catches packaging problems the dev run can't, like a file missing from the assembled server.

> [!NOTE]
> On macOS the first keychain access may show a system prompt asking to allow access. Click **Always Allow** so later runs aren't blocked.

## Isolated ports and cleanup

Tests use ports 58395 to 58399: 58395 the accessibility stand-in site, 58396 the desktop smoke test's posting stand-ins, 58397 its demo-mode launch, 58398 the desktop smoke test, 58399 the browser smoke test. They never use 58300 or 58301, which belong to the installed app and your dev server. If a run is interrupted and leaves a server behind, stop it by port; Next.js renames its process to `next-server`, so killing by name doesn't work:

```bash
lsof -tiTCP:58399 | xargs kill
```

A leftover Electron instance blocks new launches through the single-instance lock. Find it with `pgrep -fl Startica`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`, on `ubuntu-latest` and `macos-latest` with Node 24. It installs dependencies with `yarn install --immutable`, installs Playwright's Chromium, then runs `yarn typecheck`, `yarn lint`, `yarn test` and `yarn smoke:desktop`. It skips the Electron binary download, because none of these checks start Electron.

The desktop smoke test isn't part of CI, because it needs a display and an OS keychain. Run it locally when you change `apps/desktop`.

The smoke test never has an AI key, locally or in CI, so its ping job is expected to fail with "No Anthropic API key". If CI fails but your local run passes, check whether your change updated `yarn.lock` (the install is `--immutable`), and whether a test depends on your local data, time zone or network.
