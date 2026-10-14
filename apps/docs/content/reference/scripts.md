---
title: Scripts
description: Every root yarn script and the most useful workspace scripts in the Startica repo, with what each does and when to use it.
layout: doc
---

The Startica repo is a Yarn 4 workspace (Node 24 or newer). Run root scripts from the repo root with `yarn <script>`. Workspace scripts run with `yarn workspace <name> <script>`. This page lists all root scripts and the workspace scripts worth knowing. Setup steps are in [Development setup](/contributing/dev-setup).

## Root scripts

### Desktop app

| Script | What it does | When to use it |
| --- | --- | --- |
| `yarn dev:desktop` | Opens the desktop app (Electron) in dev mode with hot reload. Uses your normal [data folder](/reference/data-folder) and the OS keychain. | Day-to-day work on the app. |
| `yarn dev:desktop-web` | Runs the app's server without Electron and prints a one-time link (`http://127.0.0.1:58300/?token=…`) to open it in a browser. Secrets are encrypted with a key file instead of the keychain. | Debugging in a normal browser with its dev tools. |
| `yarn build:desktop` | Builds the installers into `apps/desktop/dist` (see [Build flags](#build-flags)). | Testing a packaged build, making a release. |
| `yarn smoke:desktop` | Browser end-to-end test of the server: isolated temporary data folder, port 58399, its own build folder (`.next-smoke`). Checks that requests without the token are refused, the wizard offers Claude or OpenAI, a product can be added, every page renders, an accessibility scan of the local stand-in site (port 58395) finds its 7 planted issues, the sidebar sections collapse and stay collapsed, Intel notes save, a test job runs, and Settings → General → AI can switch to OpenAI. Needs Playwright's Chromium. Reads no env file and never has an AI key, so the test job is expected to fail with "No Anthropic API key". | Before calling any desktop change done. |
| `yarn db:generate` | Generates a SQL migration in `packages/db/migrations` from `packages/db/src/schema.ts` (drizzle-kit). The app applies migrations on startup. | After every schema change. Commit the generated files. |
| `yarn eval` | Runs a prompt eval set against the current prompt and model routing (see [Evals](#evals)). | After changing the scoring prompt or model. |
| `yarn eval:export` | Turns your Inbox decisions into eval cases (see [Evals](#evals)). | To grow the eval set from real use. |

> [!NOTE]
> Despite its name, `yarn smoke:desktop` runs the browser smoke test (`@startica/desktop-web`). The test that launches the real Electron app is `yarn workspace @startica/desktop smoke`, below.

### Checks

| Script | What it does |
| --- | --- |
| `yarn typecheck` | Runs `typecheck` in every workspace that has it. |
| `yarn lint` | Runs `lint` in every workspace that has it. |
| `yarn test` | Runs `test` in every workspace that has it. |

What each workspace actually runs:

| Workspace | `typecheck` | `lint` | `test` |
| --- | --- | --- | --- |
| `@startica/desktop-web` | `next typegen && tsc --noEmit` | `eslint` | none yet (prints a note) |
| `@startica/core` | `tsc --noEmit` | none yet | `vitest run` |
| `@startica/db` | `tsc --noEmit` | none yet | `vitest run` |
| `@startica/desktop` | none (plain JS) | none yet | `node --test "posting/*.test.mjs"` |

Before calling desktop work done, run all four:

```bash
yarn typecheck && yarn lint && yarn test && yarn smoke:desktop
```

### Websites

| Script | What it does |
| --- | --- |
| `yarn dev` | Website and docs together, with hot reload: `http://localhost:9000` and `http://localhost:9001`. |
| `yarn dev:web` | Website only (`apps/web`) at `http://localhost:9000`. |
| `yarn build` | Builds the landing site to `apps/web/dist`. |
| `yarn deploy` | Builds and deploys the landing site to Cloudflare Workers. |
| `yarn dev:docs` | This documentation site (`apps/docs`) with hot reload at `http://localhost:9001`. |
| `yarn build:docs` | Builds the documentation site. |
| `yarn deploy:docs` | Builds and deploys the documentation site to Cloudflare Workers. |

Deploying needs Cloudflare access; contributors only need `dev` and `build`. See [Docs and website](/contributing/docs-and-website).

### Install hook

`postinstall` runs automatically on `yarn install`:

| Step | What it does |
| --- | --- |
| `scripts/ensure-electron.mjs` | Downloads the Electron binary if Electron's own post-install step didn't run under Yarn. |

There's no env file to link. Keys go in the app's Settings; see [Environment variables](/reference/environment).

## Workspace scripts

### Desktop (`@startica/desktop`)

| Command | What it does |
| --- | --- |
| `yarn workspace @startica/desktop smoke [screenshot-dir] [--packaged]` | Launches the real Electron app with an isolated data folder, port 58398 and build folder `.next-desktop-smoke`. Checks the window loads Today, scans the accessibility stand-in site (port 58395) with the Electron scanner and finds its 7 planted issues, saves an AI key through the OS keychain and reads it back, runs [Posting with Startica](/guides/assisted-posting) against local stand-ins for all seven sites on port 58396 (`scripts/posting-standins.mjs`; dev runs only): a reply on each, plus new posts from Content Studio on Hacker News, Bluesky and Discourse (a topic held for approval), closes the window and confirms the app keeps running in the tray, then reopens it. Saves `desktop-settings.png`, `desktop-today.png`, `desktop-posting-bar.png`, `desktop-posting-site.png` and `desktop-inbox-posted.png` to the screenshot folder (default: the system temp folder). `--packaged` tests the built app in `dist/` instead of the dev setup (run `yarn build:desktop` first); it skips the posting checks. |
| `yarn workspace @startica/desktop test` | Unit tests for the posting window's per-site parts (`posting/*.test.mjs`, with `node --test`): the fill-in scripts parse, and each site's response is turned into the right link. `yarn test` runs it too. |
| `yarn workspace @startica/desktop icons` | Renders the app and tray icons from `assets/icon.svg` and `assets/tray.svg` with Playwright's Chromium: `resources/icon.png` (1024 px), `assets/icon.png` (512 px), `assets/trayTemplate.png` and `@2x` (macOS menu bar), `assets/tray.png` and `@2x` (Windows/Linux). Run after editing the SVGs. |

### Build flags

`yarn build:desktop` (the same as `yarn workspace @startica/desktop build`) does three steps:

1. Builds the Next.js server in standalone mode into `apps/desktop-web/.next-desktop` (its own folder, so a running dev server is unaffected).
2. Assembles the server, static files, production entry and database migrations into `apps/desktop/build/server`.
3. Packages with electron-builder into `apps/desktop/dist`.

| Flag | Effect |
| --- | --- |
| `--no-package` | Stop after step 2 (no installer). |
| `--mac`, `--win`, `--linux` | Passed to electron-builder to choose target platforms. Any other electron-builder argument is passed through too. |

| Platform | Installer | Unpacked app (used by `smoke --packaged`) |
| --- | --- | --- |
| macOS | `.dmg` | `dist/mac/Startica.app` |
| Windows | NSIS installer (lets you choose the install folder) | `dist/win-unpacked/Startica.exe` |
| Linux | AppImage | `dist/linux-unpacked/startica` |

```bash
yarn build:desktop --mac
yarn build:desktop --no-package
```

See [Releases](/contributing/releases).

### Server (`@startica/desktop-web`)

| Command | What it does |
| --- | --- |
| `yarn workspace @startica/desktop-web dev` | Same as `yarn dev:desktop-web`. |
| `yarn workspace @startica/desktop-web build` | Plain `next build` into `.next`. |
| `yarn workspace @startica/desktop-web start` | Runs that build in production mode in the browser (prints the one-time link). |
| `yarn workspace @startica/desktop-web smoke` | Same as `yarn smoke:desktop`. |
| `yarn workspace @startica/desktop-web a11y-standin` | Serves the accessibility stand-in site (`packages/core/src/a11y/standin/`) on `http://localhost:58395`: a small site with known failures on each page, used by the scan tests and smoke tests. Add it as a site in **Accessibility** to try a scan without touching a real site. See [Testing](/contributing/testing#accessibility-stand-in-site). |
| `yarn workspace @startica/desktop-web playwright install chromium` | Installs Playwright's Chromium, once. The browser smoke test needs it, and so do accessibility scans in browser development mode. |

### Evals

Both commands live in `@startica/core`. Three eval sets exist: the scorer (`score`), Accessibility's fix suggestions (`a11y`) and Security's AI help (`security`). The set name is required; `yarn eval:export` only exports `score` cases.

| Command | What it does |
| --- | --- |
| `yarn eval score [--model <id>] [--product <name>]` | Scores every case in `packages/core/src/ai/evals/score/*.json` with the current scoring prompt, in a throwaway database, and prints each case as pass or fail plus the total cost. `--model` tries another model from either provider (for example `claude-sonnet-5-5` or `gpt-6-luna`) without changing your settings; an unknown ID prints the known ones. `--product` runs one product's file. Takes the key from your shell: `ANTHROPIC_API_KEY` for Claude models (the default), `OPENAI_API_KEY` for OpenAI models. The key saved in the app is not used, and the one you pass is stored only in the throwaway database. Exits with code 1 if any case fails. Makes real, billed AI calls. |
| `yarn eval a11y [--model <id>]` | Asks for a fix for each case in `packages/core/src/ai/evals/a11y/cases.ts` (planted failures from the stand-in site) on the `draft` task, swaps the suggested HTML into a small page in Playwright's Chromium and checks it with the same axe rule. A case passes when the original fails the rule and the fix passes it. Needs Playwright's Chromium (`yarn workspace @startica/desktop-web playwright install chromium`). Same key, `--model` and exit code rules as `score`. Makes real, billed AI calls. |
| `yarn eval security [--model <id>]` | Runs Security's explain, import and triage prompts on the `draft` task against `packages/core/src/ai/evals/security/cases.ts` (3 explain, 2 import and 3 triage cases) with structural checks: what the explanation mentions, how many findings an import returns and their severities and rules, the triage verdict and duplicate, no exploit text and no promise of money. Same key, `--model` and exit code rules as `score`. Makes real, billed AI calls. |
| `yarn eval:export score` | Reads your app database (without changing it) and writes one eval file per product to `packages/core/src/ai/evals/score/<product>.json`: replies you posted become "reply" cases, conversations you dismissed become "skip" (except ones dismissed as too old or against community rules). Merges with existing cases and refreshes the product snapshot. Authors are left out. |

```bash
yarn eval:export score
ANTHROPIC_API_KEY=sk-ant-… yarn eval score --product fieldnote --model claude-sonnet-5-5
OPENAI_API_KEY=sk-… yarn eval score --model gpt-6-luna
```

> [!WARNING]
> Eval files contain real conversation text and your product's brief. Review them before committing. See [Prompts and evals](/contributing/prompts-evals).

### Demo data (`@startica/core`)

| Command | What it does |
| --- | --- |
| `STARTICA_DATA_DIR=<folder> yarn seed:demo [--force]` | Loads the fictional demo product, Fieldnote, into the given data folder, with no AI calls. `STARTICA_DATA_DIR` is required (use an absolute path). Refuses if the database already has a product; `--force` first deletes every product and its data, keeping settings, secrets and AI model routing. Open the result with `STARTICA_DATA_DIR=<folder> yarn dev:desktop-web`. See [Data folder](/reference/data-folder#demo-data). |

### Database (`@startica/db`)

| Command | What it does |
| --- | --- |
| `yarn workspace @startica/db generate` | Same as `yarn db:generate`. |

### Docs (`@startica/docs`)

| Command | What it does |
| --- | --- |
| `yarn workspace @startica/docs check` | Fails if a docs page is missing from the sidebar, or the sidebar links to a page that doesn't exist. |
| `yarn workspace @startica/docs preview` | Serves the built site locally with Wrangler. |
