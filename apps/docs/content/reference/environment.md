---
title: Environment variables
description: The few environment variables Startica reads, with their purpose and default; keys and other credentials go in Settings, not the environment.
layout: doc
---

Startica has no env file. Everything a user configures (the AI provider and its API keys, the monthly budget, the GA4 and Search Console service account keys, the Umami and Bing API keys, the product database connection, the optional X API token) is entered in the app, in the welcome wizard or in **Settings**, and stored encrypted. That's true when you run from source too: development uses exactly the same Settings as the installed app.

The variables below are a few overrides plus values the repo's scripts and the app set for themselves. Set them in your shell for one command, for example:

```bash
PORT=58310 STARTICA_DATA_DIR="$HOME/startica-dev-data" yarn dev:desktop-web
```

> [!NOTE]
> Older versions of Startica read `ANTHROPIC_API_KEY`, `AI_MONTHLY_BUDGET_USD`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `SUPABASE_OAUTH_CLIENT_ID`, `SUPABASE_OAUTH_CLIENT_SECRET` and `X_API_BEARER_TOKEN` from a `.env.local` file. The app no longer reads any of them. Enter the API keys and budget in Settings; the Google and Supabase OAuth clients aren't used at all any more. See [Credentials](/credentials). The one exception is `yarn eval`, which takes `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` from your shell; see [Prompts and evals](/contributing/prompts-evals#run-an-eval).

## Overrides

Safe to set when running from source, including for the desktop app started from a terminal.

| Variable | Purpose | Default |
| --- | --- | --- |
| `STARTICA_DATA_DIR` | Folder for the database and other data. Use it to keep a test setup apart from your real data. The posting window's sign-ins stay in Electron's default folder either way (see [Posting sign-ins](/reference/data-folder#posting-sign-ins)). In [demo mode](/guides/demo-mode) the desktop app uses its `demo` subfolder. | The per-OS folder in [Data folder](/reference/data-folder) |
| `PORT` | Port the local server listens on (always `127.0.0.1` only). | `58300` |
| `STARTICA_DISABLE_JOBS` | `1` starts the app without the job runner or schedules. Jobs can still be queued; nothing runs them. Any other value is ignored. | (unset: jobs run) |

> [!NOTE]
> Two copies of Startica can't share a port; the second one stops with "Port _n_ is already in use. Is Startica already running?"

## Development and build only

Used by the repo's own scripts. You rarely set these by hand.

| Variable | Read by | Purpose | Default |
| --- | --- | --- | --- |
| `STARTICA_NEXT_DIST` | `next.config.ts` | Next.js build folder. The smoke tests and the desktop build each use their own (`.next-smoke`, `.next-desktop-smoke`, `.next-desktop`) so they never collide with a running dev server. When set, type checking during the build uses `tsconfig.test.json`. | `.next` |
| `STARTICA_STANDALONE` | `next.config.ts` | Any value switches the Next.js build to `standalone` output, which the desktop build packages. Set by `yarn build:desktop`. | (unset) |
| `STARTICA_TOKEN_FILE` | `apps/desktop-web/scripts/serve.mjs` | If set, the browser dev server also writes `{ "url": …, "token": … }` to this file, for tools that need the one-time login link. Not supported by the packaged server. | (unset) |
| `STARTICA_POSTING_TEST_BASE` | `apps/desktop/main.mjs` | Points the [posting window](/guides/assisted-posting) at local stand-in sites instead of the real sites (X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse; same paths, this origin). Set by the desktop smoke test (`http://127.0.0.1:58396`). Ignored in packaged builds. | (unset: the real sites) |
| `STARTICA_GOOGLE_API_BASE` | `packages/core/src/search/google.ts` | Points Google's token endpoint and the Search Console API at a stand-in (`<base>/token` and `<base>/webmasters/v3`) instead of Google. Set by the browser smoke test to the stand-in in `packages/core/src/search/standin.mjs`. Ignored in the installed app (when `STARTICA_PACKAGED` is `1`), so the key and its tokens only ever go to Google there. | (unset: Google) |
| `STARTICA_BING_API_BASE` | `packages/core/src/search/bing.ts` | Points the Bing Webmaster Tools API at a stand-in instead of `https://ssl.bing.com/webmaster/api.svc/json`. For tests. Ignored in the installed app (when `STARTICA_PACKAGED` is `1`), so the API key only ever goes to Bing there. | (unset: Bing) |
| `STARTICA_SECURITY_API_BASE` | `packages/core/src/security/monitor.ts` | Points all four [security monitoring](/security/monitoring) services at a stand-in instead of the real ones: crt.sh (`<base>/crtsh`), OSV.dev (`<base>/osv`), FIRST's EPSS API (`<base>/epss`) and CISA's known exploited vulnerabilities list (`<base>/kev.json`). Set by the unit tests and both smoke tests to the stand-in in `packages/core/src/security/standin.mjs`. Unlike the Google and Bing variables it isn't ignored in the installed app; no credentials go to these services. | (unset: the real services) |
| `STARTICA_POSTING_PARTITION` | `apps/desktop/main.mjs` | Electron session partition for the posting window. The desktop smoke test sets a non-persistent one so it never touches your real posting sign-ins. Dev only; ignored in packaged builds. | `persist:posting` |
| `NODE_ENV` | `server.mjs`, `serve.mjs` | `production` runs the Next.js production server (needs a prior `next build`); anything else runs the dev server with hot reload. The desktop app sets it to `development` in dev and `production` when packaged. | (unset: dev) |

## Set internally

Set by Startica itself or by Next.js, Electron or the OS. Don't set these yourself; they are listed so you recognise them.

| Variable | Set by | Purpose |
| --- | --- | --- |
| `STARTICA_SESSION_TOKEN` | The server at launch | The random per-launch token every request must carry (as the `startica_session` cookie, or once as `?token=`). Without it every page returns 503 "Startica must be started by its launcher". |
| `STARTICA_MIGRATIONS_DIR` | The server at launch (only if unset) | Folder of SQL migrations applied on startup: `packages/db/migrations` from source, `migrations` next to the packaged server. |
| `STARTICA_ELECTRON` | The desktop app | `1` makes the server encrypt secrets through the Electron process (OS keychain) instead of the dev key file. |
| `STARTICA_DEMO` | The desktop app, in [demo mode](/guides/demo-mode) | `1` when `startica-mode.json` says demo. The desktop app also points `STARTICA_DATA_DIR` at the `demo` folder. The server fills an empty demo database with the sample product, starts no job runner, shows the demo banner and hides **Post…**. Set by the app; don't set it by hand. |
| `STARTICA_PACKAGED` | The desktop app, when installed | `1` in an installed build, not in `yarn dev:desktop`. Shows **Open Startica when I log in** in the welcome wizard, and makes Startica ignore `STARTICA_GOOGLE_API_BASE` and `STARTICA_BING_API_BASE`. Set by the app; don't set it by hand. |
| `ELECTRON_RUN_AS_NODE` | The desktop app | Set to `1` for the server child process. Editors such as VS Code set it for their own terminals, which would start Electron as plain Node, so `yarn dev:desktop` and the desktop smoke test remove it. |
| `HOSTNAME` | Packaged server | `127.0.0.1`, for Next.js's standalone server. |
| `NEXT_RUNTIME`, `NEXT_PHASE` | Next.js | Used to start the database and jobs only in the Node.js runtime and never during `next build`. |
| `APPDATA` | Windows | Base of the Windows data folder. |
| `XDG_CONFIG_HOME` | Linux | Base of the Linux data folder (default `~/.config`). |
| `APPIMAGE` | AppImage runtime (Linux) | Path of the AppImage, used for the Launch at Login autostart entry. |

## Where each value comes from

| Value | Order (first one found wins) |
| --- | --- |
| AI provider and API keys | Settings → General → AI only |
| Monthly budget | Settings → General → AI, then 50 |
| Product database connection | Settings → Products → Connections → Product database only |
| GA4 service account key | Settings → Products → Connections → Google Analytics 4 only |
| Umami API key | Settings → Products → Connections → Umami only |
| Search Console service account key, Bing API key | Settings → Products → Connections → Google Search Console or Bing Webmaster Tools only |
| X API token | Settings → Channels → X API (optional, paid) only |
| Data folder | `STARTICA_DATA_DIR`, then the per-OS default |
| Port | `PORT`, then 58300 |

Related: [Settings](/reference/settings), [Development setup](/contributing/dev-setup).
