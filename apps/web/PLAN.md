# Startica: Website, Docs and Open-Source Launch Plan

> Covers three things: the marketing site at **mystartica.com** (`apps/web`), the documentation site at **docs.mystartica.com** (`apps/docs`, new), and the repo work needed to publish Startica as an MIT-licensed open-source project.
> The desktop app itself is described in [apps/desktop/ARCHITECTURE.md](../desktop/ARCHITECTURE.md); what's left to build for it is in [apps/desktop/PLAN.md](../desktop/PLAN.md).
>
> Last updated: 2026-10-14. This file is the source of truth for the website and launch. Update it when a decision changes.

---

## 0. Start here

**State on 2026-10-09:** Phases W0–W3 are built. The docs have 48 pages and cover the features added since (assisted posting, new channels, X search, email campaigns, first-run setup and demo mode); `yarn workspace @startica/docs check` passes. W4 has started: real screenshots of the setup screens are in `apps/docs/public/images/setup/`. Not done: the rest of W4 (module screenshots, demo video), the git-history step (7.2), and W5 (deploys, making the repo public). W1's simple-engine work lives inside the docs site for now (5.2).

**Website and docs refresh, 2026-10-14:** the home page, privacy, roadmap, get-started and changelog pages, and the docs' overview pages, were rewritten for the four-module app and the new positioning (section 2).

**What Startica is now (the story every page tells):** an open-source, local-first desktop app (macOS, Windows, Linux): an AI co-founder for everything after you ship. Four modules do the four jobs a product has after launch: **Marketing** reaches people (Inbox, Content Studio, Ads, Analytics), **SEO & GEO** gets it found in search, AI answers and by agents, **Accessibility** makes the site work for everyone, and **Security** finds what an outsider can see. The Dashboard, Today and the Roadmap tie them together. You approve everything: it never posts, launches ads or changes your site on its own.

**Run it:** `yarn dev` starts both (site on port 9000, docs on 9001); `yarn dev:web` or `yarn dev:docs` starts one. Search only works on a build: `yarn build:docs`, then serve `apps/docs/dist`. Before a docs PR: `yarn workspace @startica/docs check`.

---

## 1. Goals

1. Explain Startica clearly to a first-time visitor in under a minute and send them to GitHub or the install guide.
2. Give users complete documentation: install, first run, every screen, every connection, troubleshooting.
3. Give contributors what they need: architecture, dev setup, how to add a channel, connector or job, and the release process.
4. Make the repo ready to publish: license, community files, CI, and no personal data.
5. Use simple-engine for both sites, and add any missing docs features to simple-engine itself rather than working around them.

### Non-goals (for now)
- Signed installers, auto-update or a download page with binaries. For now Startica is **built from source** (section 3).
- Any hosted service, account system, telemetry or newsletter backend.
- A blog. Release notes are enough for now; a blog can be a simple-engine `posts` collection later.
- Translations.

---

## 2. Positioning and messaging

**Tagline (decided 2026-10-14):** "Your AI co-founder for everything after you ship." Sub-line: "Startica finds the people who need your product, gets you found in search and AI answers, and keeps your site accessible and secure. One desktop app, your own keys, and nothing goes out without you." Replaces "Your AI marketing co-founder" now that Accessibility, SEO & GEO and Security are built. Rejected: "one app instead of five subscriptions" (frames it by what it replaces), "grow your product, keep your site in shape" (clear but forgettable), keeping the marketing headline (undersells half the app).

**The four jobs** (the home page's main section, each in its module's accent color from the app): Reach people (Marketing) · Get found (SEO & GEO) · Work for everyone (Accessibility) · Stay safe (Security). Then "how it fits together": Dashboard, Today, Roadmap and the shared scan. The marketing loop (Analyze → Find → Draft → **You approve** → Measure → Re-plan) stays in the docs' What is Startica page.

**Trust points** (repeat on the home page, privacy page and in the docs):
- **Local-first.** One SQLite file on your machine. No account, no Startica server, no telemetry.
- **Bring your own everything.** Your Claude or OpenAI key, your Google, Stripe, database and issue tracker credentials. Secrets are encrypted with the OS keychain.
- **You stay in control of cost.** Monthly AI budget cap, and every AI call is logged with its tokens and cost.
- **Nothing goes out without you.** You press the site's own button to post, launch your own ads and change your own site. No scraping, nothing that breaks a platform's terms.
- **Honest about what it checks.** "Found by automated checks"; never "compliant", "certified" or "secure". Scans only sites you own; security checks only after proof, and defensive only.
- **MIT licensed.** Fork it, change it, build on it.

**Tone:** plain, specific and honest about the current state ("build from source for now", "Windows and Linux are less tested than macOS").

**Neutrality:** no real products, people or companies as examples. Screenshots and docs use a made-up demo product (section 6.4).

---

## 3. Decisions

| Topic | Decision |
|---|---|
| Site generator | **simple-engine** for both the marketing site and the docs. Missing docs features (sidebar ordering, TOC, prev/next) get built into simple-engine when they're general, or into the docs layouts when they aren't. |
| Docs location | **docs.mystartica.com**, a separate simple-engine project in **`apps/docs`** and its own Cloudflare Worker (`startica-docs`). |
| Marketing site | **mystartica.com** stays in `apps/web` (Worker `startica-web`). |
| Shared look | One theme package, **`packages/web-theme`**, holding the Tailwind `@theme` tokens (ink, paper, chalk, signal, steel; Schibsted Grotesk + Public Sans (headings switched from Bricolage Grotesque on 2026-10-14)) and shared component classes. Both sites `@import` it. Header/footer partials are small and are duplicated per site. |
| License | **MIT**, copyright **Christopher Casper**. |
| Repo | `github.com/chriscasper/startica` (public). |
| Distribution | **Build from source** until signed installers exist. The site's main call to action is "Get started", which leads to the install guide plus GitHub. |
| Credentials | **Bring your own** for everything: Anthropic API key, Google OAuth client, Supabase OAuth client, Stripe restricted key. The docs carry a step-by-step guide for each one. |
| Examples | **Fully neutral.** No real products anywhere in the repo, docs or screenshots. |
| Docs search | **Pagefind**, run after `simple build` over `dist/`. Static index, no server. |
| Analytics on the sites | None at launch. If added later: Cloudflare Web Analytics (no cookies), stated on `/privacy`. |
| Contact | `hello@mystartica.com` (Cloudflare Email Routing) for general mail, `security@mystartica.com` for vulnerability reports. Support questions go to GitHub Discussions. |

### Rejected alternatives (don't re-propose without new information)
- **Astro Starlight / Docusaurus / VitePress for docs.** All are capable, but simple-engine is the maintainer's own generator and the project uses it.
- **Docs at `mystartica.com/docs`.** Docs are their own site on a subdomain.
- **Shipping shared OAuth clients.** Everything is bring-your-own.
- **Unsigned installers on GitHub Releases at launch.** Build-from-source until signing is in place.

---

## 4. Marketing site (`apps/web`, mystartica.com)

### 4.1 Pages

| Path | Content |
|---|---|
| `/` | Hero (tagline, "Get started" button → docs install guide, "Star on GitHub" button, an illustration of the Dashboard), the four jobs (one card per module, screenshots later), how it fits together (Dashboard, Today, Roadmap, one scan), the trust points, "How it works under the hood" (Electron + local Next.js server + SQLite + Claude, in one diagram), an "Open source" band (license, contribute, Discussions), FAQ highlights, a final call to action |
| `/get-started` | Short page: requirements (Node 24, Yarn via Corepack, git), the five commands to clone, install and run, then a link to the full install guide in the docs. States that signed installers are planned. |
| `/privacy` | What leaves your machine and when: Claude API (your key), Reddit public RSS, Hacker News Algolia API, and, only if you connect them, Google Analytics, Stripe and your product database. What stays local: everything else. No telemetry. The sites themselves use no cookies. |
| `/community` | GitHub repo, Discussions, issues, how to contribute (links to the docs' Contributing section), code of conduct, security reporting |
| `/changelog` | Release notes, rendered from the repo's `CHANGELOG.md` (copied in at build time) |
| `/roadmap` | What's next in plain language, linking to GitHub issues and milestones |
| `/marketing`, `/seo`, `/accessibility`, `/security` | One page per module (layout `module.njk`, content in frontmatter + Markdown): what it does with links to the docs, how it works, what it doesn't do, what it costs, links to the other modules. Linked from the home page's cards and the footer. |
| `/brand` | Logo, S mark and app icon downloads (generated into `public/brand/` by `scripts/generate-assets.mjs`), brand and module colors, type, and how to refer to Startica |
| `404` | Restyled, with links to home, docs and GitHub |

### 4.2 Layout and features
- Shared header: logo, Features, Docs (→ docs.mystartica.com), Changelog, Community, GitHub link.
- Shared footer: MIT notice ("© 2026 Christopher Casper · MIT License"), GitHub, Docs, Privacy, contact email.
- Keep the current visual identity (fonts, ink/signal palette, hero plane and grain), add a dark theme for content pages, and keep the existing accessibility basics (skip link, focus rings, reduced-motion respect).
- Keep simple-engine's sitemap, robots, `llms.txt`, raw Markdown copies and JSON-LD. Change the JSON-LD from `Organization` to `SoftwareApplication` (name, operating systems, `license`, `codeRepository`, `isAccessibleForFree`).
- New OG image (`scripts/generate-assets.mjs`) that matches the new message.

---

## 5. Docs site (`apps/docs`, docs.mystartica.com)

### 5.1 Information architecture

1. **Getting started**
   - What is Startica (the loop, the modules, what it doesn't do)
   - Requirements
   - Install from source (macOS, Windows, Linux), including building your own installer with `yarn build:desktop` and what the OS warnings mean for an unsigned local build
   - First run: Anthropic API key, monthly budget, add your first product
   - Your first day: run Intel, watch communities, work the Inbox, check Today
   - Updating (`git pull && yarn && yarn build:desktop`), and where your data lives so updates don't lose it
2. **Guides**
   - Finding conversations: Reddit (watched subreddits, keywords, rate limits) and Hacker News
   - Manual channels: pasting threads from X, LinkedIn and Facebook groups
   - Drafting and approving replies (scores, thresholds, regenerate, dismiss reasons, mark as posted)
   - Voice profiles: adding samples, importing from a Reddit or HN user, blends
   - Content Studio
   - Roadmap, playbooks and the weekly re-plan
   - Audits: landing page, onboarding, SEO, GEO
   - Today's moves (how they're ranked)
   - Analytics and attribution (UTM links)
   - Running in the background: tray, close-to-tray, launch at login
3. **Bring your own credentials**
   - Anthropic API key (creating one, setting a budget on both sides)
   - Google: create a Google Cloud project, enable the Analytics Data API, configure the OAuth consent screen, create the OAuth client with redirect URI `http://localhost:58300/api/integrations/google/callback`, paste it into Settings, connect, pick a GA4 property. Plus the service-account alternative.
   - Supabase: create an OAuth app, redirect URI, connect, then the metric builder (review the SQL, apply the read-only view and role). Plus the connection-URL alternative for any Postgres.
   - Stripe: create a restricted key with exactly the read permissions needed
4. **Concepts**
   - Products, conversations, opportunities, drafts, publications, moves, roadmap items, playbooks, voice profiles (the glossary from the desktop plan, rewritten for users)
   - How Startica uses AI: which model does which task and why, prompt caching, batches, what's logged
   - Costs and the budget cap
   - Data, privacy and security: the local server, the launch token, keychain encryption, what goes over the network
5. **Reference**
   - Settings, section by section
   - Background jobs and schedules
   - Environment variables (`STARTICA_DATA_DIR`, `PORT`, `STARTICA_DISABLE_JOBS`)
   - Data folder per OS, backup and restore, starting fresh
   - Command-line scripts (`yarn dev:desktop`, `smoke`, `build:desktop`…)
6. **Troubleshooting and FAQ**
   - Port 58300 in use, OAuth "redirect_uri_mismatch", keychain prompts, secrets that can't be decrypted (desktop vs. browser mode), Reddit returning few results, jobs that look stuck, the budget cap blocking calls, `ELECTRON_RUN_AS_NODE` set by the editor
7. **Contributing**
   - Architecture overview (from desktop PLAN §6, rewritten for outsiders)
   - Dev setup and monorepo layout
   - Working rules (where code goes, AI only in jobs, schema changes, checks before a PR)
   - Adding a channel adapter, a product connector, a background job, a playbook
   - Prompts and evals
   - Testing: Vitest, browser smoke, desktop smoke
   - Release process
   - Working on these docs and the website

### 5.2 Docs features

| Feature | How |
|---|---|
| Sidebar | Built from page frontmatter (`section`, `order`, `sidebarLabel`) using a `docs` collection. Section order is defined in `simple.config.js` or a data file. |
| On-page TOC | Headings already get anchors (markdown-it-anchor). Add a heading list to the page data in simple-engine, or build the TOC client-side as a fallback. |
| Prev / next | From the sorted `docs` collection |
| Edit on GitHub | Link built from `page.path` → `github.com/chriscasper/startica/edit/main/apps/docs/content/…` |
| Search | Pagefind (`pagefind --site dist`) after build, with a ⌘K / Ctrl+K dialog |
| Callouts | Note / tip / warning blocks (a markdown-it container plugin, or simple HTML classes) |
| Code blocks | Shiki (already in simple-engine) plus a copy button |
| OS tabs | Small tab component for macOS / Windows / Linux instructions |
| Dark mode | Follows the system, with a toggle |
| Copy as Markdown | simple-engine's raw `.md` copies, plus `llms.txt` and `llms-full.txt` turned on for the docs |
| Version | Show the app version the docs match (read from `apps/desktop/package.json` at build time) |

Built for now inside `apps/docs` without changing simple-engine: the sidebar comes from `site.docsNav` in `simple.config.js` (simple-engine's `sortBy` compares strings, so numeric `order` frontmatter would sort 1, 10, 2); the TOC, copy buttons and theme toggle are in `public/docs.js`; callouts and the Pagefind index are added by `scripts/postbuild.mjs`. Candidates to move into simple-engine later: numeric `sortBy`, markdown-it plugins from config (alert callouts), a heading list in page data (build-time TOC), a post-build hook, and plain heading ids (the anchor plugin percent-encodes ":" and "?", e.g. `step-1%3A-connect-claude`, so the docs avoid linking to such headings).

---

## 6. Assets and content production

1. **Screenshots** of each module in light and dark, taken from the desktop smoke run so they can be regenerated after UI changes.
2. **Main-loop diagram** and **architecture diagram** as inline SVG.
3. **Demo video or GIF** (30–60 s) for the home page and README.
4. **Demo product:** a fictional product with personas, competitors, communities, opportunities, drafts and roadmap items, loaded by a seed script into an isolated data folder (`STARTICA_DATA_DIR`). It's used for screenshots, the smoke test and new contributors trying the app.
5. **OG images** for both sites.

---

## 7. Open-source readiness (outside `apps/web`)

### 7.1 Remove product- and person-specific content ✅
Done on 2026-10-09: the one-time importer, the real-product eval set and every product-specific prompt, placeholder, playbook, test and doc string were replaced with neutral wording or the Fieldnote demo product. Prompt versions were bumped (`reply-draft@2`, `roadmap-plan@2`, `audit@2`). Remaining before launch: a secrets scan (gitleaks) over the tree and the history.

### 7.2 Git history
Local `main` includes the desktop app's earlier private history, which contains the removed product data and personal notes. Before pushing anywhere public, either:
- **(recommended)** publish a clean history: one squashed "Initial open-source release" commit, keeping the full private history in a private repo or a local branch that's never pushed; or
- rewrite the history with `git filter-repo` to drop the sensitive files.

### 7.3 Files to add
- `LICENSE` (MIT, © 2026 Christopher Casper), plus `"license": "MIT"` in every `package.json` (workspaces stay `private: true`)
- `README.md` rewritten for the public: what it is, a screenshot or GIF, quickstart, links to the docs, the license
- `CONTRIBUTING.md` (short; links to the docs' Contributing section)
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, contact `hello@mystartica.com`)
- `SECURITY.md` (report to `security@mystartica.com` or a GitHub private advisory; supported versions; scope: local server, token, keychain, OAuth callbacks)
- `SUPPORT.md` (Discussions for questions, issues for bugs)
- `CHANGELOG.md` (Keep a Changelog format; starts at 0.1.0)
- `.github/ISSUE_TEMPLATE/` (bug report with OS, version and logs; feature request; channel or connector request; `config.yml` sending questions to Discussions)
- `.github/pull_request_template.md` (what changed, checks run, screenshots)
- `.github/workflows/ci.yml` (on PRs: `yarn typecheck && yarn lint && yarn test && yarn smoke:desktop`, on macOS and Linux at least)
- `.github/workflows/sites.yml` (build both sites on PRs; deploy to Cloudflare on `main` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets in a `production` environment)
- `.github/dependabot.yml` (npm + GitHub Actions)
- `.github/FUNDING.yml` (optional, GitHub Sponsors)
- GitHub settings: Discussions on, topics, description, website link, social preview image, branch protection on `main`

### 7.4 Later (when signing lands)
- Code signing and notarization (Apple Developer ID; Windows certificate or Azure Trusted Signing)
- A release workflow that builds installers for all three OSes and attaches them to GitHub Releases
- `electron-updater` against GitHub Releases
- `/download` on the site, reading the latest release

---

## 8. Phases

### Phase W0: Repo readiness (done except history)
- [x] Remove product- and person-specific content (7.1)
- [x] Demo product seed script (6.4)
- [x] License and community files, `.github/` (7.3)
- [x] Rewrite the root README and `apps/desktop/PLAN.md` for the public
- [ ] Decide and carry out the history plan (7.2)

### Phase W1: Shared theme and docs foundation ✅
- [x] `packages/web-theme` with tokens and shared classes; `apps/web` switched to it
- [x] `apps/docs` scaffold (simple-engine, `wrangler.jsonc` for `docs.mystartica.com`, root scripts `dev:docs`, `build:docs`, `deploy:docs`)
- [x] Docs layout: header, sidebar, TOC, prev/next, edit link, dark mode
- [ ] simple-engine additions (numeric sortBy, markdown plugins, TOC data, post-build hook), then simplify `apps/docs` (5.2)
- [x] Pagefind search

### Phase W2: Marketing site ✅
- [x] Shared header/footer layout
- [x] New home page
- [x] `/get-started`, `/privacy`, `/community`, `/changelog`, `/roadmap`, 404
- [x] JSON-LD `SoftwareApplication`, new OG image

### Phase W3: Docs content (written; credential guides need a live test)
- [x] Getting started (all pages)
- [x] Bring your own credentials (all four guides written)
- [ ] Test the credential guides end to end on a fresh Google Cloud project, Supabase account and Stripe account
- [x] Guides
- [x] Concepts
- [x] Reference
- [x] Troubleshooting and FAQ
- [x] Contributing

### Phase W4: Assets
- [ ] Screenshots from the demo product (light and dark)
- [ ] Diagrams, demo GIF/video

### Phase W5: Launch
- [ ] CI and site deploy workflows green
- [ ] Deploy both sites; attach `docs.mystartica.com`
- [ ] Make the repo public; GitHub settings (7.3)
- [ ] Final check: links, `grep` for personal data, secrets scan, Lighthouse/accessibility pass on both sites

---

## 9. Open items
- Final tagline and home-page copy (draft in section 2).
- Whether to add GitHub Sponsors.
- Which minimum OS versions to state (macOS version, Windows 10/11, which Linux distros), after testing builds on Windows and Linux.
- A short name for the docs' "you" (user / founder). Default: "you".
