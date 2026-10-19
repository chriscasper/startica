---
title: Privacy and security
description: What Startica keeps on your computer, exactly what it sends over the network and to whom, and how the local app is protected.
layout: doc
---

Startica is local-first. There's no Startica account, no Startica server and no telemetry. Your data lives in a database file on your computer. The app talks only to the services it needs for the work you ask it to do, using credentials you created.

This page lists what stays local, every kind of network request the app makes, and the safeguards around the local app.

## What stays on your computer

Everything Startica knows is stored in the [data folder](/reference/data-folder) (on macOS, `~/Library/Application Support/Startica`):

- The SQLite database `startica.db`: products and briefs, conversations, opportunities, drafts, publications, voice samples and profiles, content, roadmap, metric snapshots, accessibility, SEO & GEO and Security scan results, screenshots of scanned pages that had accessibility issues (latest only, under `a11y/`), imported security reports and problems people reported to you (including HTML snippets from the pages checked, and each page's title, description, headings and structured data), AI visibility questions and every answer with its citations, what you did with each SEO & GEO opportunity and its fix draft, agent readiness checks, ad campaigns with their creatives, the spend you entered and the prompt each picture was drawn from, job history and the AI call log.
- Ad pictures, rendered ad images and product logos, as files under `ads/` in the data folder. See [Ad creatives](#ad-creatives).
- Your secrets (API keys, access tokens, connection URLs), encrypted inside that database. See [Secrets](#secrets).
- If you use [Posting with Startica](/guides/assisted-posting), the posting window's sign-ins (cookies for the sites you signed in to there: X, Hacker News, Reddit, LinkedIn, Bluesky, your Mastodon server or a Discourse forum), in Electron's own profile folder. See [The posting window](#the-posting-window).

The database file itself isn't encrypted; only the secrets in it are. Anyone who can read your user account's files can read your briefs and drafts. Use full-disk encryption (FileVault, BitLocker, LUKS) and be careful with backups and copies of the data folder.

Nothing is synced anywhere. Uninstalling the app doesn't delete the data folder; delete it yourself if you want it gone.

## What goes over the network

Startica makes requests only to the services below. Each one happens because a feature you set up needs it.

| Destination | When | What's sent |
| --- | --- | --- |
| **Anthropic** (`api.anthropic.com`) or **OpenAI** (`api.openai.com`) | Every AI job, sent to the provider of that task's model | That provider's API key, and the prompt for that task. Depending on the task, the prompt contains your product's details and brief, text crawled from your site, conversation text from the channels Startica reads or threads you pasted, Inbox decision counts and dismiss reasons, voice samples, daily metric totals (for roadmap planning), your [Ads](/ads) campaign briefs and ads (for planning, rewrites and creative ideas), and your [AI visibility](/seo/ai-visibility) questions. Each question is sent on its own, without your product's details, to the `answer` model; the answer, the question, your product's name and website and your competitor names then go to the `score` model to be read. |
| **OpenAI's image model** (`api.openai.com`) | Only when you draw an [ad creative](/ads/creatives)'s picture: **Draw and render**, **Draw it** or **Draw again** | Your OpenAI API key and one prompt: the picture rules, your product's name and one-line description, and what you wrote the picture should show. The ad's words, your logo and pictures you uploaded aren't sent. This goes to OpenAI even when Claude is your provider. |
| **The provider's web search** (Claude's web search and web fetch, or OpenAI's web search) | Intel research, the GEO audit and AI visibility answers | Search queries and URLs the model chooses. These requests are made by Anthropic's or OpenAI's servers, not your computer. |
| **Reddit** (`www.reddit.com`, public RSS/Atom feeds) | Hourly scans, engagement checks on replies you posted, voice imports | Subreddit names, search keywords, thread URLs and usernames you asked it to import. No Reddit account or login. User agent: `macos:startica:v0.1 (personal feed reader; https://mystartica.com)`. |
| **Hacker News via Algolia** (`hn.algolia.com`) | Hourly scans, engagement checks, pasted HN links | Search keywords and item IDs. No account. |
| **Bluesky** (`api.bsky.app` for search, `public.api.bsky.app` for threads and engagement) | Hourly scans, pasted Bluesky links, engagement checks | Search keywords and post addresses. No account or login. User agent: `StarticaBot/0.1 (+https://mystartica.com; local research tool)`. |
| **Mastodon servers** | Hourly scans, pasted Mastodon links, engagement checks | The hashtags you watch, sent to the server named in each `#tag@server` community (default `mastodon.social`); post IDs, sent to the server in the post's link. No account or login. Same user agent as Bluesky. |
| **Discourse forums** | Hourly scans, pasted Discourse links, engagement checks | Requests to each forum you watch (its latest topics, keyword searches, single posts) and to the forum in a pasted or posted link. No account or login. Same user agent as Bluesky. |
| **X API** (`api.x.com`) | Only if you added an X API token: X searches (at most every few hours), pasted X links, engagement checks on X links | Your bearer token, your top 3 listening keywords as one search, and post IDs. Billed to your X developer account. |
| **Your product's website** | Building an Intel brief, running an audit | Up to 8 page requests per crawl, plus `robots.txt` (and `sitemap.xml` for the SEO audit). The crawler skips paths that `robots.txt` disallows for all agents. User agent: `StarticaBot/0.1 (+https://mystartica.com; local research tool)`. |
| **Google** (`oauth2.googleapis.com`, the Analytics Data API at `analyticsdata.googleapis.com`) | Daily GA4 sync, and the test sync when you save the connection | A token request signed with your service account key (the private key itself isn't sent), the property ID and report requests. |
| **Umami** (`api.umami.is` for Umami Cloud, or the server you entered) | Only if you connected Umami: the daily sync, **Sync now**, and the check and sync when you save the connection | Your API key (as a Bearer token), or for older self-hosted installs your `username:password` once per sync to sign in; the website ID; and read requests for its statistics, one day at a time, about 3 a second. See [Umami](/credentials/umami#privacy). |
| **Google Search Console** (`oauth2.googleapis.com`, `searchconsole.googleapis.com`) | Only if you connected Search Console: the daily sync, **Sync now**, the sync when you save the connection, and a title and description draft on [Opportunities](/seo/opportunities#privacy) (the searches each page was found for) | A token request signed with your service account key (the private key itself isn't sent) for read-only access, the property name, and report and sitemap list requests. |
| **Bing Webmaster Tools** (`ssl.bing.com`) | Only if you connected Bing: the daily sync, **Sync now**, and the sync when you save the connection | Your API key (in the request address, over HTTPS), the site address, and requests for its traffic, query and page statistics. |
| **Your product database** (the host in the connection string you pasted, for example Supabase's pooler) | The daily metrics sync, **Sync now**, and the test when you save the connection | Signs in as the read-only login `startica_reader` (over SSL for any host outside your computer and local network), reads the login's own permissions to check it can't write, then runs one read-only query on the daily totals view. Startica never sends SQL that changes anything; you run the setup SQL yourself. |
| **Stripe** (`api.stripe.com`) | Daily sync | Your restricted key, and requests to list subscriptions and paid invoices. |
| **X, Hacker News, Reddit, LinkedIn, Bluesky, your Mastodon server, Discourse forums** (in the posting window) | Only when you click **Post…** | The posting window loads the site's page like a normal browser, signed in with the account you signed in with there. What you post is sent when you press the site's button. See [The posting window](#the-posting-window). |
| **Hacker News API** (`hacker-news.firebaseio.com`) | After you post to Hacker News with **Post…** | Your HN username, to look up your newest item and find the link to what you just posted. No account or login. |
| **GitHub** (`api.github.com`) or **GitLab** (`gitlab.com`), or your own GitHub Enterprise or GitLab server | Only if you connected a repository under **Settings → Products → Issue tracker**: when you save it, when you click **Create issue** on an accessibility issue or **Create GitHub issue** / **Create GitLab issue** on a security finding, and after scans and security monitoring if the tracker opens or closes issues automatically | Your access token, sent only to the API address you configured. Each accessibility issue's text: the rule, its impact and WCAG criteria, and up to 20 failing elements with their page addresses, CSS selectors and HTML snippets. Each security issue's text: the finding's severity and OWASP Top 10 category, what the check saw (such as a cookie's name, a header's value or a script's host), why it matters, how to fix it, and up to 20 page addresses. Comments when Startica closes or reopens an issue. These become visible to everyone who can see the repository. See [GitHub and GitLab](/credentials/github-gitlab#what-startica-sends). |
| **Sites you add under Accessibility or SEO & GEO** | Only when you click **Scan now**, **Check a page** or a recheck button | `robots.txt`, sitemaps, and page loads (GET requests, with the page's own images, scripts and styles) on that site, at most one page load a second. When each scan finishes, `/robots.txt` and `/llms.txt` are fetched again for the [SEO & GEO](/seo) checks; nothing is fetched for addresses ending in `.example`, `.test` or `.invalid`. Nothing is submitted. User agent: Chromium's, with `StarticaAccessibilityScan/0.1` added; `robots.txt`, sitemaps and `llms.txt` are read with `StarticaAccessibilityScan/0.1 (+https://mystartica.com; scans sites their owners add)`. See [Accessibility scans](#accessibility-scans). |
| **Sites you add under Accessibility or SEO & GEO: agent readiness** | When each scan finishes, and on **Check now** on **SEO & GEO → Agents** | Plain GET requests, no browser, cookies or JavaScript, only to the site's own origin: the home page (once as HTML and once with `Accept: text/markdown`), the pricing and docs pages if the scan found them, and `/.well-known/api-catalog`, `/openapi.json`, `/openapi.yaml`, `/swagger.json`, `/api/openapi.json`, `/.well-known/ai-catalog.json`, `/.well-known/mcp/server-card.json` and `/.well-known/mcp.json`. At most 1 MB of each answer is read. Nothing is submitted, nothing goes to an AI, and nothing is fetched for addresses ending in `.example`, `.test` or `.invalid`. User agent: `StarticaAgentCheck/0.1 (+https://mystartica.com; checks sites their owners add)`. See [Agent readiness](/seo/agents#what-startica-requests). |
| **Pages AI visibility answers cite** (other people's sites) | After every [AI visibility](/seo/ai-visibility) run that answered something, and on **Read the pages again** on **SEO & GEO → Off-site** | Each site's `/robots.txt`, then plain GET requests (no browser, cookies or JavaScript) for up to 30 cited pages a read, at most 3 per site, one at a time with at least 1.5 seconds between requests to the same site; a page read or blocked rests for 7 days. Pages `robots.txt` disallows for `StarticaOffsiteCheck` aren't requested, and nothing on a site is requested when its `robots.txt` can't be read (RFC 9309). Because the addresses come from AI answers, only public `http`/`https` addresses on ports 80 and 443 are requested, with no user name or password and no reserved names (`.example`, `.test`, `.invalid`, `.localhost`), and each name is looked up in DNS first and refused if any of its addresses is private, local, shared, reserved or multicast. Redirects (at most 5) are followed by Startica, each hop checked the same way before it's requested. The name is resolved again for the request itself, so a DNS answer that changes in between (DNS rebinding) isn't prevented. At most 1 MB of each page is read. These requests come from your computer, so each site sees your IP address. Nothing is submitted, nothing goes to an AI. User agent: `StarticaOffsiteCheck/0.1 (+https://mystartica.com; reads pages AI answers cite, for the product's owner)`. See [Off-site presence](/seo/off-site#how-pages-are-read). |
| **Documents and links on sites you add under Accessibility** | After each full scan, and on **Check documents and links now** on **Accessibility → Content** or **Documents** | GETs of the PDFs on the site's own origin that its pages link to (up to 200, each up to 30 MB, read on your computer); `HEAD` requests (then a `GET` if `HEAD` isn't answered) to the other sites your pages link to, up to 500 links, one request a second to each site, each result kept for a week. Nothing is submitted, nothing goes to an AI, and nothing is fetched for addresses ending in `.example`, `.test` or `.invalid`. User agent: `StarticaAccessibilityScan/0.1 (+https://mystartica.com; scans sites their owners add)`. See [Content and documents](/accessibility/content-and-documents). |
| **crt.sh, OSV.dev, FIRST EPSS, CISA KEV** | Security monitoring, daily at 06:47 and after full scans of verified sites | Your domain (crt.sh); library names and versions found on your pages (OSV.dev); CVE identifiers (EPSS); nothing to KEV (its list is downloaded and cached for a day). Public DNS lookups of your subdomains and look-alike names. GETs of the third-party scripts your pages load, to fingerprint them. See [Monitoring](/security/monitoring#outside-services). |
| **GitHub** (`github.com`, release files of `chriscasper/startica`) | Installed app only: 30 seconds after start and every 6 hours, unless you untick **Check for Updates Automatically** in the tray menu; and when you click **Check for Updates…** | Requests for the repository's releases feed and the newest release's `latest*.yml` file, and, when there's a newer version, a download of its installer. No account, ID or usage data. GitHub sees your IP address. See [Updating](/getting-started/updating#automatic-updates). |
| **Sites you verified under Security** | When a scan of a verified site finishes, and on **Verify** or **Recheck** | A TLS handshake with the site; GETs of the `http://` address (redirects not followed), `/.well-known/security.txt`, `/.git/HEAD`, `/.env` and `/.DS_Store` (only the first 64 KB of each answer is read, and nothing is kept but whether the file is there); DNS lookups of the domain's TXT records (SPF, DMARC, the verification record). **Verify** also fetches `/.well-known/startica-verification.txt`. Nothing is submitted. See [Security](/security#what-it-never-does). |

That's the complete list. In particular:

- **No telemetry, analytics or crash reporting.** The app doesn't report usage, errors or anything else to Startica's developers or anyone else.
- **One update check, and you can turn it off.** The installed app asks GitHub for this repository's latest release 30 seconds after it starts and every 6 hours. Untick **Check for Updates Automatically** in the tray menu to stop it; dev mode never checks. See [Updating](/getting-started/updating#automatic-updates).
- **Nothing is posted without your click.** Startica has no accounts of its own on Reddit, Hacker News, X, Bluesky, Mastodon, Discourse forums, LinkedIn or anywhere else, and never posts, votes, sends email or messages by itself. The X API token is used only to read. The one thing Startica writes on its own is issues in a GitHub or GitLab repository you connected, and only if you turned that on. You post every reply and piece under your own account: by copying it, or in the posting window, where Startica fills it in and you press the site's own button.
- **Off-site presence never does outreach.** It reads the pages AI answers cite and nothing more: it never posts, signs up, submits a listing, writes a review or contacts anyone. See [Off-site presence](/seo/off-site#what-startica-never-does).
- **AI visibility uses the API, not the AI apps.** It asks questions through your API key. It never signs in to ChatGPT, Claude, Perplexity or any other assistant's app or website.
- **Accessibility's AI help sends only what you ask it to**: an issue's failing HTML (Suggest a fix), an image and its alt text and nearby text (alt text review), an element and the page screenshot (Ask AI), or the score history and open issues (Summarize), to your own AI provider.
- **Security's AI help sends only what you ask it to**: a finding's details and pages (Explain and fix), the report text you paste (Import a report), or a reported problem's text and your open findings' titles (triage), to your own AI provider.
- **Accessibility, SEO & GEO and Security scans make no AI calls.** Scan results stay in your database. They reach your AI provider only when you press an AI help button on them (for example **Suggest a fix**, **Review N images** or **Explain and fix**), and then only the issue or finding you asked about. Otherwise they leave your computer only as issues in a GitHub or GitLab repository you connected yourself.
- `mystartica.com` appears in the user agents only so site owners can see what the requests are. Startica never contacts it.

Links you click inside the app (to threads, docs or provider dashboards) open in your normal web browser. The one exception is the posting window, below.

> [!NOTE]
> When you build from source, the development tooling has its own network behavior. Startica's scripts turn off Next.js's anonymous usage telemetry (`NEXT_TELEMETRY_DISABLED=1`); if you run `next` commands directly, set it yourself or run `npx next telemetry disable`. Next.js also downloads the app's fonts from Google Fonts at build time. The packaged app serves the fonts locally.

## The local server

The app's window is a web page served by a small server that Startica runs on your own computer, at port 58300. Several safeguards keep other programs and websites out of it.

| Safeguard | Detail |
| --- | --- |
| Loopback only | The server listens on `127.0.0.1`. Other machines on your network can't connect to it. |
| Per-launch token | Each time Startica starts, it generates a random 256-bit token. Every request must carry it. Without it, the server answers `401` with "Open Startica from the app." |
| Session cookie | The desktop window receives the token as an `httpOnly`, `SameSite=Strict` cookie named `startica_session`, so pages can't read it with JavaScript and other sites can't send it. In browser mode, you open a one-time `/?token=…` link printed in the terminal; the server sets the cookie and redirects to strip the token from the URL. |
| Constant-time compare | The token check uses a constant-time comparison, so response timing doesn't leak the token. |
| No exceptions | Every path needs the token, apart from the app's static files (`/_next/static`, `/_next/image`, `favicon.ico`). There are no sign-in return addresses: Startica has no OAuth sign-ins. |

Startica has no login of its own. Anyone who can use your user account on this computer can open the app, the same as any other desktop app.

## The desktop app

| Safeguard | Detail |
| --- | --- |
| Single instance | Only one copy of Startica runs at a time. Opening it again focuses the existing window. |
| Sandboxed window | The window runs with Electron's sandbox and context isolation on and Node.js integration off. Web content in the window has no access to your files or the operating system. |
| No outside navigation | The window only shows the local app. Any other link opens in your default browser instead of inside the app. |
| Separate server process | The server runs as a child process. The Electron main process keeps the window and the keychain access. |

## The posting window

[Posting with Startica](/guides/assisted-posting) (beta) opens X, Hacker News, Reddit, LinkedIn, Bluesky, your Mastodon server or a Discourse forum in a separate **Post with Startica** window, so it can fill in your reply on the real page. It's built so the site and Startica stay apart, and so you always do the posting.

| Safeguard | Detail |
| --- | --- |
| You press the button | Startica fills in the text and never clicks the site's button, presses Enter or submits the form. |
| No AI | Filling in is a fixed script per site. Nothing from the page is sent to the AI, so text on a page can't instruct Startica. On LinkedIn, Bluesky and Discourse's rich editor, the text is typed in as keyboard input; the button is still yours to press. |
| Isolated site view | The site runs sandboxed with context isolation, no Node.js, no preload script, and no access to Startica's local server or launch token. The fill-in script runs in a separate isolated world: it shares the page's elements, not its JavaScript. |
| A minimal bar | The Startica bar above the site is the only part of the window that can talk to the app, and it can only ask for **Fill in again**, **Copy text**, **Save link…** and **Close**. |
| Only the site | The window shows only the site's own hosts: for Mastodon your own server (from **Settings → Channels → Posting**), for Discourse the forum's host. It also allows these sign-in pages: `accounts.google.com`, `appleid.apple.com`, `github.com`, `gitlab.com`, `discord.com`, `login.microsoftonline.com` and `login.live.com` (for signing in with Google, Apple, GitHub, GitLab, Discord or Microsoft, common on Discourse forums). Any other link opens in your normal browser, so a forum with its own single sign-on elsewhere can't finish signing in there; copy and post by hand instead. |
| No permissions | Requests for the camera, microphone, location, notifications and similar are refused. |
| Reads only your submit | To find the new post's link, the window watches its own network traffic (through the Chrome DevTools Protocol, on the site view only) for the request the site's button sends, and reads that request and its response. On Bluesky it reads the request body of create requests to tell a new post from a like or follow. It doesn't read your feed, messages or other pages. For Hacker News it then asks the public HN API for your newest item. |
| Your password stays with the site | You sign in on the site's own page. Startica doesn't read or store your password. |
| Plain user agent | The window presents itself as Chrome, with the Electron and Startica tokens removed, because some sign-in pages refuse embedded browsers. |

The posting window's sign-ins are kept between launches in a separate browser profile (Electron's persistent partition `persist:posting`), apart from your normal browser and the app's main window. It lives in Electron's own profile folder, under `Partitions/posting`, even if you set `STARTICA_DATA_DIR`. See [Data folder](/reference/data-folder#posting-sign-ins) for where it is and how to sign out.

## Accessibility scans

[Accessibility](/accessibility) scans load the pages of a site you added in a browser, so they can run the site's own scripts. They're kept apart from Startica.

| Safeguard | Detail |
| --- | --- |
| Only sites you add | A scan only loads pages on the site you added, and only after you tick **I own this site or am allowed to test it**. Links to other sites aren't followed, and a page that redirects off the site is skipped. |
| Respects robots.txt | By default, pages that the site's `robots.txt` disallows for all agents are skipped. Untick **Follow the site's robots.txt** only for your own site. |
| Hidden, separate browser | In the desktop app, pages load in hidden, sandboxed windows (context isolation on, no Node.js) on their own in-memory browser session. It shares no cookies, storage or sign-ins with the app's window or the posting window, and nothing in it survives a restart. In browser development mode, Playwright's Chromium is used instead, with a fresh browser context per page, downloads off and the same request blocking. |
| No access to Startica | Requests from scanned pages to Startica's own local server port are blocked, so a page can't reach the app. |
| No private network | Requests to your own computer and private-network addresses (`localhost`, `127.0.0.1`, `192.168.x.x`, `10.x.x.x` and similar) are blocked, unless the site you added is itself local, so you can scan a local development copy. |
| Look, don't touch | Startica only loads pages (GET requests). It never clicks, types or submits anything, and sign-out, log-out and delete links and `/api/` addresses are always skipped. Permission requests (camera, location, notifications and similar) are refused, downloads are cancelled, popups are blocked, and pages can't navigate away from the site. |
| Checks run in an isolated world | In the desktop app, axe-core runs in a separate isolated world: it shares the page's elements, not its JavaScript. |
| Results stay local | Results, including HTML snippets of failing elements, are stored only in `startica.db`, and no AI sees them. They're sent nowhere else unless you connect a GitHub or GitLab repository: then the issues Startica opens there contain the failing elements' page addresses and HTML snippets. See [Issues in GitHub or GitLab](/accessibility/issue-trackers). |
| Identifies itself | Pages load with Chromium's user agent plus `StarticaAccessibilityScan/0.1`, so site owners can see what the requests are. |
| SEO & GEO checks | The same page loads are checked for [SEO & GEO](/seo); there's no second crawl. When a scan finishes, Startica fetches the site's `/robots.txt` and `/llms.txt` with the `StarticaAccessibilityScan/0.1` user agent (a plain request, no browser), to see which AI crawlers are allowed and whether there's an `llms.txt`. Nothing is fetched for reserved names that never resolve (`.example`, `.test`, `.invalid`), such as the demo's `fieldnote.example`. |

Scans are off in [demo mode](/guides/demo-mode).

## Ad creatives

[Ad creatives](/ads/creatives) are made on your computer. Only drawing a picture with AI sends anything anywhere, and that's the prompt described above, to OpenAI.

| Safeguard | Detail |
| --- | --- |
| Rendered locally | The template's words, logo and button are added to the picture by rendering a page of HTML and CSS to an image, in a hidden window in the desktop app (Playwright's Chromium in browser development mode). |
| Only its own files | Each render copies the page, the picture and the logo into a temporary folder. Only files inside that folder (and inline `data:` images) can load; every other request, including any network address, is blocked, and the temporary folder is deleted afterwards. |
| Separate, sandboxed window | The hidden window is sandboxed (context isolation on, no Node.js) on its own in-memory browser session that keeps nothing. Permission requests are refused, popups are blocked and the page can't navigate. It closes itself after 30 seconds without work. |
| Uploads stay on disk | Pictures and logos you upload are checked (PNG, JPEG or WebP, up to 20 MB), saved under `ads/` in the [data folder](/reference/data-folder#ad-images) and never sent to an AI or anywhere else. |
| Nothing goes to the ad platforms | Startica never uploads creatives to Google Ads, Meta or Reddit. You download the images and add them in the ad manager yourself. |

## Secrets

| Detail | How it works |
| --- | --- |
| Where | The `secrets` table in `startica.db`, never in plain settings |
| Encryption in the desktop app | Electron `safeStorage`, which uses the OS keychain: macOS Keychain, Windows DPAPI, or libsecret on Linux. Encrypted values carry an `ss1.` prefix. The server process sends values to the Electron process to encrypt and decrypt over a private IPC channel. The encryption key never leaves the keychain. |
| Encryption in browser/dev mode | AES-256-GCM with a random key in `dev-secret.key` (file mode `0600`) in the data folder. For development only. |
| Decryption | Only inside the app's server process, when a job or settings page needs the value |
| Never | Committed to git, written to logs or sent anywhere except the service the secret belongs to |

On Linux without a keyring, Electron falls back to a weak built-in key, and Startica logs a warning. See [Bring your own credentials](/credentials/#how-credentials-are-stored).

## Least-privilege access to your services

Each integration asks for the narrowest access that works:

- **Google Analytics:** a service account with no Cloud roles, added as a **Viewer** on only the GA4 properties you choose. Startica can't change your Analytics configuration or read other properties. See [Google Analytics](/credentials/google).
- **Google Search Console:** a service account (the GA4 one or its own) added as a **Restricted** user on only the properties you choose, and a token that asks for read-only access (`webmasters.readonly`). See [Google Search Console](/credentials/search-console).
- **Umami:** Umami Cloud has no read-only key: a key has its account's access. On your own Umami, give Startica a key of a **View only** user that is a view-only member of the website's team. Startica only sends read requests. See [Umami](/credentials/umami).
- **Bing Webmaster Tools:** Bing has no read-only key: its API key works for the whole Bing Webmaster Tools API on every site in your account. Startica only calls its read methods. See [Bing Webmaster Tools](/credentials/bing-webmaster).
- **Stripe:** a restricted key with read permissions only. See [Stripe](/credentials/stripe).
- **Product database:** a login role, `startica_reader`, that can only `SELECT` from one view of daily totals, with read-only transactions enforced on the role and again in every Startica query. It never sees individual rows. Startica writes the setup SQL, but you run it yourself; Startica never holds a login that can write. Before saving a connection it checks the login and refuses a superuser, a login that can create roles or bypass row-level security, or one with `INSERT`, `UPDATE`, `DELETE` or `TRUNCATE` on any table. See [Product database](/credentials/supabase).
- **GitHub and GitLab:** a token limited to one repository: a fine-grained GitHub token with only **Issues: Read and write**, or a GitLab project access token with the Reporter role (it can also read the project, but Startica only uses its issues). Startica never reads or changes anything in the repository except the issues it opened. See [GitHub and GitLab](/credentials/github-gitlab).
- **X API:** an app bearer token, which can only read public data. Startica uses it for search and post lookups, never to post. See [X API](/credentials/x-api).

## Reporting a vulnerability

If you find a security problem, please report it privately by email to **security@mystartica.com** rather than opening a public issue. See `SECURITY.md` in the repository for the policy. Include the version or commit you tested, steps to reproduce and the impact you see.
