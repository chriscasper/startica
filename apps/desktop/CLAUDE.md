# Startica

Read [ARCHITECTURE.md](ARCHITECTURE.md) first. Section 0 says what's built and how to run it; section 6 explains the desktop architecture; sections 9, 10 and 11 describe the Accessibility, SEO & GEO and Security modules; section 17 lists the working rules (what to ask before doing, where code goes, which checks must pass). [PLAN.md](PLAN.md) lists only what's left to do: when you build something from it, describe it in ARCHITECTURE.md and remove it from PLAN.md.

Quick facts:
- Desktop app (Electron + Next.js + SQLite via `node:sqlite`/Drizzle) for macOS, Windows and Linux. One user per install, local-first: no Docker, no logins, no Startica server. `yarn dev:desktop` opens it.
- Startica is the app; a *product* is what the user markets with it. Supabase appears only as a *product's* data source. Startica never runs SQL against a user's production database: it writes the setup SQL, the user runs it, and Startica connects only with the read-only login it creates (and refuses logins that can write).
- Keep the repo neutral: examples, fixtures and tests use the fictional demo product Fieldnote (`packages/core/src/demo/`, `yarn seed:demo`) and `.example` / `example.com` links.
- Next.js is 16.4 with Cache Components on; see `apps/desktop-web/AGENTS.md` before using Next APIs.
- AI calls happen only in background jobs, through `packages/core/src/ai/client.ts`.
- Schema changes: edit `packages/db/src/schema.ts`, then `yarn db:generate`.
