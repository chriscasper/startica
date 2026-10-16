---
title: Development setup
description: Clone, install and run Startica for development, with isolated data and your keys entered in the app.
layout: doc
---

This page gets you from a fresh clone to a running development copy of Startica, in the desktop window or in a browser, without touching your real data. If you only want to use Startica, follow [Install from source](/getting-started/install) instead.

## Prerequisites

- **Node.js 24 or newer.** Startica uses the built-in `node:sqlite` module.
- **Yarn 4 through Corepack.** Run `corepack enable` once; the exact Yarn version is pinned in `package.json` (`packageManager`).
- **git.**
- **An Anthropic or OpenAI API key** if you want to run anything that calls the AI. Most UI work doesn't need one. See [Anthropic API key](/credentials/anthropic) and [OpenAI API key](/credentials/openai).

Electron is a dev dependency and is downloaded during install, so you don't need to install it yourself. Building installers has extra requirements per OS, covered in [Releases](/contributing/releases).

## Clone and install

```bash
git clone https://github.com/chriscasper/startica.git
cd startica
corepack enable
yarn install
```

`yarn install` runs one root `postinstall` script: `scripts/ensure-electron.mjs`, which downloads the Electron binary if Electron's own install step didn't (it doesn't always run under Yarn).

To run the browser smoke test you also need Playwright's Chromium, once:

```bash
yarn workspace @startica/desktop-web playwright install chromium
```

## Keys and settings

There's no env file. Development uses exactly the same Settings as the installed app: you enter AI keys, the monthly budget, the GA4 service account key, the X API token and the other connections in the welcome wizard or in **Settings**, and they're stored encrypted in the data folder you're running against. Use a test key and a low budget for development.

A few environment variables remain for overrides, such as `STARTICA_DATA_DIR` and `PORT`. Set them in your shell. The full list is in [Environment variables](/reference/environment).

## Run the app

There are two ways to run the same server.

### In the desktop window

```bash
yarn dev:desktop
```

This starts Electron, which forks the Next.js dev server as a child process (see [Architecture](/contributing/architecture)). Pages hot-reload. Secrets are encrypted with your OS keychain, exactly as in the installed app. Use this mode for anything that touches the Electron shell, the tray, the keychain or the posting window.

### In a browser

```bash
yarn dev:desktop-web
```

This starts only the server and prints a one-time login link:

```text
Startica is running. Open:
  http://127.0.0.1:58301/?token=…
```

Open it once; the browser keeps a session cookie until the server restarts. Use this mode for UI work with your browser's dev tools. Secrets are encrypted with a key file in the data folder (`dev-secret.key`) instead of the keychain, so keys saved in the desktop app can't be read here, and the other way round. Re-enter them in Settings if you need them.

> [!NOTE]
> Don't run `next dev` directly in `apps/desktop-web`. The server must be started by `scripts/serve.mjs`, which sets the launch token; without it every request gets a 503.

Both dev modes use port **58301** and the **Startica Dev** data folder (`~/Library/Application Support/Startica Dev` on macOS), with their own keychain entry. An installed Startica uses port 58300 and its own `Startica` folder, so you can keep using it while you develop: the two never share data or keys. Only one dev server can run at a time.

## Use an isolated data folder

Dev runs already keep their data apart from the installed app, in the Startica Dev folder. To try something on a throwaway database (a fresh first run, a migration), point `STARTICA_DATA_DIR` at another folder:

### macOS and Linux

```bash
STARTICA_DATA_DIR="$HOME/startica-dev-data" yarn dev:desktop-web
```

### Windows

```powershell
$env:STARTICA_DATA_DIR = "$env:USERPROFILE\startica-dev-data"
yarn dev:desktop-web
```

The folder is created if it doesn't exist. Delete it to start fresh. `STARTICA_DATA_DIR` works with `yarn dev:desktop` too. The dev window's single-instance lock belongs to Startica Dev, so an installed Startica can keep running, but a second dev copy can't.

Other overrides that help during development:

| Variable | Effect |
|---|---|
| `PORT` | Server port (default 58301 for dev runs). |
| `STARTICA_DISABLE_JOBS=1` | Don't start the job runner. Handy when you want to look at queued jobs without running them. |
| `STARTICA_NEXT_DIST` | Next.js build folder (default `.next`). Lets a second server run next to your dev server. |

> [!WARNING]
> Never delete `apps/desktop-web/.next` while a dev server is running from it. Stop the server first.

## Demo data

In `yarn dev:desktop`, **Look around with a sample product first** on the welcome page opens [demo mode](/guides/demo-mode): the same sample in `<data folder>/demo`, with jobs, AI and posting off. For a browser run, or to work on the sample with jobs running, load the fictional demo product, Fieldnote, into an isolated data folder:

```bash
STARTICA_DATA_DIR="$HOME/startica-demo" yarn seed:demo
STARTICA_DATA_DIR="$HOME/startica-demo" yarn dev:desktop-web
```

The seed (`packages/core/scripts/seed-demo.ts`) fills every page: the product brief, personas, competitors, keywords and communities, Inbox opportunities with drafts and posted replies, voice samples and profiles, content pieces, metrics, roadmap items, audits, and job and AI run history. It makes no AI or network calls.

- `STARTICA_DATA_DIR` is required and must be an absolute path, so the demo can't land in your real data folder by accident.
- It refuses to run if the database already has a product. `--force` first deletes every product and its data (keeping settings, secrets and AI model routing):

  ```bash
  STARTICA_DATA_DIR="$HOME/startica-demo" yarn seed:demo --force
  ```

## Editor gotcha: ELECTRON_RUN_AS_NODE

VS Code, Cursor and other Electron-based editors set `ELECTRON_RUN_AS_NODE=1` in their integrated terminals. With that variable set, Electron starts as plain Node instead of as an app, and the desktop window never opens.

`yarn dev:desktop` and the desktop smoke test clear the variable for you. If you start Electron or a built app any other way from an editor terminal, unset it first:

```bash
unset ELECTRON_RUN_AS_NODE
```

## Next.js 16 is different

The app uses Next.js 16.4 with Cache Components on, and its APIs and conventions differ from older versions (for example, `src/proxy.ts` replaces middleware). Before you use a Next.js API you haven't checked, read the guide that ships with the installed version:

```bash
ls node_modules/next/dist/docs/
```

With the `node-modules` linker, Next is hoisted to the repo-root `node_modules`. `apps/desktop-web/AGENTS.md` carries the same warning; `next dev` rewrites that file's Next.js block, so commit it if it changes.

## Useful commands

| Command | Does |
|---|---|
| `yarn dev:desktop` | Desktop app in dev mode |
| `yarn dev:desktop-web` | Server only, for a browser |
| `yarn db:generate` | Write a migration after editing `packages/db/src/schema.ts` |
| `yarn typecheck && yarn lint && yarn test && yarn smoke:desktop` | The checks every PR must pass |
| `yarn workspace @startica/desktop smoke` | Desktop end-to-end test |
| `yarn build:desktop` | Build an installer for your OS |
| `yarn workspace @startica/desktop icons` | Re-render app and tray icons from `apps/desktop/assets/*.svg` |

All scripts are listed in [Scripts](/reference/scripts).
