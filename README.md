# Startica

**Your AI marketing co-founder. Open source, and it runs on your desktop.**

Startica is a local-first desktop app (macOS, Windows, Linux) that helps a small founder market a product. It studies your product, finds conversations worth joining, drafts replies and content in your voice, gives you a short daily list of moves, and measures what worked. You approve everything, and it never posts on its own.

- **Local-first.** One SQLite file on your machine. No account, no Startica server, no telemetry.
- **Bring your own everything.** Your Claude or OpenAI API key, your Google service-account key, your Stripe restricted key, and a read-only login to your product's database that you create yourself. Secrets are encrypted with the OS keychain.
- **You control the cost.** A monthly AI budget cap, and every AI call is logged with its tokens and cost.
- **Nothing posts without you.** Publishing is copy-and-open. No scraping, nothing that breaks a platform's terms.

Website: [mystartica.com](https://mystartica.com) · Documentation: [docs.mystartica.com](https://docs.mystartica.com)

## What it does

| Module | What you get |
|---|---|
| **Intel** | A product brief, personas, competitors, keywords and communities, researched from your site and the web |
| **Inbox** | Conversations from Reddit and Hacker News (or pasted links from X, LinkedIn, Facebook groups), scored for fit, with drafted replies to review |
| **Content Studio** | Posts, threads and articles per channel, written in a voice learned from samples |
| **Analytics** | Traffic, signups and revenue from GA4, Stripe and your product's database, with per-reply attribution |
| **Roadmap + Today** | A growth roadmap across the funnel, audits (landing, onboarding, SEO, AI search), and a short list of what to do today |

## Quickstart (build from source)

Signed installers don't exist yet, so for now you run Startica from source.

Requirements: **Node.js 24+** (Startica uses `node:sqlite`) and **Yarn 4** via Corepack.

```bash
git clone https://github.com/chriscasper/startica.git
cd startica
corepack enable
yarn
yarn dev:desktop        # opens the desktop app (dev mode)
```

The welcome steps ask for your Claude or OpenAI API key and your product. The [getting started guide](https://docs.mystartica.com) walks through first run and setting up each credential.

To build an installer for your own machine: `yarn build:desktop --mac` (or `--win`, `--linux`). Builds are unsigned, so your OS will warn the first time you open one.

### Try it with demo data

`yarn seed:demo` loads a fictional product, **Fieldnote** ("a note-taking app for field researchers"), with intel, Inbox drafts, content, a roadmap and 30 days of metrics. It makes no AI calls and only writes to the folder you name:

```bash
STARTICA_DATA_DIR="$PWD/.demo-data" yarn seed:demo
STARTICA_DATA_DIR="$PWD/.demo-data" yarn dev:desktop-web   # prints a one-time login link
```

## Repository structure

```
apps/
  desktop/        # Electron shell: window, tray, keychain, installers
  desktop-web/    # Next.js server + UI the desktop app runs (SQLite, background jobs)
  web/            # mystartica.com (simple-engine, Cloudflare Workers)
  docs/           # docs.mystartica.com (simple-engine, Cloudflare Workers)
packages/
  core/           # business logic: AI client, jobs, channels, connectors, growth
  db/             # SQLite schema (Drizzle), migrations, job queue, secrets
  web-theme/      # shared Tailwind theme for the two websites
  brand/          # the Startica logo: SVG files, plus components for the sites and the desktop app
```

The desktop app's architecture and decisions are in [apps/desktop/ARCHITECTURE.md](apps/desktop/ARCHITECTURE.md); what's left to build is in [apps/desktop/PLAN.md](apps/desktop/PLAN.md).

## Scripts

| Command | Description |
|---|---|
| `yarn dev:desktop` | Open the desktop app in dev mode (hot reload) |
| `yarn dev:desktop-web` | Run the desktop app's server in a browser (prints a one-time login link) |
| `yarn build:desktop [--mac\|--win\|--linux]` | Build desktop installers into `apps/desktop/dist` |
| `yarn smoke:desktop` | Browser end-to-end test of the desktop server (isolated data) |
| `yarn seed:demo [--force]` | Load the Fieldnote demo product into `STARTICA_DATA_DIR` (absolute path) |
| `yarn db:generate` | Generate a SQL migration after editing `packages/db/src/schema.ts` |
| `yarn eval score [--model <id>]` | Run the opportunity scorer's eval set (key from your shell: `ANTHROPIC_API_KEY=… yarn eval score`, or `OPENAI_API_KEY=…` with an OpenAI `--model`) |
| `yarn eval:export score` | Add your Inbox decisions to the scorer's eval set |
| `yarn dev` | Website and docs dev servers together (ports 9000 and 9001) |
| `yarn dev:web` / `yarn build` / `yarn deploy` | Website (mystartica.com): dev server on port 9000, build, deploy to Cloudflare |
| `yarn dev:docs` / `yarn build:docs` / `yarn deploy:docs` | Docs site (docs.mystartica.com): dev server on port 9001, build, deploy |
| `yarn lint` / `yarn typecheck` / `yarn test` | Run across every workspace that defines them |

`yarn install` also fetches the Electron binary. There is no env file: keys and the budget are entered in the app, in development too.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [contributor docs](https://docs.mystartica.com/contributing/). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md), report security issues as described in [SECURITY.md](SECURITY.md), and see [SUPPORT.md](SUPPORT.md) for where to ask questions.

## Stack

- Desktop app: Electron, Next.js 16, SQLite (`node:sqlite` + Drizzle), Tailwind CSS v4 + shadcn/ui, Claude or OpenAI API
- Websites: [simple-engine](https://www.npmjs.com/package/simple-engine), Tailwind CSS v4, Cloudflare Workers (static assets)

## License

[MIT](LICENSE) © 2026 Christopher Casper
