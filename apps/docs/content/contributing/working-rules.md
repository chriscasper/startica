---
title: Working rules
description: The rules every change to Startica follows, from where code goes to how AI calls, schema changes and UI components work.
layout: doc
---

These rules keep Startica consistent, cheap to run and safe for the people who use it. Reviewers check pull requests against them. Most of them come from decisions recorded in `apps/desktop/ARCHITECTURE.md`; if you think one is wrong, start a Discussion rather than working around it.

## Product rules

These are promises to users. Changing any of them needs a Discussion first.

- **The user always submits.** Startica may fill in a reply or post (copy-and-open on every channel, and the posting window for X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse), but the user always presses the site's own button. Never click it, press Enter or submit a form programmatically, and don't add "post for me", scheduled or bulk posting, or code that comments, votes or sends messages on a platform.
- **No AI in the browser.** Fill-ins are fixed per-site scripts with known selectors, run in an isolated world. Never send page content to an AI model or let a model drive the posting window.
- **No reading through the posting window.** It only opens the one page being posted to, and only reads the response to the user's own submit to find the new post's link. Discovery and engagement stay on public feeds and APIs.
- **Keep the posting window isolated.** The site view gets no preload, no Node and no access to the server or launch token; it shows only the site's hosts (for Mastodon and Discourse, the host in the request) and the sign-in pages in `SIGN_IN_HOSTS` (Google, Apple, GitHub, GitLab, Discord, Microsoft); permission requests are refused. When you change a site's selectors in `apps/desktop/posting/sites.mjs`, change its stand-in in `apps/desktop/scripts/posting-standins.mjs` too. See [Testing](/contributing/testing#posting-against-stand-ins).
- **No scraping.** Read only through official APIs or public feeds a platform offers (Reddit's RSS feeds, the Hacker News Algolia API). No headless browsers against platforms (the posting window posts; it never reads), no unofficial endpoints, nothing that breaks a platform's terms. Channels without a usable API stay manual (paste a link or text).
- **Local first.** No Startica server, no account, no telemetry. The only network calls are to services the user configured (their AI provider, connected metrics sources) and the public sources listed in [Privacy and security](/concepts/privacy-security). A new network destination needs a Discussion.
- **Bring your own credentials.** Don't ship shared API keys or OAuth clients.
- **No paid services** beyond the ones the user chooses to connect.

## Where code goes

| Code | Goes in |
|---|---|
| Business logic, AI prompts, jobs, channel adapters, metrics connectors | `packages/core/src/<area>/` |
| Tables, migrations, queue, secrets, change events | `packages/db/` |
| Pages, server actions, route handlers, UI components | `apps/desktop-web/src/` |
| Window, tray, keychain, packaging | `apps/desktop/` |

- **Business logic lives in `packages/core`**, not in React components or route handlers. Server actions and jobs both call into core.
- **Pages and server actions get the database through `db()`** from `apps/desktop-web/src/lib/dal.ts`. It calls `connection()` and makes sure startup has run. Don't call `getDb()` directly from app code.
- Server actions validate their input with Zod and return an `ActionResult`. The `mutate()` helper in `src/lib/actions.ts` refreshes the page on success and turns errors into a message.
- Scope every query to the workspace, and check that a product belongs to it with `productScope()` before writing.
- **Inside the Next.js server, call the server itself with `node:http`, not `fetch`.** Next patches the global `fetch`.

## AI calls

- **AI runs only in background jobs.** Pages and server actions never call the AI. They enqueue a job and show its result when it lands. This keeps requests fast and every call in one logged path.
- **Every call goes through `packages/core/src/ai/client.ts`**: `runStructured()` for data written to the database, `runResearch()` for prose with web search. No direct `@anthropic-ai/sdk` or `openai` calls anywhere else: the provider adapters (`anthropic.ts`, `openai.ts`) are called only by the client. The client handles model and provider routing, the monthly budget, prompt caching, refusal and truncation checks, and logging to `ai_runs`.
- **Structured outputs are validated with Zod.** Anything written to the database comes from `runStructured()` with a Zod schema. Never parse free text into the database.
- **Model IDs live in config, not code.** Each call names a task (`AiTask`: `ping`, `strategy`, `research`, `draft`, `vision`, `score`, `answer`, `image`), and the `ai_models` table maps tasks to a model and effort. Don't hard-code a model in a job.
- **Keep the system prompt stable.** It's marked for prompt caching. Put volatile content (dates, the thread text) in the messages.
- **Every prompt has a version string**, like `SCORE_PROMPT_VERSION = "opportunity-score@1"`, passed as `promptVersion` and logged with each run. Change the prompt, bump the version. If the prompt has an eval set, rerun it and put the result in the commit message. See [Prompts and evals](/contributing/prompts-evals).

## Database

- **Schema changes:** edit `packages/db/src/schema.ts`, run `yarn db:generate`, and commit the new migration in `packages/db/migrations`. Migrations are applied automatically on the next start.
- **Never edit a committed migration.** Write a new one.
- Every table has a text UUID `id`, a `workspace_id` and `created_at`/`updated_at`. JSON goes in JSON text columns.
- Keep `transaction()` free of network and AI calls. The whole process waits while a transaction is open.
- Text enums like `channel` are checked by TypeScript only, not by SQLite. Adding a value doesn't need a migration, but update every place that lists the values.
- Rows the user wrote or edited must survive AI rebuilds. Follow the existing `source` column pattern (`"ai"` or user-written) when you add AI-generated rows.

## UI

The app uses Tailwind CSS 4 and shadcn/ui in the `base-nova` style, which is built on **Base UI, not Radix**.

- **Compose with the `render` prop, not `asChild`:**

  ```tsx
  <DialogTrigger render={<Button size="sm" variant="outline" />}>Set up</DialogTrigger>
  ```

- **Add components with the shadcn CLI**, from `apps/desktop-web`:

  ```bash
  cd apps/desktop-web
  yarn dlx shadcn@latest add <component>
  ```

- Icons come from `lucide-react`.
- Prefer Tailwind classes in components. Edits to `globals.css` may not hot-reload in a running dev server.

### Page pattern (Cache Components)

A page's default export renders its static parts (the `PageHeader`) and wraps an `async` content component in `<Suspense fallback={<PageSkeleton />}>`. All request-time reads happen inside that child, through `db()`. Code that reads the clock (`Date.now()`) belongs in plain loader functions, not in component bodies (a React lint rule). Add `<LiveRefresh tables={[…]} />` with the tables the page shows, so it updates when a job writes to them.

### Charts

Charts use Recharts and follow these rules:

- One y-axis per chart. Metrics on different scales get separate charts.
- Series colors are validated for both light and dark backgrounds and scoped on the chart element as CSS variables, for example `[--viz-series-1:#2a78d6] dark:[--viz-series-1:#3987e5]`.
- A crosshair tooltip shows exact values.
- Every chart has a "Show as table" fallback.

`apps/desktop-web/src/app/(app)/analytics/metric-chart.tsx` is the reference implementation.

## Checks and hygiene

- **Run `yarn typecheck && yarn lint && yarn test && yarn smoke:desktop`** before you open a pull request. For changes to `apps/desktop`, also run `yarn workspace @startica/desktop smoke`, and add `--packaged` after a build.
- **Test processes use isolated ports and data.** Ports 58397–58399, a temporary `STARTICA_DATA_DIR`, and a separate `STARTICA_NEXT_DIST`. Never start a test server on 58300.
- Next.js renames its process to `next-server`, so stop leftover test servers by port (`lsof -tiTCP:58399`), not by name. A stale Startica instance blocks new launches through the single-instance lock: check with `pgrep -fl Startica`.
- **Never commit** API keys, `.env` files, `secrets/`, service-account JSON, `apps/desktop/build` or `apps/desktop/dist`, or `.next*` build folders.
- **Keep docs current.** If you change a decision, update `apps/desktop/ARCHITECTURE.md` in the same pull request; when you build something listed in `apps/desktop/PLAN.md`, describe it in ARCHITECTURE.md and remove it from PLAN.md. If you change behavior a user or contributor sees, update these docs.

## Decide on your own

You don't need to ask about library choices within the existing stack, file layout inside the packages, component structure, naming, test structure, or exact cron times. Use your judgment and explain it in the pull request.
