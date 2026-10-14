# Startica desktop app: what's left to do

> Everything still to build, check or decide for the desktop app. How the built app works, the decisions behind it and the working rules are in [ARCHITECTURE.md](ARCHITECTURE.md); the websites and launch are planned in [apps/web/PLAN.md](../web/PLAN.md).
>
> When an item is built, describe it in ARCHITECTURE.md and remove it from here. Section numbers like "8.6" refer to ARCHITECTURE.md.
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

## 2. By module

### Marketing
- More channels if wanted: Threads, YouTube comments; Facebook groups posting only if users ask.
- **Reddit's official Data API**, only if access is ever approved: script app with the password grant, a descriptive `User-Agent`, 100 requests per minute, poll `/new` per subreddit and let Startica's scoring decide relevance, store each subreddit's rules in `communities.promo_rules`.
- Eval sets for the other AI tasks (only the scorer, Accessibility and Security have one).

### Ads (section 8.6)
- **Reporting APIs for spend** (opt-in): an `ad_results_sync` job that reads spend, clicks and impressions from each platform instead of entering them by hand.
- A review of the three creative templates by a designer.

### Accessibility (section 9)
- Everything under "Next up" above.
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
- S3 (see "Next up").
- Detect more libraries (bundled code, source maps); certificate alerts by issuer.
- Read PDF reports when importing (with A5's pdf.js).
- Later: read-only cloud configuration review, open port monitoring, leaked-credential monitoring (needs a breach-data service), a CI check, an MCP server, a public trust page.

---

## 3. Checks that need real accounts, keys or sites

Built and tested against stand-ins; still to try for real. Each needs the owner's keys, accounts or sites (ask first: ARCHITECTURE.md section 17).

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
| Desktop shell | Tray, close-to-tray and launch at login on Windows and Linux (only macOS has been run) |

---

## 4. Release and distribution

- Buy an Apple Developer ID ($99/year) and a Windows code-signing certificate or Azure Trusted Signing (paid: ask first).
- Make the repository public: auto-update reads its public releases.
- Run the release workflow once by hand to test the Windows and Linux builds (installers, tray, launch at login).
- The website, docs and open-source launch: [apps/web/PLAN.md](../web/PLAN.md).

---

## 5. Open questions

- **Positioning:** decided 2026-10-14: "Your AI co-founder for everything after you ship" (apps/web/PLAN.md section 2). The website and docs are updated; still to change: ARCHITECTURE.md's header, the welcome copy and the README.
- **Accessibility:** whether page importance should also weigh depth from the home page when GA4 isn't connected; whether a local MCP server for coding agents belongs in Startica (A6).
- **SEO & GEO:** which provider to run AI visibility on by default when both keys are saved; whether to offer a SERP API opt-in for Google AI Overviews; whether agent task runs are worth their cost.
- **Security:** whether DNS-based look-alike checks are enough without a domain-registration feed; whether accepted risks should expire after a set time and come back for review.
- **Ads:** which reporting APIs to support for spend; whether LinkedIn and X ads join later.
- **Marketing and platform:** Opus or Fable for the weekly re-plan; automatic use of dismissal reasons as few-shot negatives; minimum supported OS versions.
