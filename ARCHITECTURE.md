# Startica: architecture

> **Startica** ([mystartica.com](https://mystartica.com)) is an open-source AI co-founder for everything after you ship. It's a **desktop app for macOS, Windows and Linux** (Electron + SQLite): one user per install, local-first, no account and no Startica server. It's built as modules in one shell: **Marketing**, **Accessibility**, **SEO & GEO** and **Security**.
>
> This file is for contributors: how the built app works, the decisions behind it and the rules for changing it. **What's left to build, for the app, the websites and the launch, is in [PLAN.md](PLAN.md).** User documentation lives at [docs.mystartica.com](https://docs.mystartica.com).
>
> When something in PLAN.md is built, describe it here (where the code is, the rules it keeps) and remove it from PLAN.md. Update this file when a decision changes.

---

## 0. Start here

**What's built:** Marketing (Dashboard, Intel, Inbox, Content Studio, Analytics, Roadmap, Today, Ads AD1–AD4, assisted posting on seven sites, Claude or OpenAI, first-run wizard, demo mode). Accessibility **A1–A5** (site scans with axe-core; tracking and prioritizing; AI help; checklist and reports; content and documents). SEO & GEO **G1–G6** (Site health, Search, AI visibility, Opportunities, Agents, Off-site). Security **S1, S2 and S4** (verification and outside checks on the shared crawl; exposure monitoring; AI help, report import and the disclosure kit). Release builds are unsigned until signing certificates are bought (PLAN.md).

**Run it:**
- Node.js 24+ and Yarn 4 via Corepack (`corepack enable`). Electron 44.7 bundles Node 24.21, so the installed app needs no separate Node.
- `yarn install` (also fetches the Electron binary). There is no env file: AI keys and the budget are entered in the app, in development too.
- `yarn dev:desktop` opens the desktop app (dev mode, hot reload). `yarn dev:desktop-web` runs the same server for a browser and prints a one-time login link.
- Data lives in `~/Library/Application Support/Startica/startica.db` (Windows: `%APPDATA%\Startica`, Linux: `~/.config/Startica`); `STARTICA_DATA_DIR` overrides it.
- `STARTICA_DATA_DIR=<absolute path> yarn seed:demo` loads the fictional demo product (**Fieldnote**, "a note-taking app for field researchers") into an isolated data folder. No AI calls.
- `yarn smoke:desktop` (browser) and `yarn workspace @startica/desktop smoke [--packaged]` (desktop) test end to end against isolated data.
- `yarn workspace @startica/desktop build --mac|--win|--linux` builds installers into `apps/desktop/dist/`.

**Before writing code,** read sections 3 (decisions), 6 (desktop architecture), 7 (commands), 14 (jobs) and 17 (working rules); for module work, its section (9 Accessibility, 10 SEO & GEO, 11 Security). [apps/desktop-web/AGENTS.md](apps/desktop-web/AGENTS.md) warns that Next.js 16.4 differs from older versions: read `apps/desktop-web/node_modules/next/dist/docs/` before using a Next API you haven't checked.

**Things that are easy to confuse:**
- **Startica** is the app. A **product** is what the user markets with it (a row in `products`); a user can have several.
- A **site** belongs to a product: usually the product's website, plus any docs, app or staging sites the user adds. Accessibility, SEO & GEO and Security share sites and one crawl.
- **Supabase appears in Startica only as a data source**: the product database connection reads a *product's* database for metrics, through a read-only login the owner creates with SQL Startica writes. Startica's own storage is SQLite.

---

## 1. Goals

1. **Marketing:** run the loop **analyze → plan → daily actions → human approval → measure → re-plan.**
2. **Accessibility:** run the loop **scan → prioritize → fix (with help) → verify → monitor**, so a small team can keep a site usable for everyone without an enterprise contract.
3. **SEO & GEO:** help a product get found in search, in AI answers and by AI agents, measured with the engines' own data.
4. **Security:** run the loop **verify ownership → check → prioritize → fix → recheck → monitor** for the product's own sites, without a pentest contract.
5. Be useful on a real product from the first day, for one person, without any hosted service.
6. Grow as **modules** inside one app shell that share products, sites, analytics, Today and the roadmap.
7. Keep everything local and cheap. The only outside services are APIs it calls with the user's own credentials (Claude or OpenAI, Reddit RSS, Hacker News, GA4, Stripe and so on) and the sites the user asks it to scan.

### Non-goals (for now)
- Teams, accounts, billing, or any hosted Startica service or telemetry.
- Posting anywhere without the user's approval.
- Automated account warm-up, scraping, or anything else that breaks a platform's terms.
- Certifying or claiming accessibility or security compliance, overlay widgets, or changing a live site for the user.
- Scanning sites the user doesn't own or isn't allowed to test.
- Attacking sites: Security checks configuration and exposure; it never sends exploit payloads or tries to break in (section 11.1).

---

## 2. Modules

| Module | Capability | Screens |
|---|---|---|
| **Marketing** | Market and audience intelligence | **Intel** |
| | Daily distribution: finds conversations about the problem on Reddit, Hacker News, Bluesky, Mastodon, Discourse and X (LinkedIn and Facebook groups by paste), drafts replies; the user publishes them | **Inbox** |
| | Content in a "voice bank" style learned from creators the audience follows | **Content Studio** |
| | Analytics, what worked, adapting | **Analytics** |
| | Daily tasks across the funnel | **Today** + **Roadmap** |
| | Paid ads (section 8.6): campaign plans, copy and images for Google, Meta and Reddit, launched by the user, measured through GA4 or Umami | **Ads** |
| **Accessibility** (feature set modeled on commercial accessibility platforms) | Crawl and check sites against WCAG, rank issues, help fix them, review what automation can't decide, report progress, keep monitoring | **Overview**, **Issues**, **Pages**, **Needs review**, **Images**, **Content**, **Documents**, **By criterion**, **Checklist**, **Reports** |
| **SEO & GEO** | Technical site health for search and AI, Search Console and Bing data, AI visibility, ranked fixes, agent readiness, off-site presence | **Overview**, **Site health**, **Search**, **AI visibility**, **Opportunities**, **Agents**, **Off-site** |
| **Security** (feature set compared with ten pentest and PTaaS vendors) | Ownership verification, configuration and exposure checks on the shared crawl, findings with a lifecycle and score, reports mapped to common frameworks, exposure monitoring, AI help, a disclosure kit | **Overview**, **Findings**, **Monitoring**, **Report**, **Disclosure** |

The Dashboard, Today, the Roadmap, products, sites, analytics and Settings are shared by all modules.

### Glossary

- **Product**: something the user markets with Startica. Has a brief, personas, competitors, keywords, communities, connections and a goal ladder.
- **Conversation**: a thread or post found on a channel. **Opportunity**: a conversation scored against a product (section 12.1). **Draft**: a reply Startica wrote for it. **Publication**: a draft the user posted, plus its engagement.
- **Move**: one item on the Today list. **Roadmap item**: a longer-running task tied to a funnel stage and a playbook. **Playbook**: a reusable strategy template.
- **Voice profile**: a distilled style guide built from sample posts.
- **Site**: a website checked by Accessibility, SEO & GEO and Security; belongs to a product, with a start URL, crawl limits and a schedule.
- **Scan**: one run over a site (full, one page, or one issue group's pages). Every module's page checks run on it.
- **Occurrence**: one problem on one page (an element failing an accessibility rule, a missing header on a page).
- **Issue group** (Accessibility) / **finding** (Security): the same problem across pages, fixed once; what the lists show.
- **Needs review**: a check automation couldn't decide; the user marks it Pass, Fail or Skip.
- **Profile**: the standard a site is checked against for accessibility (WCAG 2.2 AA by default).
- **Verified site** (Security): a site whose ownership was proven by DNS, a file or Search Console. Security checks run only on verified sites.

---

## 3. Decisions

| Topic | Decision |
|---|---|
| App name and domain | Startica, mystartica.com |
| License | MIT. Built from source until signed installers exist. |
| Hosting | **Desktop app** (Electron) for macOS, Windows and Linux, one SQLite file per install. Replaced an earlier local Supabase/Docker setup on 2026-10-09. |
| Users | One user per install, one workspace. Rows keep `workspace_id` so multiple workspaces or a sync service later don't need a rewrite. No team or billing UI. |
| Login | **None.** The OS user owns the data. The local server only answers requests carrying a per-launch token (section 6). |
| AI provider | **Claude or OpenAI** (decided 2026-10-09), each through its official TypeScript SDK, with the user's own key. The wizard asks which one; it sets the default model per task (section 5). With both keys saved, any task can use either provider: the model ID decides (`core/ai/models.ts`). |
| Reddit | **Read via Reddit's public RSS/Atom feeds.** Hourly: each watched subreddit's `/new/.rss` plus up to 3 keyword searches scoped to the watched subreddits; pasted links read through the thread's feed. About 1 request/minute (honors `x-ratelimit-*`). Posting is assisted (8.4) or copy and open; the API is never used to post. Why: the Data API needs approval (Responsible Builder Policy, Nov 2025), unauthenticated `.json` returns 403, and Anthropic's web tools can't reach reddit.com. |
| Hacker News | Discover through the Algolia API (free, no auth). |
| X / Twitter | **Paste by default; optional paid search** with the user's own bearer token: recent search over the top 3 listening keywords, at most every N hours (default 6), `since_id`, no user lookups, at most 50 posts a scan, a daily read cap (default 100 ≈ $0.50). API errors show in Settings → X API and don't stop the scan. Posting via X's intent links (8.4), never the API. |
| LinkedIn / Facebook groups | Manual-assist for finding conversations. LinkedIn posting is assisted (8.4) with a terms caveat; Facebook stays copy-only. |
| Publishing | Always needs approval; Startica never posts on its own. Copy-and-open works everywhere. **Assisted posting** (8.4): Startica fills the post in an in-app browser window with the user's own sign-in and **the user presses the site's own Submit button**. No AI drives the browser. |
| Mastodon, Bluesky, Discourse | **Listening through public APIs, no accounts**: Bluesky keyword search; Mastodon hashtag timelines per watched "#tag@server"; Discourse per watched forum (latest topics plus up to 3 keyword searches, paced under anonymous limits, at most 5 forums). Posting assisted (8.4). |
| Email campaigns | Content Studio channel "email", format "campaign": a 3–5 email sequence (`core/content/campaign.ts`). Startica never sends email. |
| Scan robustness | Each source in `listen_scan` runs in its own try/catch and queues its finds for scoring right away; the scoring cap is per source (60). |
| Listening config | No separate table: listening uses the product's keywords with `use_for` in (listening, both) plus its **watched** communities. |
| Storage | **SQLite** via Node's built-in `node:sqlite` + Drizzle ORM (no native modules). |
| Near-duplicates | **MinHash over word 3-grams** (`distribution/fingerprint.ts`) on `conversations.fingerprint`; anything with estimated overlap ≥ 0.6 with an opportunity from the last 14 days is archived without calling the AI. No embeddings anywhere. |
| Next.js Cache Components | **On.** Request-time reads sit behind `<Suspense>`; `app/(app)/loading.tsx` is the boundary for pages. |
| Where AI runs | **Only in background jobs.** Pages and server actions never call the AI; they enqueue a job and show results. |
| Intel rebuilds | Rebuilds replace only AI-written rows (`source = 'ai'`); owner rows, watched/ignored communities and a user-edited brief are kept. |
| Expensive jobs | `intel_build` runs once per click (`maxAttempts: 1`) with a 30-minute lease; failures show a Rebuild button instead of retrying silently. |
| Secrets | Entered in **Settings**, stored **encrypted with the OS keychain** (Electron `safeStorage`) in `secrets`. |
| Sign-ins | **None** (decided 2026-10-12). The product database uses SQL the owner runs and a read-only login. GA4 and Search Console use a **service-account key** per product. Stripe: a restricted key. |
| First run | **A short welcome wizard, then a checklist**: AI provider and key, product (starts intel), extras; then Today's **Getting started** checklist. State: `core/setup/status.ts`, setting `setup`. |
| Demo mode | "Look around with a sample product" restarts into `<data>/demo` with the Fieldnote sample, a banner and "Leave demo" (`startica-mode.json`). Scans, AI jobs and posting are off in the demo. |
| Today | **Rules, not AI**: `growth/moves.ts` ranks up to 7 moves from live state across modules. Built on first visit each day and on Refresh. |
| Roadmap | Opus writes stage-tagged items with a playbook, success metric and next step; the weekly re-plan (Monday 07:00) never changes user-owned or done items. Playbooks live in code (`growth/playbooks.ts`). |
| Audits | Landing page and onboarding on the Roadmap; SEO and AI search audits on SEO & GEO → Opportunities. Any finding can become a roadmap item. |
| Voice bank | Samples pasted or imported; Opus distills a **style guide** per profile. No embeddings. |
| Content Studio | Sonnet writes per-channel pieces in a voice; product mentions are founder-disclosed with a UTM link only when they fit. Posted pieces are tracked like Inbox replies. |
| Desktop shell | App icon from `apps/desktop/assets/icon.svg`. Tray/menu-bar icon; closing the window keeps Startica running so scheduled jobs continue; launch at login starts in the tray. |
| Charts | Recharts. One y-axis per chart, validated series colors, crosshair tooltip, "Show as table" fallback. |
| Env file | **None** (removed 2026-10-09). Only overrides remain as environment variables (section 7). |
| Modules | **Accessibility** second (2026-10-10), **SEO & GEO** third (2026-10-10), **Security** fourth (2026-10-12, section 11). |
| Accessibility engine | **axe-core** (pinned, unmodified) in a **real Chromium**: Electron's own in the desktop app (hidden windows on an isolated scan session, over IPC), Playwright's Chromium in browser dev mode and tests. No second browser download in the installed app. |
| Accessibility claims | "Issues found by automated checks"; manual review always shown as outstanding; the score is Startica's own. Never "compliant" or "certified". |
| Sites | Belong to products; a product's website is offered as its first site. Adding a site asks the user to confirm they own it or may test it. Security additionally requires proof (section 11.2). |
| SEO & GEO data | Search data from the engines' own tools (Search Console with a service-account key; optionally Bing with an API key). AI visibility through the user's own AI provider with web search, labeled as an approximation. Paid SERP APIs only as an opt-in. |
| Shared crawl | Accessibility, SEO & GEO and Security share **sites** and **one crawl per scan**: each page is rendered once and every module's checks run on it. |
| Issue trackers | **GitHub and GitLab issues from findings** (8.5): bring-your-own token per product; by hand, or automatically after scans as an opt-in. |
| Ads | Guided paid ads for Google, Meta and Reddit (8.6): plans, copy and images drafted by Startica, launched and paid for by the user in each ad manager, measured through UTM links and GA4. |
| Navigation | **Dashboard** at the top (the start page), then **one collapsible sidebar section per module**, open state remembered per device. Settings and System in the footer. Nav items in `components/app/nav.ts`; each module has an accent color (`[data-module]`). |
| Accessibility defaults | At most 250 pages a scan (up to 5,000), 1 request a second per host, a full rescan every 7 days, axe best-practice rules off by default. |
| Accessibility scheduling | **Due-based**: an hourly check enqueues a full scan for each site whose last one is older than its interval (A2). |
| Accessibility storage | Latest results only for pages, issue groups and occurrences; one summary row per scan for history; screenshots as files under `<data>/a11y/` (A2). |
| Accessibility AI | Optional extras on top of deterministic checks, run as jobs on request with the cost shown; page content is untrusted input. |
| Accessibility statement and ACR | **Templates, not AI** (decided 2026-10-12, A4): the statement and the conformance draft are built from the results and the owner's answers by fixed templates, so they can't drift into claims and cost nothing. The statement says what the owner aims for, never that the site meets it; the draft says Not Evaluated for anything not checked by hand. |
| Security scope | **Defensive checks only** (decided 2026-10-12): configuration, transport, exposure and known-vulnerable software, read with ordinary GETs, a TLS handshake and DNS lookups. No exploit payloads, fuzzing, form submission or login attempts. Human testing, crowds, red teams and attestation letters are out (section 11.1). |
| Security ownership | **Proof, not a checkbox** (decided 2026-10-12): a DNS TXT record, a file at `/.well-known/startica-verification.txt`, or the product's Search Console property covering the site. Sites on this computer or network count as the user's own. Changing a site's host undoes it. |
| Security public data | **Free public services for monitoring** (approved by the owner 2026-10-12): crt.sh (certificate transparency), OSV.dev (advisories), FIRST EPSS, CISA KEV (cached daily). They receive only the domain, library names and versions, and CVE ids. Tests and smoke runs use a stand-in (`STARTICA_SECURITY_API_BASE`). |
| Security claims | "Found by automated checks." Never "secure", "compliant", "certified" or "pentested"; framework references are "related controls for your auditor", not an assessment. |
| Demo data | The fictional product **Fieldnote** (`packages/core/src/demo/`), loaded by `yarn seed:demo`; its site `fieldnote.example` carries seeded results for every module. No real products appear in the repo. |

### Rejected alternatives (don't re-propose without new information)
- **Cloudflare Workers AI** as the AI provider (considered 2026-10-08).
- **Scraping X / LinkedIn / Facebook.** Against their terms and fragile.
- **Posting through an API aggregator** (Ayrshare, Zernio, Postiz and similar; 2026-10-09). A paid hosted dependency; assisted posting removes the same friction for free.
- **An AI agent driving a signed-in browser, or posting without a final click** (2026-10-09). Breaks the platforms' automation rules, risks the account, removes the approval step and invites prompt injection.
- **Finding conversations through the user's signed-in browser.** That is scraping with the user's account.
- **Redis + BullMQ** for jobs. A SQLite job table with leases is enough.
- **Supabase / Postgres in Docker as Startica's own backend** (until 2026-10-09).
- **Tauri** instead of Electron. Its back end is Rust; all of Startica's Node code would need a sidecar or a rewrite.
- **Running the Next.js server inside Electron's main process.** Next's dev server spawns helpers with the current executable; the server runs as a Node-mode child instead (section 6).
- **`better-sqlite3` / libSQL.** Native modules need rebuilding per platform and Electron version.
- **A separate API server.** Server actions and route handlers cover it.
- **Finding Reddit threads with Claude's web search** or **Reddit's `.json` endpoints.** Neither works (2026-10).
- **A hosted tracking SDK in the marketed product.** Startica runs on localhost; it pulls from GA4, Stripe and the product's database instead.
- **Shipping shared OAuth clients**, **Connect with Supabase (OAuth)** (removed 2026-10-12: needed write scope) and **Connect with Google (OAuth) for GA4** (removed 2026-10-10: per-user OAuth client and consent screen). Everything is bring-your-own.
- **Accessibility checks without a real browser** (jsdom + axe): no layout, so contrast and visibility come out wrong.
- **Lighthouse, pa11y or Puppeteer for scanning**, **hosted scanning APIs**, **veraPDF** (needs Java).
- **Paid rank-tracking or SERP APIs by default, or a hosted AI-visibility service** (2026-10-10). Search Console, Bing and the user's own AI key cover the core.
- **Scraping search results or consumer AI apps**, **mass-generated pages, cloaking or AI-only content.**
- **Launching or changing ad campaigns through the platforms' APIs, or driving their ad managers** (2026-10-10). Real money and real accounts; the user clicks Publish.
- **Asking the image model to render ad text.** Templates add text deterministically.
- **Accessibility overlay widgets or auto-applied AI fixes.**
- **Active attack testing in Security** (2026-10-12): injection payloads, fuzzing, brute-forcing logins or an autonomous AI pentest agent against the user's production site. Risks data and uptime on a live site, needs a hardened sandbox and expert review that vendors sell with human oversight, and a wrong scope would hit someone else's system. Revisit only as an opt-in against a staging site, with step-by-step approval.
- **Human, crowd or bug-bounty testing, red teaming and signed attestation letters** inside Startica (2026-10-12): they need people and a firm that stands behind the result.

---

## 4. Tech stack

Versions below were current on 2026-10-08. Verify with `npm view <pkg> version` before pinning.

| Layer | Choice | Notes |
|---|---|---|
| Package manager / repo | **Yarn 4 workspaces** (`nodeLinker: node-modules`) | `apps/desktop` (Electron), `apps/desktop-web` (Next.js), `packages/core`, `packages/db` |
| Desktop shell | **Electron 44.7** (Node 24.21 inside) + **electron-builder** | DMG (macOS), NSIS (Windows), AppImage (Linux). Unsigned for now. |
| App UI + server | **Next.js 16.4 (App Router, Cache Components) + TypeScript (strict)** | Runs as a local server inside the app; `src/proxy.ts` enforces the launch token. |
| UI | **Tailwind CSS 4 + shadcn/ui (`base-nova` style)** | Built on **Base UI**, not Radix: compose with the `render` prop, not `asChild`. Add components with `yarn dlx shadcn@latest add <name>` in `apps/desktop-web`. lucide icons, Recharts. |
| Database | **SQLite** (`node:sqlite`) + **Drizzle ORM** (`sqlite-proxy` driver) | Schema in `packages/db/src/schema.ts`; migrations generated by drizzle-kit and applied at startup. WAL mode, foreign keys on. |
| Jobs | In-process runner (`core/jobs/runner.ts`) over a SQLite queue; **croner** for schedules | One loop per queue, leases, retries with backoff |
| Live updates | Server-sent events (`/api/events`) fed by per-table write events | |
| Secrets | Electron `safeStorage` (OS keychain) via IPC; AES key file outside Electron (dev/tests) | `packages/db/src/secrets.ts` |
| AI | **`@anthropic-ai/sdk`** and **`openai`** (Responses API) | Section 5 |
| Web research | fetch + Mozilla Readability; the provider's **web search** tools | Crawling, competitors, AI visibility |
| Accessibility | **axe-core 4.14.0** (pinned exactly; MPL-2.0, unmodified, loaded from `node_modules` at run time, in Next's `serverExternalPackages`); Playwright's Chromium for the dev/test scanner backend only; **pdfjs-dist** (Apache-2.0), **nspell** (MIT) and **dictionary-en** (MIT AND BSD) for A5, all in `serverExternalPackages` | Section 9 |
| Security | Node's own `node:tls` and `node:dns`, `fetch`; no new dependencies in S1 | Section 11 |
| Connectors | `@google-analytics/data`, `stripe`, `postgres`; Search Console and Bing over plain HTTPS | |
| Validation | **Zod** | Shared by server actions and jobs |
| Testing | Vitest (unit, incl. real SQLite), Playwright (browser smoke + Electron smoke) | |
| Lint | ESLint (Next config) in `apps/desktop-web` | Other packages have no lint config yet |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | typecheck, lint, test and browser smoke on macOS and Linux |

---

## 5. AI: model routing and API features

Each task has a model; the provider follows from the model ID. Defaults depend on the provider picked at setup (`DEFAULT_MODELS` in `core/ai/models.ts`, which also holds prices):

| Task | Claude default | OpenAI default | Used for |
|---|---|---|---|
| `strategy` | **Claude Opus 5.5** (`claude-opus-5-5`), effort `high` | **GPT-6.1 Sol** (`gpt-6.1-sol`), effort `high` | Intel brief, roadmap, re-plans, audits, voice guides, ad plans |
| `draft` | **Claude Sonnet 5.5** (`claude-sonnet-5-5`) | **GPT-6.1 Sol** | Replies, content, ad copy, fix drafts, AI fix suggestions |
| `vision` | **Claude Sonnet 5.5** | **GPT-6.1 Sol** | Image understanding |
| `score` | **Claude Haiku 5.5** (`claude-haiku-5-5`) | **GPT-6 Luna** (`gpt-6-luna`) | Relevance scoring at volume; reading AI answers |
| `research` | **Opus 5.5** with web search + web fetch | **GPT-6.1 Sol** with `web_search` | Competitor research, audits |
| `answer` (G3) | **Sonnet 5.5**, low effort, web search | **GPT-6.1 Sol** | AI visibility answers |
| `image` (AD2) | **GPT Image 2.5 Flare** (`gpt-image-2.5-flare`, OpenAI only) | same | Ad pictures; effort is the image quality (medium by default). Sunburst offered in Settings |
| `ping` | Haiku | GPT-6 Luna | Key check |

Claude Fable 5.1 (`claude-fable-5-1`) and GPT-6 Astra (`gpt-6-astra`) cost 2.5× Opus; offered in Settings, not defaults.

**API features used** (Claude through the Messages API, `ai/anthropic.ts`; OpenAI through the Responses API, `ai/openai.ts`):
- **Structured outputs** for every call whose result goes into the database, validated with shared Zod schemas. Never parse free text into the DB.
- **Prompt caching** on the stable prefix of each prompt; keep volatile content after it.
- **Refusal handling:** Claude `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) on Opus and Sonnet plus a `stop_reason` check; OpenAI refusal and `incomplete_details` checks. Refusals logged as `refused`.
- **Effort** per task; **streaming** for research calls. Model IDs are exact strings from `models.ts`, never with date suffixes.

**Module reuse:** Accessibility (A3) and Security (S4) reuse `draft` and `vision` (messages can carry images since A3); Ads AD2 adds an `image` task (OpenAI only). Add a task type only if evals show the defaults don't fit.

**How models are configured:** model IDs and effort live in the `ai_models` table (task → model + effort + max tokens), editable in Settings, seeded with the Claude defaults (`packages/db/src/bootstrap.ts`); picking a provider moves every task still on the other provider to that provider's defaults. Prompts live next to their feature with a version string logged in `ai_runs`. Eval sets: `packages/core/src/ai/evals/<task>/` plus `yarn eval <task> [--model <id>]` (throwaway database; only the scorer has one so far). Every call is logged to `ai_runs`; the budget guard blocks calls when the **monthly cap** is reached.

---

## 6. Desktop architecture

```
Electron main process (apps/desktop/main.mjs)
 ├─ window (BrowserWindow, sandboxed) → http://127.0.0.1:58300  (session cookie = launch token)
 ├─ OS keychain (safeStorage): encrypts/decrypts secrets on request over IPC
 ├─ posting window (8.4) and the site scanner (9.3): IPC from the server child
 └─ child process: same Electron binary with ELECTRON_RUN_AS_NODE=1
      └─ Startica server (apps/desktop-web/scripts/serve.mjs in dev, serve-prod.mjs packaged)
           ├─ Next.js (pages, server actions, /api/events SSE)
           ├─ instrumentation.ts → startup.ts: open + migrate SQLite, cipher, workspace, job runner
           └─ job runner + cron schedules (only while the app is open)
```

- **Why a child process:** Next's dev server starts helper processes with the current executable; inside Electron's main process that would launch more copies of the app.
- **Security without logins:** the server binds to `127.0.0.1` only. The launcher generates a random token per run; the window gets it as an httpOnly cookie, and `proxy.ts` rejects any request without it (constant-time compare), with no exceptions. In a browser (`yarn dev:desktop-web`), open the printed `/?token=…` link once.
- Port **58300** is fixed; a second launch focuses the existing window (single-instance lock).
- **One SQLite connection per process**, shared through `globalThis`. Transactions take a process-wide lock; keep them free of network calls.
- **Data folder:** Electron's `userData`. Dev and the installed app share it. Secrets saved by the desktop app use the keychain (`ss1.` prefix); `yarn dev:desktop-web` can't decrypt them and vice versa.
- **Packaging** (`apps/desktop/scripts/build.mjs`): `next build` with `output: "standalone"` into `.next-desktop`, assembled into `apps/desktop/build/server`, then electron-builder; an `afterPack` hook copies the server into the app.
- **Tray / menu-bar icon** and **Launch at Login** (`--hidden` starts in the tray). Only the macOS paths have been run.
- **Site scanner:** `apps/desktop/scanner/scanner.mjs` keeps up to two hidden `BrowserWindow`s on the in-memory `scan` session, recycled every 50 pages. The server child (`apps/desktop-web/src/lib/scanner.ts`) sends `scan-page` with the URL, axe-core's source and the in-page script; the main process loads the page, runs the script in isolated world 1088, polls for its result and answers `scan-result` with the main document's selected response headers. The server builds every script, so the Electron side only loads pages safely and runs what it's given.
- **Electron fuses:** `RunAsNode` must stay enabled.
- **Releases** (`.github/workflows/release.yml`): a `v*` tag matching `apps/desktop/package.json` builds macOS arm64 + x64 `.dmg` and `.zip`, Windows x64 NSIS, Linux x64 AppImage and `.deb`, and uploads them to a **draft** GitHub release; a manual run builds without publishing and keeps the installers as artifacts. macOS uses the hardened runtime (`resources/entitlements.mac.plist`), is signed when `CSC_LINK` is set and notarized when the App Store Connect API key secrets are set; Windows is signed when `WIN_CSC_LINK` is set. The packaged server leaves out `sharp` (images are unoptimized). A last job (`apps/desktop/scripts/release-notes.mjs`) writes the draft's notes: a table linking each installer by its real tag, unsigned-install notes per system (and a hidden `<!-- startica:unsigned=… -->` marker), then the version's `CHANGELOG.md` entry; it fails if an installer is missing. Which files are installers is in `apps/desktop/scripts/installers.mjs`, shared with the website.
- **Download page** (mystartica.com/download): `apps/web/scripts/release.mjs` reads the latest *published* release from the GitHub API at build time into `content/download.md` (git-ignored; `layouts/download.njk`). `sites.yml` also runs on `release: published`, building from `main`; in CI a failed API request fails the build. `site.js` marks the visitor's system and, where the browser reports the chip (Chromium), the matching Mac `.dmg`.
- **Auto-update** (`apps/desktop/updater.mjs`, `electron-updater`): checks the published GitHub releases 30 s after launch and every 6 hours in the installed app, downloads in the background, offers Restart Now / Later (installs on quit); tray items "Check for Updates…" and "Check for Updates Automatically" (stored in `<data>/updates.json`).

---

## 7. Commands and development settings

| Command | Does |
|---|---|
| `yarn dev:desktop` | Opens the desktop app in dev mode (clears `ELECTRON_RUN_AS_NODE`, which some editors set) |
| `yarn dev:desktop-web` | Same server for a browser; prints a one-time login link |
| `yarn seed:demo [--force]` | Loads the Fieldnote demo into `STARTICA_DATA_DIR` (required, absolute). Refuses if a product exists; `--force` deletes existing products first. No AI calls. |
| `yarn screenshots` | Seeds the Fieldnote demo into a temp folder (plus a placeholder AI key, jobs off), runs its own server (port 58397, `.next-screenshots`) and saves the Dashboard, Today, Accessibility, SEO & GEO and Security pages at 1440×900, 2×, light, to `apps/web/public/images/app/` and `apps/docs/public/images/app/`. Rerun after UI changes; the website's home and module pages and the docs' Dashboard, Today and module overview pages use them. |
| `yarn db:generate` | After editing `packages/db/src/schema.ts`: writes a new SQL migration (applied on next start) |
| `yarn test` | Vitest across packages (DB tests use real temporary SQLite files) |
| `yarn eval score [--model <id>] [--product <name>]` / `yarn eval:export score` | The scorer's eval set (section 5), with the key from your shell; export your Inbox decisions into it |
| `yarn smoke:desktop` | Browser end-to-end run against an isolated server (port 58399, temp data, `.next-smoke`). Needs Playwright's Chromium (`yarn playwright install chromium` in `apps/desktop-web`). |
| `yarn workspace @startica/desktop smoke [dir] [--packaged]` | Launches the desktop app (or the built one) with isolated data: loading, keychain, assisted posting against stand-ins (dev only), close-to-tray, screenshots |
| `yarn workspace @startica/desktop test` | Unit tests for the posting window's per-site parts |
| `yarn workspace @startica/desktop build [--mac\|--win\|--linux]` / `icons` | Builds installers / renders the app and tray PNGs |
| `yarn workspace @startica/desktop-web a11y-standin` | Serves the stand-in site (`packages/core/src/a11y/standin/`, known problems per page for every module) on port 58395 |
| `yarn lint` / `yarn typecheck` | ESLint; `next typegen` + `tsc --noEmit` everywhere |

Environment overrides (no env file): `STARTICA_DATA_DIR`, `PORT`, `STARTICA_NEXT_DIST` (build folder), `STARTICA_DISABLE_JOBS=1`, `STARTICA_GOOGLE_API_BASE` (tests).

---

## 8. Integrations

### 8.1 Channels (finding conversations and publishing)

| Channel | Discover | Publish | Notes |
|---|---|---|---|
| **Reddit** | Public RSS feeds (`channels/reddit.ts`) | Assisted (8.4), or copy and open | ~1 request/minute per process |
| **Hacker News** | Algolia HN Search API | Assisted, or copy and open | Free, no auth |
| **X** | Paste; with the user's token, rationed recent search (`channels/x.ts`) | Assisted via intent links | Pay-per-read: section 3 |
| **LinkedIn** | Paste | Assisted, or copy and open | Terms caveat in 8.4 |
| **Facebook groups** | Paste | Copy and open | Groups API deprecated |
| **Bluesky** | Keyword search on `api.bsky.app` (`channels/bluesky.ts`) | Assisted | No account needed to read |
| **Mastodon** | Hashtag timelines per watched `#tag@server` (`channels/mastodon.ts`) | Assisted from the user's own server | Read through the finding server |
| **Discourse forums** | Per watched forum: `/latest.json` + `/search.json` (`channels/discourse.ts`) | Assisted | Paste-a-link recognizes Mastodon and Discourse links by shape |

Every channel implements the `ChannelAdapter` interface in `packages/core/src/channels/types.ts` (`discover`, `fetchThread`, optional `publish` and `fetchEngagement`).

**Self-promotion:** replies must be genuinely helpful and mention the product only when it fits, with a plain disclosure. The drafter sees each community's rules (or treats "unknown" as strict) and the recent promo rate there.

### 8.2 Product connectors (measuring results)

Each product has its own connections (`connections`, credentials in `secrets`), set up in Settings → Products. Synced daily at 08:15 by `metrics_sync` into `metrics_snapshots`, and on "Save and test" / "Sync now".

A product's **web analytics** is GA4 or Umami (`packages/core/src/metrics/web.ts`, `webSource`): both write the same metric rows under their own source, and every screen (Analytics, Content Studio, Search and AI visits, Accessibility page importance) reads the product's one source. GA4 wins when both are connected and working. Days are local days.

| Connector | Access method | Pulls |
|---|---|---|
| **Google Analytics 4** | A **service-account key** plus the property ID; the service account is a Viewer in GA4 | Sessions by source/medium/campaign, landing pages, key events; per-draft `utm_content` attribution |
| **Umami** (2026-10-13) | An **API key** (Umami Cloud, or self-hosted v3.4+; a view-only user's key for read-only access) or `username:password` for older self-hosted installs, plus the website ID and optional key-event names | The same metric rows as GA4 under source `umami`: visits as `sessions`, visitors as `users`, `source:` from the referrer domain (search engines as `organic`), `page:`, `utm_content:` visits, `event:` counts, `key_events` (the chosen events, or all), key events per `utm_content` (first-click attribution, chosen events only). Umami can't group breakdowns by day, so the sync reads one local day at a time, about 3 calls a second (Cloud allows 50 per 15 s). `packages/core/src/metrics/umami.ts`; checked against Umami v3.4.0. Limits: a visit tagged only `utm_source=chatgpt.com` with no referrer counts as direct. |
| **Stripe** | **Restricted key**, read-only on customers, subscriptions and invoices | `active_subscriptions`, `mrr`, `new_subscriptions`, `cancellations` |
| **Product database** | **Set up** → pick what to count → Startica **writes the SQL** → the owner runs it (creates `startica.daily_metrics` + read-only `startica_reader`) → paste the connection string (Startica keeps host, port, database and project, never the pasted user or password). Startica refuses any login that can write. | Daily product totals (`signups`, `active_users`, anything else) |
| **Search Console / Bing** (G2) | Service-account key (can reuse GA4's) / API key | Section 10 |

**Safe access to a production database:** aggregate-only views in a `startica` schema, a login with `SELECT` on those views only, read inside a read-only transaction. SQL is generated only from the validated form; Startica never runs it, and agents never run SQL against a user's production database.

**Attribution:** every link Startica puts in a draft gets UTM tags (`utm_content=<draft id>`), so GA4 reports visits and conversions per action.

### 8.3 Secrets
Entered in Settings and stored encrypted (OS keychain) in `secrets`; decrypted only inside the app's server process. Never committed, logged or sent anywhere except the service they belong to.

### 8.4 Assisted posting

**Post…** (desktop app only) builds a `PostingRequest` (`core/posting/requests.ts`) and opens the posting window (`apps/desktop/posting/window.mjs`): a Startica bar above the site in a `WebContentsView` on the persistent partition `persist:posting`, where each site's sign-in is kept. A fixed per-site fill-in script (`posting/sites.mjs`) runs in an isolated world and fills the post; **the user presses the site's own button**. The window watches its own network traffic (CDP, site view only) for the submit request, keeps the text actually submitted and reads the new post's link from the response, then records it through `recordPostingResult` (`core/posting/record.ts`, the same path as "Mark as posted"). If the link can't be found, the bar asks for it.

- **Limits:** X 4,000 characters, Bluesky 300, Mastodon 500 (user's server set in Settings → Posting), LinkedIn 3,000; no threads; HN, Reddit and Discourse new posts need a title; longer or unsupported text is copy-only, never cut.
- **Per site:** X uses its official intent links; HN its comment and submit forms; Reddit old.reddit.com; LinkedIn its share link and comment box (typed via `insertText`); Bluesky its compose intent; Mastodon `authorize_interaction` and `/share` on the user's server; Discourse its composer and `new-topic` link. Selectors and response parsers live in `sites.mjs`, mirrored by stand-ins in `apps/desktop/scripts/posting-standins.mjs`: change both together.
- **Rules:** deterministic (no AI in the browser, page content never reaches the AI); the user always submits (no "submit for me", schedules or bulk posting); the window only opens the page being posted to; graceful fallback to the clipboard and "Save link…"; the site view has no preload or Node, may only show the site's own hosts and Google/Apple sign-in, refuses permissions, and its user agent drops the Electron tokens.
- **LinkedIn:** its User Agreement bans automated commenting; pre-filling a box the user submits isn't addressed, so the docs say so plainly and the comment fill-in is one function to remove if LinkedIn objects. All seven sites are tested against stand-ins.

### 8.5 Issue trackers

`packages/core/src/trackers/`. One repository per product, on GitHub (or Enterprise) or GitLab (or self-hosted), with the user's own token (GitHub fine-grained **Issues: Read and write** on that repo; GitLab project token, Reporter, `api`). **Create issue** opens one repo issue per finding with a hidden marker and the tracker's labels (`tracker_issues` maps finding → issue). **Automatic** (opt-in): after each scan `tracker_sync` opens issues for new findings at or above a chosen impact (at most 10 a run), and with **Close when fixed** comments and closes them when fixed, reopening if they come back. Settings → Products → Issue tracker. Tested against `trackers/standin.mjs`. Accessibility and Security findings use it (`tracker_issues.source_kind`).

### 8.6 Ads

A guided way to plan, write, design and measure paid ads on **Google** (Search first), **Meta** and **Reddit**, in the Marketing module.

**Principles:** the user launches and pays (Startica never creates campaigns or spends money); start small and measure (test budget and a success metric per plan, measured through UTM links and GA4); platform rules first (limits and common policy pitfalls checked before hand-off; no legal advice); grounded in what Startica knows (Intel, Search Console queries, what worked organically).

**AD1, Plans and copy:** code in `packages/core/src/ads/`: `platforms.ts` (fields, limits, `AD_SPECS_CHECKED`), `checks.ts` (limits as errors; claims, guarantees, personal attributes, punctuation, competitor names as warnings), `prompts.ts` (`ad-plan@1`, `ad-copy@1`), `jobs.ts` (`ad_plan`, `ad_copy`), `campaigns.ts`, `exports.ts`; screens in `app/(app)/ads/`; downloads at `/ads/<id>/export/{google,meta,brief}`. One platform per campaign, 1–3 groups; Plan again replaces groups and ads (the UI warns). Hand-off: Google Ads Editor file (tab-separated UTF-16 with BOM), Meta bulk import CSV, a Markdown brief for every platform; everything imports **paused**. Statuses are set by the founder. Intel's keywords (with intent) and watched communities go into the plan as `<research>` (`adResearch`, `ad-plan@2`; Reddit gets watched subreddits, other platforms every watched community as interest hints).

**AD2, Creative:** `/ads/<id>/creatives`. **The AI draws the picture, a template adds the words.** `ads/creatives.ts` (sizes and file limits per platform in `CREATIVE_SPECS`, uploads, the product's logo, files under `<data>/ads/creatives/<id>/` and `<data>/ads/logos/`, the cost estimate), `ads/templates.ts` (three HTML/CSS templates, overlay, panel and frame, each laid out for wide, square and tall; a script in the page shrinks the words until they fit), `ads/render.ts` (renderer interface; Playwright in dev and tests) and `apps/desktop/renderer/render.mjs` (the app: one hidden window, size set with the DevTools protocol so any size renders at 1 px per CSS px, only files in the render folder can load; closed after 30 s idle), `ads/creative-jobs.ts` (`ad_creative_image`, `ad_creative_render`, `ad_creative_ideas`). The picture is drawn once at 2048×2048 by the `image` task (`ai/openai.ts` `openaiImage`, `client.ts` `runImage`; prompt version `ad-image@1`: no words, logos, brands or real people, calm space where the words go) and each size crops it; PNG, or JPEG when a PNG is over the platform's limit. The prompt and cost are kept with each creative; the cost is shown before drawing (output tokens per megapixel by quality) and counts toward the monthly budget. Concepts naming a competitor are refused. **Suggest ideas** (`draft` task) writes three concepts with words, template and colors as `idea` creatives; nothing is drawn until the founder asks. Without an OpenAI key: uploads or words only. The live preview in the editor is the same template in a sandboxed frame (pictures passed as data URLs). The demo renders one creative from a CSS-drawn stand-in picture while seeding (no AI). Electron 44 crashes if the size override is sent before anything has loaded, hence `about:blank` first.
- Spec research (2026-10-10): Meta feed 4:5 1440×1800 (min 600×750), Stories 9:16 1440×2560, max 30 MB; Google 1.91:1 1200×628, 1:1 1200×1200, 4:5 960×1200, 9:16 1080×1920, max 5 MB; Reddit 1080×1350 / 1080×1080, 3 MB (unconfirmed). OpenAI `gpt-image-2.5` family, custom sizes in multiples of 16 up to 3840 px and ~8.3 MP, billed by output tokens ($30 per million). AI labels: Meta only for political and social-issue ads (it labels detected AI media itself since 2026-06-01); Google for election ads and, since July 2026, AI assets in the EU, India and New York. The creative screen says this per platform and region.

**AD3, Results:** `/ads/<id>/results`, `ads/results.ts`. Spend entered by hand (`ad_spend`: per ad or for the whole campaign, over a range of local days, spread evenly when a window cuts it; optional clicks and impressions). Visits and key events per ad come from the product's web source (GA4 or Umami) by `utm_content` (the ad's id). Per ad: spend, clicks, click rate, visits, results, cost per visit and per result; a weekly read-out (last 7 days against the 7 before).

**AD4, Iterate:** rules, not AI (`suggest`): an ad is judged once it has spent max($20, the target cost, half its share of the test budget); scale at ≤ 0.8× the target cost per result (`ad_campaigns.target_cost`, else the median of the ads), keep to 1.2×, rewrite above, stop above 2× or with no results after twice the judging spend; low click rates (under half a rough median) and clicks that don't arrive as visits are called out. The most pressing stop/scale/rewrite goes on Today (kind `ads`); each suggestion can go to Today or the Roadmap (`paid-conversion` playbook), and Rewrite with AI queues `ad_copy` with guidance. The fit script reports `data-ready` as `1`, `small` (shrunk under 70%) or `overflow`; renderers pass it back and `ad_creatives.renders[].fit` records it, shown as a warning on the creative.

**Stays out:** creating or editing campaigns through the platforms' APIs or driving their ad managers; hosted ad tools that need a Startica account.

---

## 9. Accessibility module

> Feature set follows the commercial accessibility platforms, sized for one person and run locally. A1–A5 are built; A6 and the remaining items are in PLAN.md.

### 9.1 Principles

- **Never claim compliance.** The app, reports and docs say "issues found by automated checks", always show what still needs manual review, and never call a site "compliant". The score is Startica's own measure.
- **Scan only sites the user owns or may test.** Adding a site asks the user to confirm it. The crawler is polite: at most 1 request a second per host, robots.txt honored unless turned off for the user's own site.
- **Deterministic checks; AI only on top**, as jobs on request with the cost shown. **Startica suggests, the user fixes**: nothing is injected into the live site, and AI output is never applied or executed.
- **Free by default** and **local**: crawling and axe checks cost nothing; results, snippets and screenshots stay in the data folder.

### 9.2 First scans (A1)

- **Code:** `packages/core/src/a11y/`: `sites.ts` (sites, starting and stopping scans), `discovery.ts` (robots.txt, sitemaps), `urls.ts` (normalization: no fragment or query string, lowercase host; include/exclude globs; default excludes for sign-out, delete and `/api/`; what isn't a page), `scanner.ts` (backend interface and the in-page script), `playwright-backend.ts`, `scan.ts` (`site_scan`, `site_page_check`, `storePageResult`, `finishScan`), `results.ts` (findings, fingerprints, score). Screens: Accessibility → Overview, Issues, issue page, Pages, page report.
- **How a scan works:** start URL + sitemap + links from rendered pages, up to the page cap (250) and depth cap (6); each page loaded in a real Chromium two at a time, at most one load a second; axe-core runs with the profile's tags (WCAG 2.2 AA by default; AAA and best practices optional); results stored per page, issue groups recounted, fixed groups marked, score and diff saved; then SEO & GEO and Security checks run on the same pages. Resumable: every page row carries the scan id and state. **Check a page** and **Recheck** run on their own queue.
- **Issue groups:** the same rule on the same element markup (ids and hashes stripped) across pages. Lifecycle `open` → `fixed` when no longer found, reopening if it comes back.
- **Score (0–100):** per page `100 × passed / (passed + failed weight)` (critical 10, serious 5, moderate 2, minor 1); the site score averages the pages.
- **Scanning safety:** in-memory `scan` session, sandboxed, no preload or Node, permissions refused, downloads cancelled, popups denied, navigation limited to the site; requests to Startica's port and to private addresses are blocked unless the site itself is local; 30 s per page; GET only, no form submission or clicks; axe runs in an isolated world.
- **Testing:** the stand-in site (`a11y/standin/`, port 58395) has known failures per page; the end-to-end test and both smoke tests scan it and check the exact set. Fieldnote's demo results go through the same storage.

### 9.3 Track and prioritize (A2)

- **Code:** `a11y/track.ts` (due scans, priority, ignore and review, history, changes, Roadmap, CSV, Today's top issue), `a11y/wcag.ts` (WCAG 2.0–2.2 criteria with level and version; profiles; axe coverage from axe-core's own rule metadata; compliance view), `a11y/screenshots.ts`. Screens: Overview (score history chart with the target, "no critical issues" goal, What changed, priority and visits in Fix these first, Export CSV), Issues (priority, visits, Open / Fixed / Ignored, WCAG criterion filter), issue page (Ignore / Stop ignoring, Add to Roadmap), **Needs review** (`/accessibility/review`), **By criterion** (`/accessibility/compliance`), page report (screenshot with numbered boxes, **Open with highlights**). Routes: `/accessibility/export?site=` (CSV, one row per element, formula-safe), `/accessibility/pages/[id]/screenshot`.
- **Scheduled rescans:** `site_scan_due` hourly at :37 queues a full scan for each site scanned at least once whose last full scan is older than its interval (Site settings: 1, 7 (default), 14 or 30 days, or never); skips sites with one queued or running.
- **Priority:** impact weight × Σ over its pages of (1 + 30-day GA4 sessions for that path). Bands: High = critical/serious on 5+ pages or on pages with ≥ 10% of the site's tracked sessions; Medium = other critical/serious, or moderate on 5+ pages; Low = rest. GA4 sync adds `sessions` by `page:<path>` (pagePath, query string dropped).
- **Decisions, by fingerprint across scans:** Ignore for the whole site with a reason (false positive / won't fix / not applicable) and a note; Stop ignoring returns it to open or fixed. Needs review: Pass, Fail (listed as an issue and failing in By criterion; the page score still counts only axe's own results), Skip, Undo.
- **Compliance views:** WCAG 2.2 A/AA (+AAA when the site checks it), EN 301 549 and ADA Title II (WCAG 2.1 AA), Section 508 (WCAG 2.0 AA; 4.1.1 included before 2.2). Per criterion: failing / needs review / no automated failures / not testable automatically.
- **Highlights:** the in-page script records each element's box (document coordinates); pages with issues get a JPEG (1280 wide, ≤ 4,000 px, quality 60) through Playwright or, in Electron, Chromium's `Page.captureScreenshot` with `captureBeyondViewport`; latest only, under `<data>/a11y/<site id>/`, deleted with the site. **Open with highlights** (`apps/desktop/scanner/highlight.mjs`, IPC `a11y-highlight`): a visible window on an in-memory session, sandboxed, navigation kept on the site, failing elements outlined with CSS only.
- **Today and the Roadmap:** the top issue (high or medium) with the visits it affects; Add to Roadmap (owner item, playbook `accessibility-fixes`).
- **Tests:** `a11y/track.test.ts` on the demo (priority with traffic, decisions, due scans, history, profiles and statuses, CSV, Today); the end-to-end scan checks screenshots and boxes; both smoke tests (the desktop one through the Electron screenshot path). The demo has page sessions and a Needs review item.

### 9.4 AI help (A3)

- **Code:** `a11y/ai.ts` (jobs `a11y_fix_suggest`, `a11y_review_assist`, `a11y_alt_review`, `a11y_summary`; prompts `a11y-fix@1`, `a11y-review@1`, `a11y-alt@1`, `a11y-summary@1`). The AI client takes image parts (`AiMessage.content` can be text and `AiImage` parts; Claude base64 image blocks, OpenAI `input_image` data URLs). Screens: **Suggested fix** on an issue, **Ask AI** on Needs review, **Accessibility → Images** (`/accessibility/images`), **Summary** on the Overview.
- **Fix suggestion** (`draft`): rule, criteria, up to 3 failing elements' HTML and axe's summary (and the owner's guidance on Suggest again) → explanation, corrected element HTML, steps, confidence; stored on the group (`ai_fix`). Native HTML over ARIA; unknown image content gets a marked placeholder.
- **Review helper** (`vision`): the item, its first element and, when there is one, the page screenshot with the element's box → pass / fail / unsure with a reason (`ai_review`); the owner still decides.
- **Alt text review** (`vision`): the scan records each page's images (address, alt or none, decorative role, link, nearby text; ≤ 100 a page, `site_pages.images`); `syncSiteImages` (end of every scan) keeps one `a11y_images` row per address with its page count and clears a verdict when the alt text changed (`judged_alt`). A run downloads up to 50 unreviewed images, most used first (GET, raster types only, ≤ 4 MB; SVG and the rest are "check by hand"), and stores verdict good / needs better / decorative / missing, a suggested alt and the reason. Budget or key errors stop a run; one bad image doesn't.
- **Summary** (`draft`): score, recent full scans and open issues → 3–5 sentences, never claiming compliance; stored on the site with the scan it describes.
- **Eval:** `yarn eval a11y` (`scripts/eval-a11y.ts`, cases in `ai/evals/a11y/cases.ts`): each of the stand-in's planted failures (logo without alt, logo link without a name, low contrast, unlabeled input, empty button) is fixed by the model, swapped into a page in Playwright's Chromium and rechecked with the same axe rule.
- **Tests:** `a11y/ai.test.ts` (stubbed AI: what's sent, stored, skipped and made stale; a local image server); the browser smoke lists the stand-in's images; the demo has a fix suggestion, alt verdicts and a summary.

### 9.5 Manual review and reporting (A4)

- **Code:** `a11y/manual.ts` (checklist, reviews, statement, ACR draft, printable report), `a11y/wcag.ts` (`HOW_TO_TEST` for every A and AA criterion, `understandingUrl`). Screens: **Checklist** (`/accessibility/checklist`: by principle, To check / Failing / All, Passes / Fails / N/A, notes, Add to Roadmap) and **Reports** (`/accessibility/reports`). Routes: `/accessibility/report/print` (standalone HTML), `/accessibility/report/statement` and `/report/acr` (Markdown downloads).
- **Checklist:** `a11y_criteria_reviews` (site × criterion → pass / fail / not applicable / not tested, note, the owner's remark for the draft, date), shown with the automated result from `complianceView`.
- **Statement:** the owner's details on `sites.a11y_statement` (organization, contact, target WCAG 2.2 AA / 2.1 AA / 2.2 A, approach, other limitations); the text follows W3C's model (commitment, standard aimed for, how it's checked, known limitations from the top open issues and manual failures, feedback, date) and never states conformance.
- **ACR draft:** per criterion, Supports only after a manual pass with no automated failures; Partially Supports when automated failures are on under half the checked pages; Does Not Support for a manual fail or failures on half or more; Not Applicable; Not Evaluated otherwise. Remarks generated from the evidence unless the owner wrote one.
- **PDF:** **Save as PDF** (desktop) sends `save-pdf` to the Electron process, which renders `/accessibility/report/print` in a hidden window on the app's session, `printToPDF`, and asks where to save (`apps/desktop/main.mjs`; only that path is accepted). In a browser the report is printed from the browser.
- **Tests:** `a11y/manual.test.ts` (coverage of the manual tests, reviews, the ACR levels, statement and report wording with a no-claims check); the browser smoke marks a criterion, writes the statement and opens the report; the desktop smoke prints the report to PDF on the app's session. The demo has manual results and statement details.

### 9.6 Documents and content quality (A5)

- **Code:** `a11y/content.ts` (spelling, readability, content rules; per page on the shared crawl: `pageContent` before the page's transaction, `storePageContent` inside it), `a11y/documents.ts` (job `site_content_check`: PDFs and external links). Screens: **Content** (`/accessibility/content`: Broken links, Spelling, Readability, Your rules) and **Documents** (`/accessibility/documents`).
- **Page text:** the in-page script returns the main element's `innerText` (≤ 30,000 characters) and counts the site's rule selectors (`-1` for an invalid one); both scanner backends run the same script.
- **Spelling:** nspell with dictionary-en (US), only for pages in `en`/`en-US` or with no language; lowercase words of 3+ letters only, skipping tokens joined with `.`, `-`, `/`, `@` or digits (file names, code); known words are the site's `spelling_ignore`, the product name and its keywords. ≤ 50 a page, 3 suggestions each.
- **Readability:** Flesch reading ease and Flesch–Kincaid grade for English pages with ≥ 100 words, on `site_pages.readability`; a finding above `sites.readability_target` (default 9, 4–16).
- **Rules:** `sites.content_rules` (≤ 20): text contains / missing (plain, case-insensitive, or `/regex/`), selector exists / missing, links to a domain. Findings in `site_findings` (kind spelling, readability or rule).
- **Documents and links** (`site_content_check`, after every full scan and on demand; nothing for reserved names): same-origin PDFs the pages link to (≤ 200, ≤ 30 MB) read with pdf.js (`DOCUMENT_RULES`: untagged, no text, no title, title not shown, no language, figures without alt, no headings, no bookmarks on long ones, unlabeled fields) into `site_documents`; external links (≤ 500; HEAD then GET; one request a second a host, four hosts at a time; kept 7 days) into `site_links`. 401/403/429 count as "couldn't check", not broken. Internal broken links stay SEO's `broken-internal-link`.
- **Tests:** `a11y/content.test.ts` (spelling, readability, rules, the stand-in PDF with pdf.js, and end to end on the stand-in: "recieve", the dense About page, rules, the untagged price list and a 404 external link); the browser smoke checks both screens; the desktop smoke checks the Electron scanner's page text. The demo has misspellings, a dense blog post, a placeholder rule and two PDFs.

### 9.7 A6, Harder coverage

Not built; planned in PLAN.md.

**Not planned:** multi-user roles, CMS plugins, a browser extension, rewriting PDFs, human expert audits, overlay widgets.

---

## 10. SEO & GEO module

> Helps a product get found in search results (SEO), in AI answers that recommend products (GEO), and by AI agents. G1–G6 are built; the remaining items are in PLAN.md.

### 10.1 Principles

- **Measure honestly.** Search data from the engines' own tools; AI visibility through the providers' APIs with web search, which approximates the consumer apps. Every result shows the prompt, model and date.
- **Deterministic first, AI on top**, on request or opted in, with the cost shown. **Startica suggests, the user changes the site**: drafts are text to copy.
- **Stay within the search engines' rules:** no cloaking, doorway pages, mass-generated content, fake reviews or link schemes.
- **Free by default:** crawling, checks, Search Console and Bing cost nothing; AI visibility has a per-run cap; any paid data source is opt-in with the user's key.

### 10.2 Site health, search, AI visibility and opportunities (G1–G4)

- **G1, Site health (2026-10-10):** 24 rules in `core/seo/rules.ts` on the shared crawl. Page checks as each page is stored (`seo/checks.ts`, `storePageSeo`); site checks when the scan finishes (`seo/site.ts`, `finishSeo`): duplicate titles and descriptions, broken internal links, canonicals, orphans, sitemap, robots.txt per AI crawler (RFC 9309 parser, `seo/robots.ts`; crawler list with its check date in `seo/crawlers.ts`), llms.txt, home-page structured data and Open Graph. Score: 100 − 15/7/2 per high/medium/low per page; site = page average less site-wide problems. Nothing is fetched for reserved test domains (`.example`, `.test`, `.invalid`). External broken links are A5's (9.6).
- **G2, Search performance (2026-10-12):** `packages/core/src/search/`: service-account JWT with `node:crypto` (`google.ts`, scope `webmasters.readonly`), `search-console.ts` (`searchAnalytics.query`, 25,000 rows a page, ≤ 200,000 per dimension; sitemaps), `bing.ts`, `sync.ts`, `report.ts`, `ai-referrals.ts`, stand-in `standin.mjs` (`STARTICA_GOOGLE_API_BASE`). Connection kinds `search_console` and `bing_webmaster`, synced by `metrics_sync`: first sync 16 months, then the last 5 days. Stored in `search_stats` (dimensions one at a time). Flags: **striking distance** (position 4.5–20 with enough impressions) and **low click-through**. AI referrals from GA4's AI Assistant channel plus a hostname list. Limits: Google's AI Overviews report and Bing's AI citations have no API.
- **G3, AI visibility (2026-10-12):** `packages/core/src/visibility/` (`analysis.ts`, `jobs.ts`: `ai_prompts_suggest`, `ai_visibility_run`; `questions.ts`). Up to 100 questions per product, suggested from Intel without naming the product. One provider per run (the `answer` task), up to 3 web searches per answer; `score` reads each answer, and the product-name and own-citation checks in code override the model. Cost estimated (~$0.06 a question) and capped per run (default $2); weekly runs opt-in (Monday 09:30).
- **G4, Opportunities and fixes (2026-10-12):** `packages/core/src/opportunities/` (`collect.ts` computes and ranks on every visit; `drafts.ts`: `opportunity_draft`, `opportunity-draft@1`; `actions.ts`), state in `seo_opportunities`. Sources: striking-distance non-brand queries, low click-through pages, pages losing clicks, every Site health problem, questions where AI answers name competitors but not the product, comparison pages cited in those answers. Drafts are copy-only and checked before they're shown (titles and descriptions with real queries, JSON-LD validated by Site health's checks, llms.txt, FAQ answers with FAQPage JSON-LD). Actions: write in Content Studio, add to Roadmap or Today, done, dismiss, reopen. The SEO and AI search audits moved here.

### 10.3 G5, Agent readiness

Whether AI agents can understand the product and get simple things done on the site. Code in `packages/core/src/agents/` (`checks.ts` pure checks, `run.ts` inputs and the `agent_check` job); screen SEO & GEO → **Agents** (`/seo/agents`), plus a line on the Overview. History in `agent_checks` (site → score, results json, error).
- **When:** after every scan (`finishScan` queues it) and on Check now. Off in the demo (seeded history instead).
- **Requests:** only the site's own origin, as `StarticaAgentCheck/0.1`, plain GET, no JavaScript, cookies or forms: the home page, the pricing and docs pages found by path, the home page with `Accept: text/markdown`, and machine-readable files (`/.well-known/api-catalog` per RFC 9727, `/openapi.json|yaml`, `/swagger.json`, `/api/openapi.json`, `/.well-known/ai-catalog.json` per the MCP Server Cards SEP-2127, and the older `/.well-known/mcp/server-card.json`, `/.well-known/mcp.json`). A file only counts when it answers 200 with a non-HTML type (single-page apps answer every path with their HTML shell). Reserved names (`.example`) are never fetched.
- **Scored checks (weights):** reach: key pages open without sign-in (3), no bot wall (3: `cf-mitigated: challenge`, Cloudflare challenge markers, Turnstile, reCAPTCHA, hCaptcha, DataDome, Akamai, 402 pay per crawl; a long page that only embeds a form CAPTCHA isn't a wall), robots.txt lets user-request fetchers in (3, from G1's AI access); read: content in the HTML without JavaScript (3), structure from Accessibility (2), product structured data on the home page (2), pricing in plain text (3), public docs (1), llms.txt (1); act: named controls (3) and labeled forms (2) from open Accessibility issues. Pass counts fully, warn half; no score until half the weight could be checked.
- **Not scored (good to know):** API description, MCP Server Card or WebMCP tools (`document.modelContext.registerTool`, the older `navigator.modelContext`, or declarative `toolname` / `tooldescription` on forms), Markdown for agents.
- **Limits:** requests identify as Startica, not as a named assistant, so a site that only lets verified AI agents through may show a wall that they don't get; content-without-JS is judged on the home page. Signals checked 2026-10-12 (research in the G5 build notes): Chrome's Lighthouse "Agentic Browsing" and Cloudflare's agent readiness score cover similar ground.

### 10.4 G6, Off-site presence

The sites AI answers in the category lean on, and whether the product and its competitors appear there. Code in `packages/core/src/offsite/` (`domains.ts` computes on every visit; `check.ts` is the `offsite_check` job); screen SEO & GEO → **Off-site** (`/seo/offsite`). Page reads in `offsite_pages` (product × URL → read / blocked by robots / failed, title, mentions the product, competitors named).
- **Source:** citations in the last 4 finished AI visibility runs, grouped by domain (without `www.`): answers citing it, how many of those didn't mention the product, the questions and pages. Ranked by answers without the product, then all answers; the product's own site last.
- **Kinds:** own site, a competitor's site (from Intel's competitor URLs), community (Reddit, Hacker News, Stack Exchange, Quora, forum and discourse hosts…), directory or reviews (app stores and software directories), video, reference (encyclopedias, code hosts), article or blog (everything else). Each kind has its suggestion; Reddit threads offer **Watch r/…**, which adds the community to the Inbox as watching.
- **Reading the pages:** after every AI visibility run that answered something, and on demand. Up to 30 pages a run, 3 per site, none again within 7 days, one at a time with 1.5 s between requests to the same site, as `StarticaOffsiteCheck/0.1`, honouring robots.txt for that name. URLs come from AI answers, so only public http(s) hosts on the standard ports, no credentials in the URL, no private or reserved names; every name is resolved and refused if any address is private, local, shared or reserved (`privateAddress`), and redirects are followed by hand, each hop checked the same way before it's requested. A robots.txt that answers 4xx allows everything; one that can't be reached (5xx, network) allows nothing (RFC 9309). Failed pages are tried again on the next run. Known gap: the name is resolved again by `fetch` (DNS rebinding between the check and the request isn't prevented). Visible text only (scripts left out); the product and competitors are matched as whole words, with or without spaces.
- **No outreach automation:** Startica never posts, signs up, reviews or contacts anyone.

**Not planned:** paid rank tracking by default, backlink databases, scraping search results or AI apps, auto-publishing changes, mass-generated pages.

---

## 11. Security module

> Helps a small team find and fix the security problems an outside check can see on their own sites (weak HTTPS, missing headers, leaky cookies, exposed files, email spoofing, no way to report problems) and keep watching, without a pentest contract. The feature set comes from comparing commercial pentest and pentest-as-a-service offerings: Startica builds what software alone can do, locally and free, and leaves out what needs people. S1, S2 and S4 are built; S3 and later work are in PLAN.md.

### 11.1 Scope and principles

- **Defensive checks only.** Startica reads what any visitor's browser receives (pages, response headers, cookies, certificates, public DNS, a few well-known file paths) and reports configuration and exposure problems. It never sends exploit payloads, fuzzes inputs, submits forms, tries passwords or crawls beyond the site's own pages. That keeps scans safe to run against production and inside the line in section 3.
- **Verified sites only.** Security checks run only after the site's ownership is proven (11.2), which is stricter than most commercial services.
- **On the shared crawl.** Page checks run on the pages Accessibility already loads; site checks run once per scan. No second crawl, free by default.
- **Never claim security.** "Found by automated checks"; no "secure", "compliant", "certified" or "pentested" in the app, reports or docs. Automated checks see only the outside of a site; the report says so.
- **Startica suggests, the user fixes.** Nothing is changed on the site or its DNS.

| Capability | Phase |
|---|---|
| Ownership verification (DNS TXT, file, Search Console; local sites automatic) | S1 |
| Page checks: HSTS, CSP, frame protection, nosniff, referrer and permissions policies, server version, cookie flags, mixed content, insecure forms, third-party scripts without integrity, directory listings | S1 |
| Site checks: HTTPS and redirect, TLS version, certificate validity and expiry, security.txt, exposed `.git`, `.env` and `.DS_Store`, SPF and DMARC | S1 |
| Findings with a lifecycle (open, fixed, accepted risk, false positive), severity, score, recheck | S1 |
| Report with OWASP Top 10 categories and related SOC 2 and ISO 27001 controls; Today moves, Roadmap, issue trackers | S1 |
| Exposure monitoring: subdomains from certificate logs, certificate alerts, dangling DNS (takeover), look-alike domains, third-party script changes, known-vulnerable libraries with EPSS and CISA KEV ranking, alerts for new advisories, trend and time-to-fix | S2 |
| AI help and disclosure: explanations and fix suggestions for the user's stack, import findings from other vendors' reports, security.txt and disclosure policy drafts, an intake for reported problems | S4 |
| Not planned: active attack testing, human or crowd testing, red teams, bounty payments, attestation letters, mobile apps, compliance-platform sync | — |

### 11.2 Verify and check (S1)

- **Code:** `packages/core/src/security/`: `rules.ts` (31 rules: title, severity, category, page or site scope, why, fix, OWASP Top 10 category, related SOC 2 / ISO 27001 controls), `checks.ts` (pure checks), `probes.ts` (site probes), `verify.ts`, `findings.ts` (`storePageSecurity`, `finishSecurity`, lifecycle, `security_recheck`), `report.ts`, `actions.ts`. Screens: Security → Overview, Findings, finding page, Report (`/security/report/download` for Markdown). Docs: `apps/docs/content/security/`.
- **Verification:** a per-site token (`sites.security_token`); **Verify** tries the product's Search Console property (connected, last sync ok, covering the site), a TXT record `startica-verification=<token>` on the host or the host without `www.`, then `/.well-known/startica-verification.txt`. Private and local hosts verify as `local`; the demo site is `demo`. A new host clears it (`updateSite`).
- **On the shared crawl:** both scanner backends return the main document's security headers (`RESPONSE_HEADERS`, `pickHeaders` in `a11y/scanner.ts`; Electron sends every header and the server keeps these), and the in-page script adds `security` facts (insecure resources, forms, external scripts with integrity, generator, directory listing). `storePageSecurity` writes occurrences in the page's transaction; `finishScan` calls `finishSecurity`, which runs the site probes on full scans only and folds occurrences into findings. Unverified sites get no security work at all.
- **Checks:** page: HSTS (HTTPS pages) and its length, CSP missing or allowing any script, frame protection, nosniff, Referrer-Policy, Permissions-Policy (FYI), versions in `Server` / `X-Powered-By`, versioned generator (FYI), per-cookie Secure / HttpOnly / SameSite, active and passive mixed content, forms on HTTPS pages posting to http:// or password fields on http:// pages, other-host scripts without SRI (per host), directory listings. Site: HTTPS, http:// redirect, TLS version, certificate trust and 21-day expiry, security.txt (RFC 9116), `/.git/HEAD`, `/.env`, `/.DS_Store` recognized by content, SPF and DMARC (host, then a two-label parent guess). Local hosts skip HTTPS, TLS, redirect and email; reserved test domains make no requests.
- **Findings:** one per `group_key` (rule, plus cookie name, script host or header value). Open → fixed when not seen, reopening when seen again; Accept risk and Not a problem need a reason and survive scans; Reopen. Score = 100 − 30/15/7/2 per open critical/high/medium/low finding. Recheck: site-wide findings enqueue `security_recheck`; page findings start a page check.
- **Links:** Today moves (critical/high findings; verify a scanned site), Roadmap (owner item, playbook `security-fixes`), Create GitHub/GitLab issue with a "public repository" confirmation (`tracker_issues.source_kind = 'security'`, label `security`). The report lists OWASP categories and related controls as references, plus what outside checks can't see.
- **Tests:** unit tests for every check, verification helpers and the score; an end-to-end scan of the stand-in site (planted: no headers except `/clean.html`, `X-Powered-By: Standin/1.2`, an unprotected session cookie on `/signup.html`, a third-party script without SRI on `/pricing.html`, a public `/.git/HEAD`, no security.txt) expects exactly 11 open findings, then fixes the cookie and accepts a risk; both smoke tests verify, scan and check the same set (the desktop one through the Electron scanner). The demo site has open, accepted and fixed findings.

### 11.3 Principles for new checks

- Requests go to the verified site (GETs, a handshake, DNS lookups, within the crawl's rate limit), with two exceptions since S2: the approved public data services, and a GET of each third-party script the site's own pages load.
- Findings keep one lifecycle and one score; new sources (S2 monitors, S4 imported reports) add findings, not new lists.
- Outside services, even free public ones, need the user's go-ahead first (section 17).

### 11.4 Exposure monitoring (S2)

- **Code:** `security/monitor.ts` (job `security_monitor`: daily at 06:47 for every verified site, after each full scan of one, Check now, and Recheck on a monitoring finding), `security/standin.mjs` (stand-in for all four services). Screen: **Security → Monitoring** (`/security/monitoring`); the Overview gains the score trend (security score per full scan) and the average time to fix (Startica's own findings fixed in 90 days).
- **Libraries:** the in-page script detects common libraries and versions from globals and script addresses (jQuery, jQuery UI, Bootstrap, AngularJS / Angular, Vue, React, Lodash, Moment, Handlebars, DOMPurify) into `security_components` per page. OSV `querybatch` (npm ecosystem) and `vulns/{id}` give advisories with severity (GHSA database severity) and fixed versions; EPSS scores and the KEV list (cached a day in `<data>/security/kev.json`) rank them. One `vulnerable-library` finding per library@version: the worst severity, at least high when any advisory is in KEV; lists sort KEV, then EPSS, within a severity.
- **Domain:** crt.sh for `%.<domain>` (the site's host without www, or its two-label parent) gives certificates (latest 50 kept) and subdomains (≤ 100); a CNAME whose target is NXDOMAIN is `subdomain-takeover` (high). Up to 60 look-alikes (other TLDs first, then omissions, doubles, swaps, hyphens, confusable characters) checked by DNS only; each registered one is `lookalike-domain` (low). DNS is behind an injectable resolver for tests. Local and reserved hosts are skipped.
- **Scripts:** each third-party script without SRI (from the scan's occurrences, ≤ 30, ≤ 2 MB) is fetched and SHA-256 fingerprinted (`security_assets`); a changed hash opens `third-party-script-changed` (medium), which stays open until the owner accepts it.
- **Findings** from the monitor have `source = 'monitor'`, count in the score by their own severity, are fixed when no longer found (only for checks that ran: a failing service changes nothing), and Recheck reruns the monitor. Errors per service are kept on `sites.security_monitor` and shown.
- **Issue trackers:** a second automatic setting, `auto_min_security` (critical / high / medium / low), opens issues for the scans' and the monitor's findings at or above it, within the same 10 a run, labeled `security`, closed and reopened like accessibility issues; the setting says to use it only with a private repository.
- **Tests:** `security/monitor.test.ts` (each monitor's finding from fixture data; jQuery 1.12.4 ranked KEV first, then EPSS; a changed script; a fixed takeover; services down), the scan test detects the stand-in's jQuery, the tracker test opens and closes a security issue; both smoke tests run with the stand-in (the browser one sees the jQuery finding with a known-exploited advisory); the demo has monitoring data.

### 11.5 S3, Deeper coverage

Not built; planned in PLAN.md.

### 11.6 AI help and disclosure (S4)

- **Code:** `core/security/ai.ts` (jobs `security_explain`, `security_report_import`, `security_intake_triage` on the `draft` task; prompts `security-explain@1`, `security-import@1`, `security-triage@1`), `core/security/disclosure.ts` (no AI). Screens: **Help for your stack** on a finding's page, **Import a report** on Findings, **Security → Disclosure** (`/security/disclosure`). Eval set: `ai/evals/security/cases.ts`, run with `yarn eval security` (`scripts/eval-security.ts`): 3 explain, 2 import and 3 triage cases with structural checks (counts, severities, matched rules, keywords, no exploit text, no money promised).
- **Explain and fix:** the finding, its pages and the stack the site's own responses show (`Server`, `X-Powered-By`, generator) → summary, steps, up to 3 config snippets, how to verify; stored on the finding (`ai_help`, `ai_status`). Defensive guidance only.
- **Import a report:** pasted text or a text file (≤ 60,000 characters; PDFs not read yet) → up to 50 findings with `source = 'import'`, `rule = 'imported'`, their own title, description and fix, `source_label`, and `sameAs` when one matches a known rule; keyed by a hash of the title so re-importing updates. Exploit details and credentials are left out; instructions inside the report are ignored.
- **Findings from outside the scans** (`source` import or report) never change state on scans, aren't scored, and are closed with **Mark fixed**; `findingInfo` in `report.ts` gives any finding's words for screens, the report, issues and the Roadmap.
- **Disclosure kit:** security.txt generator (Contact, Expires ≤ 1 year, Policy, Preferred-Languages, Canonical), checked with the same RFC 9116 parser as the site check; a disclosure policy template in Markdown (scope from the product's sites, safe harbor, no bounty).
- **Reported problems** (`security_reports`): pasted with **Add a report**; triage gives severity, likely valid / unclear / unlikely, a duplicate (only ids Startica listed are kept), what's missing and a reply to copy. **Track as a finding** links the duplicate or adds a `source = 'report'` finding on a verified site; Resolved, Dismiss, Reopen. Startica never sends the reply.
- **Tests:** `security/ai.test.ts` (stubbed AI: what's sent and stored, re-import, lifecycle and score separation, duplicate handling, security.txt and policy); the browser smoke makes a security.txt and policy and tracks a reported problem; the demo has AI help, an imported finding and a triaged report.

### 11.7 How it fits the rest of Startica

Sites, scans and the scan header progress are shared (section 9). Search Console doubles as ownership proof (section 10). Findings feed Today, the Roadmap and the issue trackers (8.5). The weekly re-plan reads the security score as evidence.

---

## 12. Data model

Source of truth: `packages/db/src/schema.ts` (Drizzle, SQLite). Every table has a text UUID `id`, `workspace_id` (except `settings`), and `created_at`/`updated_at` (integer ms). JSON and string lists are JSON text columns. Rows the user created or edited carry `source = 'owner'`; AI-written rows `source = 'ai'`.

- **Core and system:** `workspaces`, `settings`, `secrets`, `products`, `ai_models`, `ai_runs`, `jobs`, `job_runs`.
- **Intel:** `research_docs`, `personas`, `competitors`, `keywords`, `communities`.
- **Distribution:** `conversations` (unique on workspace, channel, external id; `fingerprint`), `opportunities` (relevance, intent, reasoning, angle, status, dismiss reason, duplicate of), `drafts`, `publications`, `engagement_snapshots`.
- **Results:** `connections` (per-product connector config; kinds `ga4`, `umami`, `stripe`, `product_db`, `search_console`, `bing_webmaster`), `metrics_snapshots` (product, day, source, metric, dimension, value).
- **Voice and content:** `voice_sources`, `voice_samples`, `voice_profiles`, `content_pieces`, `content_snapshots`.
- **Growth:** `roadmap_items`, `roadmap_replans`, `daily_moves`, `audits`.
- **Sites (shared):** `sites` (product, start URL, include/exclude, caps, robots, profile toggles, interval, target, ownership confirmed at, last scan, `score`, `seo_score`, `ai_access`; Security adds `security_token`, `security_verified_at`, `security_verified_by`, `security_score`, `security_checked_at`, `security` facts), `site_scans` (scope, trigger, status, counts, axe version, `score`, `seo_score`, `security_score`, new/fixed), `site_pages` (URL, title, lang, status, depth, state in the running scan, scores, counts, `in_sitemap`, `links`, `seo` facts, gone since).
- **Accessibility:** `a11y_issue_groups` (rule, fingerprint, impact, criteria, level, counts, status, first/last seen, fixed; A2: ignore reason, note and date; review status, note and date), `a11y_occurrences` (page × group: selector, HTML, summary; A2: box); on `site_pages` (A2): `screenshot`, `screenshot_size`. A3: `a11y_images` (site × image address → alt, decorative, pages, verdict, judged alt, suggested alt, reason, status); on groups `ai_fix` and `ai_review` with their status and error; `site_pages.images`; on `sites` `a11y_summary` with status and error. A4: `a11y_criteria_reviews` (site × criterion → manual status, note, remark), `sites.a11y_statement`. A5: `site_findings` (page × kind spelling / readability / rule → key, detail), `site_documents` (PDF → status, checks, problems, linked from), `site_links` (external link → status, error, linked from; a 7-day cache); on `sites` `content_rules`, `spelling_ignore`, `readability_target`, `content_checked_at`; `site_pages.readability`.
- **SEO & GEO:** `seo_findings` (site × rule × page or site-wide, `group_key`; replaced on each check), `search_stats` (product × source × day × kind × key → clicks, impressions, position), `ai_prompts`, `ai_visibility_runs`, `ai_visibility_answers`, `seo_opportunities` (product × key → status, draft, roadmap item, content piece), `agent_checks` (site → score, results, error; history), `offsite_pages` (product × URL → read status, title, product and competitors named).
- **Security:** `security_components` (page × library × version, S2), `security_assets` (site × kind subdomain / certificate / lookalike / script × name → detail, first and last seen, changed), `sites.security_monitor`, `issue_trackers.auto_min_security`; findings `source` also `monitor`. `security_reports` (product, reporter, body, received, status new / resolved / dismissed, triage json and status, the finding it became); on `security_findings`: `source` (scan / import / report), `title`, `description`, `fix`, `source_label`, `ai_help`, `ai_status`, `ai_error`. And `security_occurrences` (site × page or site-wide × rule × `group_key` → detail; replaced per page check and per site probe run), `security_findings` (site × `group_key` → rule, severity, status open / fixed / accepted / false_positive, reason, pages count, sample detail, first and last seen, fixed at and by which scan, decided at).
- **Ads:** `ad_campaigns` (`target_cost` since AD4), `ad_groups`, `ads` (AD1); `ad_creatives` (AD2); `ad_spend` (AD3; migration 0020).
- **Issue trackers:** `issue_trackers` (one per product), `tracker_issues` (tracker × source kind `a11y` / `security` × source id → issue number, URL, state).

### 12.1 Opportunity lifecycle and default thresholds

```
new → (archived | drafting → drafted) → posted
                          └→ dismissed (with reason)
          failed (drafting failed; regenerate to retry)
```

- Score ≥ **0.7 relevance** and ≥ **0.5 intent** → queue a draft; below → `archived`. Near-duplicates are archived without scoring. Thresholds per product, set with **Scoring** in the Inbox (`core/distribution/thresholds.ts`), which previews the last 7 days and can draft up to 25 on save.
- `dismiss_reason`: `off_topic`, `wrong_audience`, `too_old`, `rules_forbid`, `already_answered`, `other`; `yarn eval:export score` turns them into eval cases.
- Conversations older than **7 days** aren't scored.

---

## 13. Screens

Every module sits inside one app shell: a left sidebar with Dashboard at the top, one collapsible section per module, Settings and System at the bottom, and the product switcher and background status indicator at the top.

| Screen | Route | Purpose |
|---|---|---|
| **Welcome** | `/welcome` | First-run wizard; "Look around with a sample product", "Skip setup" |
| **Dashboard** | `/dashboard` (`/` redirects here; the app opens on it) | Every module for the active product: Needs you (one line, closed by default, counting what's to fix and what's waiting; opens to the list, broken or risky first), Marketing, Accessibility, SEO & GEO and Security cards (per site rows), System. `dashboardSummary()` in `core/dashboard/summary.ts`: reads only, never builds Today's moves or starts work |
| **Today** | `/today` | Getting started checklist, then up to 7 ranked moves across modules |
| **Inbox** | `/inbox` | Opportunities with drafts: edit, regenerate, **Post…**, copy and open, mark posted, dismiss |
| **Content Studio** | `/content` | Create, Library (edit, rewrite, Post…, mark posted, track), Voices |
| **Ads** | `/ads`, `/ads/<id>`, `/ads/<id>/creatives`, `/ads/<id>/results` | Campaigns, plans, ad groups, ads with counts and flags, hand-off files; creatives in every size (AD2); spend, results per ad and what to do next (AD3–AD4) |
| **Roadmap** | `/roadmap` | Funnel board with playbook items, re-plans, landing and onboarding audits |
| **Intel** | `/intel` | Brief, personas, competitors, communities, keywords; your notes |
| **Analytics** | `/analytics` | Traffic, signups and revenue; what replies and posts brought in; AI referrals |
| **Accessibility** | `/accessibility`, `/issues`, `/issues/[id]`, `/pages`, `/pages/[id]`, `/review`, `/images`, `/content`, `/documents`, `/compliance`, `/checklist`, `/reports` | Overview (score and history, goal, what changed, top issues by priority, Export CSV), issues by priority with ignore, pages and page reports with highlights, Needs review, By criterion; Images, Content (links, spelling, readability, rules), Documents (PDFs), Checklist (manual results), Reports (printable report, statement, ACR draft) |
| **SEO & GEO** | `/seo`, `/seo/health`, `/seo/search`, `/seo/ai`, `/seo/opportunities`, `/seo/agents`, `/seo/offsite` | Overview, Site health, Search, AI visibility, Opportunities, Agents, Off-site |
| **Security → Overview** | `/security` | Per site: verification steps until verified; then score, findings by severity, what the site checks saw (HTTPS, certificate, email, security.txt), top findings, Scan now |
| **Security → Findings** | `/security/findings`, `/security/findings/[id]` | Findings by severity, filtered by status; a finding's why, fix, OWASP category, related controls and pages; Accept risk, False positive, Reopen, Recheck, Add to roadmap, Create issue |
| **Security → Monitoring** | `/security/monitoring` | Libraries with advisories, subdomains (dangling marked), certificates, look-alike domains, third-party script fingerprints; Check now |
| **Security → Report** | `/security/report` | The report on screen and as Markdown |
| **Security → Disclosure** | `/security/disclosure` | Reported problems with AI triage and replies to copy; security.txt generator; disclosure policy template |
| **Settings** | `/settings` | **General** (AI provider, keys, budget, models under Advanced; app settings), **Products** (products, connections, sites, issue tracker), **Channels** (X API, Mastodon server, scoring) |
| **System** | `/system` | Running and waiting jobs with Stop, job runs, AI calls and spend, test job |

---

## 14. Background jobs

**Mechanics:** pages and server actions enqueue with `enqueue(workspaceId, queue, payload)` (`packages/db/src/queue.ts`). The runner (`core/jobs/runner.ts`) runs one loop per queue: claims the next ready job with a lease, validates the payload with the job's Zod schema, runs it, deletes it on success; on failure retries with backoff up to `maxAttempts`. Every attempt writes a `job_runs` row. Expired leases make a job claimable again. Schedules (croner, local time, `SCHEDULES` in `runner.ts`): listen hourly at :07, due site scans hourly at :37, security monitoring daily at 06:47, engagement every 6 hours at :17, metrics daily at 08:15, roadmap re-plan Mondays 07:00, AI visibility Mondays 09:30. **Jobs only run while the app is open.**

**Showing progress:** `/api/activity` returns a product's `scanActivity()` (`core/jobs/activity.ts`, the Scan buttons) and the workspace's `backgroundTasks()` (`core/jobs/background.ts`); `useScanActivity()` shares one snapshot and one `/api/events` stream per page. The header's status indicator (`components/app/background-activity.tsx`) shows whenever a job is queued or running; hovering lists each task with what it is (`QUEUE_LABELS`), what it's for (product, site or campaign), its state and progress, why it runs (`SCHEDULES[].when` for a scheduled job, recognized by a payload with only `workspaceId`; else `REASONS`) and a Stop. Batch queues (`opportunity_score`, `draft_generate`, `ad_creative_render`) are one line whose Stop stops every job. A running job notes what it's on with `reportProgress(ctx.jobRunId, …)` (`channel`, or `pagesDone`/`pagesTotal`). A new queue needs a label, a reason and a page in `background.ts`.

**Stopping jobs** (`core/jobs/cancel.ts`): every running job gets `ctx.signal`. Stop on a waiting job removes it; on a running one it aborts the signal (AI calls are cut off; scans stop between pages and are recorded as `cancelled`). Long jobs should check `ctx.signal` between steps.

**Adding a job:** handler + Zod payload in `packages/core/src/...`, registered in `core/jobs/registry.ts` with `visibilityTimeoutSeconds` (must exceed its run time) and `maxAttempts`. No migration needed.

**Calling AI** (`core/ai/client.ts`): `runStructured(ctx, { task, promptVersion, system, messages, schema })` for anything written to the database; `runResearch(ctx, { task, promptVersion, system, messages, maxSearches?, maxFetches? })` for prose with web search. Both share routing, the budget guard, caching, refusal checks and `ai_runs` logging.

| Job | Trigger | Does |
|---|---|---|
| `ping` | System page | Checks the key, routing and logging |
| `intel_build` | Intel page | Crawl → research → structured write-up |
| `listen_scan` | Hourly at :07; Scan now | Discover conversations, enqueue scoring |
| `opportunity_score` | Queue | Near-duplicate check, then relevance and intent → draft or archive |
| `draft_generate` | Queue; regenerate | Drafts a reply |
| `engagement_sync` | Every 6 h at :17 | Engagement for posted replies and content (14 days) |
| `metrics_sync` | Daily 08:15; Sync now | GA4, Stripe, product DB, Search Console and Bing |
| `roadmap_plan` | Mondays 07:00; Re-plan | Updates AI roadmap items with a change summary |
| `audit_run` | Roadmap; Opportunities | Landing, onboarding, SEO or AI search audit |
| `voice_import`, `voice_profile_build` | Content Studio → Voices | Imports samples; distills a style guide |
| `content_generate`, `content_topics` | Content Studio | Writes a piece; suggests topics |
| `site_scan` | Scan now (and `site_scan_due` from A2); lease 4 h | Crawls a site, checks each page for every module, resumable; finishes Accessibility, SEO and Security results |
| `site_page_check` | Check a page; Recheck | Checks given pages now, on its own queue |
| `site_scan_due` | Hourly at :37 | Queues full scans for sites past their interval |
| `security_recheck` | Recheck on a site-level finding | Reruns the site probes and refolds the findings |
| `security_monitor` | Daily 06:47; after full scans of verified sites; Check now; Recheck | Certificate logs, DNS, third-party scripts, OSV with EPSS and KEV → monitoring findings |
| `security_explain`, `security_report_import`, `security_intake_triage` | Explain and fix; Import a report; Add a report / Triage | Fix steps for a finding; findings from another report; triage of a reported problem (all `draft`) |
| `ai_visibility_run`, `ai_prompts_suggest` | AI visibility | Asks questions with web search and reads the answers; suggests questions |
| `opportunity_draft` | Opportunities → Draft a fix | A checked title and description, JSON-LD, llms.txt or FAQ draft |
| `agent_check` | After every scan; Agents → Check now | Agent readiness checks for one site: plain requests to its own public pages plus the scan's results |
| `offsite_check` | After each AI visibility run; Off-site → Read the pages again | Reads up to 30 pages AI answers cited, politely and per robots.txt, for mentions of the product and competitors |
| `ad_plan`, `ad_copy` | Ads | Campaign plan and ad copy, checked against platform limits |
| `tracker_sync` | After scans, if automatic | Opens, closes and reopens repo issues |
| `site_content_check` | After full scans; Check documents and links now | Reads the site's linked PDFs with pdf.js and checks its external links |
| `a11y_fix_suggest`, `a11y_review_assist`, `a11y_alt_review`, `a11y_summary` | Suggest a fix; Ask AI; Review N images; Summarize | Fix suggestion (`draft`); review suggestion (`vision`); alt text review, ≤ 50 images (`vision`); summary (`draft`) |
| `ad_creative_ideas`, `ad_creative_image`, `ad_creative_render` | Ads → Creatives: Suggest ideas; Draw; after a draw, upload or edit | Three concepts (`draft`); one picture (`image`, 2048×2048); every size of the template, offscreen (local, retried once) |

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Reddit bans for self-promotion | Approval on every post, per-subreddit rules in prompts, promo-rate context, value-first drafting |
| AI costs creep up | Model routing, cheap scoring, near-duplicate skipping, prompt caching, cost tracking, hard monthly cap, per-run caps |
| Production data exposure (product DB) | Aggregate-only view, read-only role, no personal data, the owner runs the SQL, credentials encrypted locally |
| GA4 lag or missing conversions | Daily sync; confirm signup and subscribe are GA4 key events |
| Model changes or retirements | Task→model config table, eval sets, refusal fallbacks |
| Platform API changes | Adapter interfaces per channel and connector |
| X API costs | Off without a token; rationed scans with a daily read cap |
| LinkedIn objects to assisted comments, or a site redesign breaks posting | The user always submits; fixed per-site scripts with stand-ins and a clipboard fallback; the comment fill-in is one function to remove |
| Data lives on one machine | Back up the data folder; a sync service is the path if multi-device is needed |
| Jobs stop when the app is quit | Close-to-tray and launch at login |
| `node:sqlite` is still marked experimental | Electron pins the Node version; Drizzle contains a driver switch to `packages/db/src/client.ts` |
| Unsigned installers | Build from source for now; signing before publishing binaries |
| Users read automated results as legal compliance or as "secure" | Wording rules (9.1, 11.1, 17), manual review shown as outstanding, reports say what automation can't see, no legal advice |
| False positives or missed issues | Pinned engines, Needs review, ignore / false positive with reasons, stand-in fixtures per rule, exposed files recognized by content |
| Scanning hostile or heavy sites | Sandboxed scan session, no Startica access, permission and download blocks, per-page limits (9.2) |
| Scanning or probing sites the user doesn't control | Ownership confirmation for every site; **proof of ownership before any security check**; polite crawl rate; robots.txt honored; probes are plain GETs, a handshake and DNS lookups |
| A security check harms a live site | No payloads, form submissions or login attempts; one GET per probe path; the crawl's rate limit |
| Security findings or tokens leak from the data folder | Findings stay local like every other result; the verification token is not a secret (it only proves control of the site) |
| Large sites bloat the database | Latest results only plus per-scan summaries; page cap |
| Single-page apps or cookie banners hide content | Links read from rendered pages, manual URL lists |
| Page or report content steers AI output (prompt injection) | Content passed as data, structured outputs, no tools, the user applies every fix |
| Ads waste money or break policy; generated images break rules | Small test budgets, the user launches, limits checked, the platforms' review is final, no real likenesses or other brands |
| AI visibility numbers read as exact | Provider, model, date and full answer on every result; trends over single runs |
| SEO advice that breaks search guidelines | No cloaking, doorway or mass-generated pages |
| AI crawler names change | The crawler list lives in code with its check date |
| Port 58300 taken | The app shows a clear error |

---

## 16. Credentials (bring your own)

Everything Startica talks to uses the user's own credentials, entered in Settings; step-by-step guides are in the docs.

- **AI key (Anthropic or OpenAI):** the welcome wizard or Settings → AI.
- **Google Analytics / Search Console:** a service account with a JSON key, added as a Viewer (GA4) or user (Search Console); key and property in Settings → Products.
- **Product database:** Settings → Products → Product database → Set up writes the SQL; run it, then paste the connection string.
- **Stripe:** a restricted key. **Bing Webmaster Tools:** an API key. **GitHub / GitLab:** a token scoped to one repository.

Accessibility needs no credentials. Security needs none either: ownership is proven with a DNS record or a file the user publishes, or with the Search Console connection.

---

## 17. Working rules for agents and contributors

- **Ask before:** running anything against a user's production database; posting anything anywhere; adding a paid service or a new hosted dependency (free public APIs included); scanning or probing any real site other than the stand-ins and `example.com` pages.
- **Decide on your own:** library choices within the stack above, file layout inside the packages, component structure, naming, test structure, exact cron times.
- **Never commit** API keys, `secrets/`, service-account JSON, `apps/desktop/build|dist`, `.next*` build folders, data folders, or eval exports of real products.
- **Keep the repo neutral:** examples, fixtures, tests and screenshots use the fictional demo product (Fieldnote) or other made-up names, with `.example` / `example.com` links. No real products, people or personal data.
- **Schema changes:** edit `packages/db/src/schema.ts`, run `yarn db:generate`, commit the new migration. Never edit a committed migration. A new NOT NULL column needs a SQL default (`.default(...)`). Before committing a migration, run it against a copy of a real data folder (`sqlite3 <db> ".backup copy.db"`, then `migrateDatabase`). Update the demo seed if the change affects it.
- **Business logic lives in `packages/core`**, not in React components or route handlers. Pages/actions get the DB through `db()` in `apps/desktop-web/src/lib/dal.ts`.
- **Every AI call** goes through the core AI client (`runStructured` / `runResearch`), and only from jobs.
- **Run `yarn typecheck && yarn lint && yarn test && yarn smoke:desktop`** before calling work done; for desktop changes also `yarn workspace @startica/desktop smoke` (and `--packaged` after a build).
- **Page pattern (Cache Components):** a page's default export renders static parts and wraps an `async` content component in `<Suspense fallback={<PageSkeleton />}>`; request-time reads happen inside it through `db()`. Clock reads belong in plain loader functions. In the shared layout, read `usePathname()` / `useSearchParams()` only in leaf components inside `<Suspense>`, and touch the database only after something called `connection()`; otherwise dynamic routes fail the production build's prerender (`yarn workspace @startica/desktop build` shows it, `yarn dev` doesn't).
- **Inside the Next server, use `node:http` (not `fetch`) to call the local server itself**: Next patches the global `fetch`.
- **Test processes:** isolated ports 58395–58399 (58395 the stand-in site, 58396 the posting stand-ins), `STARTICA_DATA_DIR` temp folders, separate `STARTICA_NEXT_DIST` folders. Clean up by port (`lsof -tiTCP:<port>`); check `pgrep -fl Startica` for stale instances.
- **A developer's own `yarn dev:desktop` may be running** on port 58300. Don't start another, and never delete `apps/desktop-web/.next` while it runs.
- **Editing `globals.css` may not hot-reload**; prefer Tailwind classes in components.
- **Prompts** are versioned: bump the version string, re-run its eval, note the score in the PR.
- **Accessibility wording:** never write that a site is "compliant", "certified" or "accessible" based on scan results. Say what the automated checks found and what still needs manual review.
- **Accessibility engine:** keep axe-core pinned and unmodified; when upgrading, re-run `a11y/scan.test.ts` and both smoke tests, and fix the stand-in site rather than the expectations unless the new finding is right.
- **SEO & GEO advice** stays inside the search engines' published guidelines. AI-visibility results always show the provider, model, date and full answer.
- **Security:** checks stay passive (GETs of pages and well-known paths, a TLS handshake, DNS lookups); never add payloads, fuzzing, form submission or login attempts. Every security request goes to a verified site. Never write that a site is "secure", "compliant", "certified" or "pentested"; framework references are "related controls".
- **Keep this file and PLAN.md current.** When a decision changes, update section 3 (and "Rejected alternatives") in the same change. When something in PLAN.md is built, describe it here (where the code is, the rules it keeps) and remove it from PLAN.md; anything still missing goes back into PLAN.md.
