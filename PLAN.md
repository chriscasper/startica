# Startica: what's left to do

> Everything still to build, check or decide: the desktop app, the websites (`apps/web`, `apps/docs`) and the open-source launch. How the built app works, the decisions behind it and the working rules are in [ARCHITECTURE.md](ARCHITECTURE.md); section numbers like "8.6" refer to it.
>
> When an item is built, describe it in ARCHITECTURE.md (or the docs) and remove it from here.
>
> Last updated: 2026-10-14.

---

## 1. Next up

Ordered by value for the effort.

1. **Message Batches for scoring.** Send large `opportunity_score` backlogs (and other non-urgent bulk work) through Anthropic's and OpenAI's batch APIs at about half the price; results arrive in minutes instead of seconds. Needs a job that submits, polls and stores results, and the budget guard and `ai_runs` logging for batch calls (section 5).
2. **Accessibility extras** (section 9):
   - Ignore an issue on one page only (today an ignore covers the whole site).
   - Weight the site score by traffic (today it's the plain page average).
   - An HTML version of the accessibility statement to paste into a CMS, and a PDF of the ACR draft.
   - Pass the AI summary to Today and the weekly re-plan.
3. **AI visibility** (section 10.2, G3): both providers in one run, topic breakdowns.
4. **Security S3, Deeper coverage** (section 11, shares sign-in with A6):
   - The same passive checks on pages after the user signs in by hand in a visible window (persistent per-site partition). Session cookies are read only to check their flags, never stored.
   - Safety controls: no-scan windows per site, allowed extra hosts (for example a separate login domain), and the existing Stop.
   - Done when the passive checks run on a signed-in stand-in page without storing its session.

---

## 2. Desktop app, by module

### Marketing
- More channels if wanted: Threads, YouTube comments; Facebook groups posting only if users ask.
- **Reddit's official Data API**, only if access is ever approved: script app with the password grant, a descriptive `User-Agent`, 100 requests per minute, poll `/new` per subreddit and let Startica's scoring decide relevance, store each subreddit's rules in `communities.promo_rules`.
- Eval sets for the other AI tasks (only the scorer, Accessibility and Security have one).

### Ads (section 8.6)
- **Reporting APIs for spend** (opt-in): an `ad_results_sync` job that reads spend, clicks and impressions from each platform instead of entering them by hand.
- A review of the three creative templates by a designer.

### Accessibility (section 9)
- Spelling in other languages (a dictionary per page language).
- A PDF's reading order and tables.
- External link checks on a schedule between scans.
- **A6, Harder coverage** (parked; decide per item when picked up): scans behind sign-in (persistent per-site partition, manual sign-in in a visible window like 8.4), mobile viewport, cross-origin iframes, a keyboard focus walk-through, a local CLI or MCP server for coding agents. Security S3 shares the sign-in part.

### SEO & GEO (section 10)
- Site health: redirect chains, how many clicks a page is from the home page, `hreflang`.
- Search: editable brand terms.
- AI visibility: Google AI Overviews (needs a SERP API opt-in; see open questions).
- Opportunities: queries with no matching page (needs query × page data); linking opportunities to later results.
- Issue trackers: open GitHub and GitLab issues for SEO & GEO findings (Accessibility and Security already do).
- Agent readiness, later: agent task runs (a browsing model attempts read-only tasks on public pages and reports where it got stuck; never signs in or submits forms; user-triggered with the cost shown), Web Bot Auth (signed agent requests), Content Signals in robots.txt, `Link` headers (llms.txt v2, `service-desc`).
- Off-site presence: brand mentions found through the listening channels, tracking a domain over time, dismissing a domain; close the DNS rebinding gap (the name is resolved again by `fetch` after the private-address check).

### Security (section 11)
- Detect more libraries (bundled code, source maps); certificate alerts by issuer.
- Read PDF reports when importing (with A5's pdf.js).
- Later: read-only cloud configuration review, open port monitoring, leaked-credential monitoring (needs a breach-data service), a CI check, an MCP server, a public trust page.

---

## 3. Checks that need real accounts, keys or sites

Built and tested against stand-ins; still to try for real. Each needs the owner's keys, accounts or sites (ask first: section 17).

| Area | Check |
|---|---|
| Accessibility A1 | Scan a real 250-page site in the desktop app in under 15 minutes; quit mid-scan and reopen to see it finish |
| Accessibility A3 | `yarn eval a11y` passes on both providers; an alt-text eval with real images |
| Accessibility A5 | A real site's PDFs and external links |
| SEO & GEO G2 | Search Console totals match a real property |
| SEO & GEO G3 | A real 20-question run costs within 20% of the estimate |
| Security S1 | A real HTTPS site's TLS, redirect and email results |
| Security S2 | Monitoring on a real verified domain (crt.sh rate limits and response sizes vary) |
| Security S4 | `yarn eval security` passes on both providers |
| Ads AD1 | One manual import into Google Ads Editor and one into Meta, to confirm the template columns |
| Ads AD2 | A real picture with an OpenAI key, to compare the cost with the estimate |
| Assisted posting | One real post on each of the seven sites with a signed-in account |
| Issue trackers | Real GitHub and GitLab repositories |
| Analytics | A real Umami instance |
| Credential guides | Follow the docs' credential guides end to end on a fresh Google Cloud project, Supabase account and Stripe account |
| Desktop shell | Tray, close-to-tray and launch at login on Windows and Linux (only macOS has been run) |

---

## 4. Websites and docs

Both sites are built: the marketing site (`apps/web`) and 80 docs pages (`apps/docs`), rewritten on 2026-10-14 for the four-module app. Left to do:

- **Dark screenshots**: `yarn screenshots` takes light ones only, because the app has dark styles (`.dark` in `globals.css`) but nothing turns them on yet. Once it follows the system theme, add a dark pass.
- **Diagrams** (main loop, architecture) as inline SVG, and a **demo video or GIF** (30–60 s) for the home page and README.
- **simple-engine additions**, then simplify `apps/docs`: numeric `sortBy` (string sorting puts 10 before 2, so the sidebar lives in `site.docsNav`), markdown-it plugins from config (callouts), a heading list in page data (build-time TOC instead of `public/docs.js`), a post-build hook (instead of `scripts/postbuild.mjs`), and plain heading ids (the anchor plugin percent-encodes ":" and "?", so the docs avoid linking to such headings).

---

## 5. Release and launch

- **CI and site workflows green** (`ci.yml`, `sites.yml`), then deploy both sites and attach `docs.mystartica.com`.
- **Make the repository public.** Auto-update reads its public releases, so it fails quietly until then.
- **GitHub settings:** Discussions on (the docs link to it throughout), description, topics, website link, social preview image, branch protection on `main`.
- **Final check:** links, a `grep` for personal data, a Lighthouse and accessibility pass on both sites.
- **Signing:** buy an Apple Developer ID ($99/year) and a Windows code-signing certificate or Azure Trusted Signing (paid: ask first). Until then release builds are unsigned and the sites say "build from source".
- Run the release workflow once by hand to test the Windows and Linux builds (installers, tray, launch at login), then add `/download` on the site, reading the latest release.

---

## 6. Website decisions

**Tagline (decided 2026-10-14):** "Your AI co-founder for everything after you ship." Sub-line: "Startica finds the people who need your product, gets you found in search and AI answers, and keeps your site accessible and secure. One desktop app, your own keys, and nothing goes out without you." Rejected: "one app instead of five subscriptions" (frames it by what it replaces), "grow your product, keep your site in shape" (forgettable), keeping the marketing headline (undersells half the app).

**The four jobs** (the home page's main section, each in its module's accent color): Reach people (Marketing) · Get found (SEO & GEO) · Work for everyone (Accessibility) · Stay safe (Security). Then how it fits together: Dashboard, Today, Roadmap and the shared scan.

**Trust points** (home page, privacy page and docs): local-first (one SQLite file, no account, no Startica server, no telemetry); bring your own keys and credentials, encrypted with the OS keychain; a monthly AI budget cap with every call logged; nothing goes out without you (you press the site's own button, launch your own ads, change your own site); honest about what it checks ("found by automated checks", never "compliant", "certified" or "secure"); MIT licensed.

**Tone:** plain, specific and honest about the current state ("build from source for now", "Windows and Linux are less tested than macOS").

| Topic | Decision |
|---|---|
| Site generator | **simple-engine** for both sites. General docs features go into simple-engine; the rest into the docs layouts. |
| Hosting | `mystartica.com` from `apps/web` (Worker `startica-web`); `docs.mystartica.com` from `apps/docs` (Worker `startica-docs`). |
| Shared look | `packages/web-theme`: Tailwind `@theme` tokens (ink, paper, chalk, signal, steel; Schibsted Grotesk + Public Sans) and shared component classes. Header and footer partials are duplicated per site. |
| License | MIT, © Christopher Casper. Repo `github.com/chriscasper/startica`. |
| Docs search | Pagefind over `dist/` after build. Static index, no server. |
| Analytics on the sites | None. If added later: Cloudflare Web Analytics (no cookies), stated on `/privacy`. |
| Contact | `hello@mystartica.com` for general mail, `security@mystartica.com` for vulnerability reports; support questions go to GitHub Discussions. |

Rejected (don't re-propose without new information): Astro Starlight, Docusaurus or VitePress for the docs (the project uses simple-engine); docs at `mystartica.com/docs`; shipping shared OAuth clients; unsigned installers on GitHub Releases.

---

## 7. Open questions

- **Accessibility:** whether page importance should also weigh depth from the home page when GA4 isn't connected; whether a local MCP server for coding agents belongs in Startica (A6).
- **SEO & GEO:** which provider to run AI visibility on by default when both keys are saved; whether to offer a SERP API opt-in for Google AI Overviews; whether agent task runs are worth their cost.
- **Security:** whether DNS-based look-alike checks are enough without a domain-registration feed; whether accepted risks should expire after a set time and come back for review.
- **Ads:** which reporting APIs to support for spend; whether LinkedIn and X ads join later.
- **Marketing and platform:** Opus or Fable for the weekly re-plan; automatic use of dismissal reasons as few-shot negatives; minimum supported OS versions (macOS version, Windows 10/11, which Linux distros), after testing builds on Windows and Linux.
- **Launch:** whether to add GitHub Sponsors (`.github/FUNDING.yml`).
