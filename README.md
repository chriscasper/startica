# Startica

**Your AI co-founder for everything after you ship. Open source, and it runs on your desktop.**

Startica is a local-first desktop app (macOS, Windows, Linux) for small founders. It finds the people who need your product, gets you found in search and AI answers, and keeps your site accessible and secure. You approve everything: it never posts, launches ads or changes your site on its own.

- **Local-first.** One SQLite file on your machine. No account, no Startica server, no telemetry.
- **Bring your own everything.** Your Claude or OpenAI API key, and your own analytics, Stripe, search and issue-tracker credentials. Secrets are encrypted with the OS keychain.
- **You control the cost.** A monthly AI budget cap, and every AI call is logged with its tokens and cost.
- **Nothing goes out without you.** You press the site's own button to post, launch your own ads and change your own site. No scraping, nothing that breaks a platform's terms.
- **Honest about what it checks.** Results are "found by automated checks", never "compliant" or "secure". It scans only sites you own.

Website: [mystartica.com](https://mystartica.com) · Documentation: [docs.mystartica.com](https://docs.mystartica.com)

## What it does

| Module | What you get |
|---|---|
| **Marketing** | Intel on your market, conversations worth joining on Reddit, Hacker News, Bluesky, Mastodon, Discourse and X with drafted replies, content in your voice, ad plans and creatives, and analytics from GA4 or Umami, Stripe and your product's database |
| **SEO & GEO** | Site health for search engines and AI crawlers, Search Console and Bing data, whether AI assistants recommend you, agent readiness, and one ranked list of fixes |
| **Accessibility** | WCAG 2.2 checks across your whole site in a real browser, ranked by impact, with AI fix suggestions, a manual checklist and reports |
| **Security** | Outside checks on sites you've proven are yours (HTTPS, headers, cookies, exposed files, email spoofing), plus monitoring and a disclosure kit. Defensive checks only |

The **Dashboard**, **Today** and the **Roadmap** tie the modules together: what needs you, a short list of what to do today, and a growth plan that's re-planned weekly.

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

The desktop app's architecture and decisions are in [ARCHITECTURE.md](ARCHITECTURE.md); what's left to build is in [PLAN.md](PLAN.md).

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

[MIT](LICENSE) © 2026 Christopher Casper. The license covers the code; the Startica name and logo are covered by the [trademark policy](TRADEMARKS.md).
