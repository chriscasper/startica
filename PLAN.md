# Startica: what's left to do

> Everything still to build, check or decide: the desktop app, the websites (`apps/web`, `apps/docs`) and the open-source launch. How the built app works, the decisions behind it and the working rules are in [ARCHITECTURE.md](ARCHITECTURE.md); section numbers like "8.6" refer to it.
>
> When an item is built, describe it in ARCHITECTURE.md (or the docs) and remove it from here.
>
> Last updated: 2026-11-14.

---

## 1. Next up

Ordered by value for the effort.

Nothing queued here right now: pick from the module lists below.

---

## 2. Desktop app, by module

### Marketing
- More channels if wanted: Threads, YouTube comments; Facebook groups posting only if users ask.
- **Reddit's official Data API**, only if access is ever approved: script app with the password grant, a descriptive `User-Agent`, 100 requests per minute, poll `/new` per subreddit and let Startica's scoring decide relevance, store each subreddit's rules in `communities.promo_rules`.
- More work through batches (ARCHITECTURE.md 5.2), if the savings matter: the alt text review, competitor post relevance, the weekly analytics read-out.
- Eval sets for the other AI tasks (only the scorer, Accessibility and Security have one), starting with the weekly analytics read-out (`analytics-summary@1`): does it stick to the numbers it's given.
- **Content calendar and plans** (section 8.7): an eval set for `content-plan@1` (slots inside the range, no invented facts, uses the best-time hints) and `post-image@1`; attaching post images in assisted posting (today Post… fills text only and the owner attaches the image); best-time hints cached in `settings` only if computing them on each page view gets slow; Windows and Linux notification clicks (only macOS has been run).
- **Analytics** (section 8.2): upgrades and downgrades in MRR movement (needs Stripe's subscription events), currencies other than US dollars, and a channel chart over time.
- **Competitor benchmarks and watch** (section 3): X benchmarks (follower numbers) only if the owner changes the no-user-lookups decision (with the owner's token, rationed under the daily read cap; `x` is already in `benchmarkChannels`). An eval set for `competitor-profile@1` (no invented prices or people, only URLs from the notes, the people rules), `competitor-brief@1` (only URLs from the material, rollups that keep the trend), `link-brief@1`, `person-brief@1` and `link-search@1` (the people rules; nothing from LinkedIn or X pages themselves), and `competitor-relevance@1`. Measured costs for the competitor briefs to replace the estimate's token guesses (`watchEstimate` in `competitors/settings.ts`), and for a LinkedIn or X web-search brief (docs: $0.05 to $0.15, unmeasured). Watched pages that need scripts to show their text (today they fail with a message): render them in the hidden window the ad creatives use, if owners ask. GitHub activity for people (public events API, 60 requests an hour without a token). Reddit followers and karma if the Data API is ever approved. Pruning old snapshots (today they're kept; one small row per account a day).

### Ads (section 8.6)
- **Reporting APIs for spend** (opt-in): an `ad_results_sync` job that reads spend, clicks and impressions from each platform instead of entering them by hand.
- A review of the three creative templates by a designer.

### Accessibility (section 9)
- Spelling in other languages (a dictionary per page language).
- A PDF's reading order and tables.
- External link checks on a schedule between scans.
- **A6, Harder coverage** (parked; decide per item when picked up): accessibility scans behind sign-in (Security S3's per-site sign-in partition and window, 11.5, can be reused), mobile viewport, cross-origin iframes, a keyboard focus walk-through, a local CLI or MCP server for coding agents.

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
| Security S3 | A real site's sign-in in the desktop app (including a separate login domain as an extra host): Check now finds the session cookie's flags, a session cookie survives until Startica quits, and Forget sign-in signs it out |
| Security S4 | `yarn eval security` passes on both providers |
| Ads AD1 | One manual import into Google Ads Editor and one into Meta, to confirm the template columns |
| Ads AD2 | A real picture with an OpenAI key, to compare the cost with the estimate |
| Content calendar | A real reminder notification in the installed app on each system (click opens the item); a real `content_plan` run against the estimate; real post-image uploads on Bluesky (1 MB) and X |
| Assisted posting | One real post on each of the seven sites with a signed-in account |
| Batches | A real scoring batch on both providers (Anthropic Message Batches, OpenAI Batch API on `/v1/responses`): the request shape is accepted, results parse, the logged cost matches the bill, and Stop cancels it |
| Refine | A real chat on both providers for each kind, with a revision through `propose_revision` in the subject's strict schema (the reply draft, a post and an email campaign, a Google, Meta and Reddit ad), and an ad revision that trips `checkAdCopy` |
| Listening and replies | `yarn eval score` on both providers for `opportunity-score@2` (adds sentiment; scores should match `@1`) and a look at its sentiment labels; replies read from a real post on Reddit, Hacker News, Bluesky, Mastodon and Discourse (Discourse's `/t/<id>/<post>.json` window on a long topic) |
| Issue trackers | Real GitHub and GitLab repositories |
| Competitor watch | A real `competitor_research` run on both providers against the cost estimate ($0.30 to $0.80), with a look at the people it suggests (public roles only, no personal details); real blog feeds (RSS, Atom, a Substack, a site whose feed is only found by `<link rel="alternate">`); real watched pages (a pricing page, a changelog, a GitHub repository, a YouTube channel: how much text they show without scripts, and whether the change threshold keeps noise out); a few days of real link, person and period briefs, including a month written from its weeks; a LinkedIn and an X brief from web search on both providers (what it finds, its cost) |
| Competitor benchmarks | A real check of each source (Bluesky, a Mastodon server, Hacker News, a Reddit user feed) to confirm the response shapes the parsers expect; whether Reddit's user `.rss` honors `limit=100` |
| Analytics | A real Umami instance (including its entry-page, country, device and browser breakdowns); a real GA4 property's new reports (landing pages, countries, devices, engagement) and a 16-month first sync; a real Stripe account's invoices and rebuilt MRR history against Stripe's dashboard |
| Credential guides | Follow the docs' credential guides end to end on a fresh Google Cloud project, Supabase account and Stripe account |
| Desktop shell | Tray, close-to-tray and launch at login on Windows and Linux (only macOS has been run) |

---

## 4. Websites and docs

Both sites are built: the marketing site (`apps/web`) and 80 docs pages (`apps/docs`), rewritten on 2026-10-14 for the four-module app. Left to do:

- **A theme choice in Settings** (Light / Dark / System), if owners ask: today the app only follows the system.
- **Diagrams** (main loop, architecture) as inline SVG, and a **demo video or GIF** (30–60 s) for the home page and README.
- **simple-engine additions**, then simplify `apps/docs`: numeric `sortBy` (string sorting puts 10 before 2, so the sidebar lives in `site.docsNav`), markdown-it plugins from config (callouts), a heading list in page data (build-time TOC instead of `public/docs.js`), a post-build hook (instead of `scripts/postbuild.mjs`), and plain heading ids (the anchor plugin percent-encodes ":" and "?", so the docs avoid linking to such headings).

---

## 5. Release and launch

Done already: the repository is public, releases are published with macOS (signed and notarized), Windows and Linux installers, auto-update reads them, Discussions, topics and the website link are set, the sites lead with `/download`, and CI passes on `main` on macOS and Ubuntu.

- **GitHub settings:** the description still has the replaced "AI co-founder" tagline (section 6); no social preview image; `main` has no branch protection (a ruleset "Main" exists but is disabled).
- **Final check:** links, a `grep` for personal data, a Lighthouse and accessibility pass on both sites.
- **Windows signing:** a code-signing certificate or Azure Trusted Signing (paid: ask first). Until then SmartScreen warns on first open.
- **Install and run the Windows and Linux installers** on real machines (installer, tray, close-to-tray, launch at login, auto-update): they build on GitHub's runners but only macOS has been run.
- **`@types/node` 26** (Dependabot): left out while the app runs on Node 24; the types should match the Node version. Take it when Node moves up.

---

## 6. Website decisions

**Tagline (decided 2026-10-18):** Category line "The open-source startup harness." Headline "Your AI, harnessed for everything after you ship." Body "Startica is a harness for your own AI model: it researches your market, finds the conversations, drafts the replies and ads, and checks your SEO, accessibility and security. You approve every move." Why: "co-founder" implied autonomy that contradicts "you approve everything" and is a crowded claim; a harness is the structure around your own model, with you holding the reins. Replaced: "Your AI co-founder for everything after you ship" (2026-10-14). Also rejected: "one app instead of five subscriptions" (frames it by what it replaces), "grow your product, keep your site in shape" (forgettable), keeping the marketing headline (undersells half the app).

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
- **SEO & GEO:** whether asking both providers should become the default when both keys are saved (today it's an opt-in per product); whether to offer a SERP API opt-in for Google AI Overviews; whether agent task runs are worth their cost.
- **Security:** whether DNS-based look-alike checks are enough without a domain-registration feed; whether accepted risks should expire after a set time and come back for review.
- **Ads:** which reporting APIs to support for spend; whether LinkedIn and X ads join later.
- **Marketing and platform:** Opus or Fable for the weekly re-plan; automatic use of dismissal reasons as few-shot negatives; minimum supported OS versions (macOS version, Windows 10/11, which Linux distros), after testing builds on Windows and Linux.
- **Launch:** whether to add GitHub Sponsors (`.github/FUNDING.yml`).
