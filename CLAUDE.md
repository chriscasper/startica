# Startica monorepo

Read [ARCHITECTURE.md](ARCHITECTURE.md) (how the desktop app works, the decisions behind it, and in section 17 the working rules) and [PLAN.md](PLAN.md) (everything left to do, for the app, the websites and the launch) before changing anything substantial. When you build something from PLAN.md, describe it in ARCHITECTURE.md and remove it from PLAN.md.

## Layout
- `apps/desktop` + `apps/desktop-web` + `packages/*`: the desktop app (Electron + Next.js + SQLite via `node:sqlite`/Drizzle) for macOS, Windows and Linux. One user per install, local-first: no Docker, no logins, no Startica server. `yarn dev:desktop` opens it.
- `apps/web`: the mystartica.com marketing site (simple-engine, Cloudflare Workers). `yarn dev` runs it together with the docs site; `yarn dev:web` alone. `yarn build` / `yarn deploy`.
- `apps/docs`: the docs.mystartica.com documentation site (simple-engine, Pagefind search). `yarn dev:docs` / `yarn build:docs` / `yarn deploy:docs`; `yarn workspace @startica/docs check` validates the sidebar and internal links. Page conventions are in `apps/docs/content/contributing/docs-and-website.md`.
- `packages/brand`: the Startica logo. Use it instead of typing "Startica" as a wordmark: `StarticaLogo`/`StarticaMark` from `@startica/brand/react` in the desktop app, `{{ site.logo | safe }}`/`{{ site.mark | safe }}` in site layouts (inside a `.brand-logo` wrapper with a height). Both draw in currentColor.
- `packages/web-theme`: the Tailwind theme both sites import.
- Yarn 4 workspaces (`nodeLinker: node-modules`), Node >= 24. Root scripts are listed in [README.md](README.md).

## Rules
- Keep everything neutral: no real products or people in examples, fixtures or tests. Use the fictional demo product Fieldnote (`packages/core/src/demo/`, `yarn seed:demo`) and `.example` / `example.com` links.
- Startica is the app; a *product* is what the user markets with it. Supabase appears only as a *product's* data source. Startica never runs SQL against a user's production database: it writes the setup SQL, the user runs it, and Startica connects only with the read-only login it creates (and refuses logins that can write).
- Next.js is 16.4 with Cache Components on; read [apps/desktop-web/AGENTS.md](apps/desktop-web/AGENTS.md) before using Next APIs. `next dev` rewrites that file, so it stays in `apps/desktop-web`.
- AI calls happen only in background jobs, through `packages/core/src/ai/client.ts`.
- Schema changes: edit `packages/db/src/schema.ts`, then `yarn db:generate`.
- Before calling desktop work done: `yarn typecheck && yarn lint && yarn test && yarn smoke:desktop`.
