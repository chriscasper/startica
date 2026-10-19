---
title: Troubleshooting
description: Symptoms, causes and fixes for common Startica problems, from port conflicts and product database errors to slow Reddit scans, accessibility and security scans, ad creatives, issue trackers, updates and stuck jobs.
layout: doc
---

Each problem below lists the symptom, the cause and the fix. If yours isn't here, check the [FAQ](/troubleshooting/faq) or ask in [GitHub Discussions](https://github.com/chriscasper/startica/discussions).

## The System page

Open **System** in the sidebar. It shows:

- **Job runs**: the latest 20 background jobs, with status, attempt and **Result / error**.
- **AI calls**: every AI request, with status (`ok`, `error`, `refused`, `blocked`), tokens, cost and latency.
- **AI spend this month** and whether the API key for your AI provider (**Anthropic API key** or **OpenAI API key**) is configured.

Most failures show their error message here.

## The logs

Startica doesn't write a log file. It prints its log, including background job results (lines tagged `[jobs]`), to the terminal it was started from.

- **Dev mode:** the terminal running `yarn dev:desktop`.
- **A built copy:** start it from a terminal to see its log.

### macOS

```bash
/Applications/Startica.app/Contents/MacOS/Startica
```

### Linux

```bash
./apps/desktop/dist/Startica-*.AppImage
```

### Windows

Run `Startica.exe` from its install folder in a terminal. Untested.

## The welcome wizard keeps coming back

**Symptom.** Every page sends you to **Welcome to Startica**.

**Cause.** The wizard opens while there's no product and you haven't finished or skipped it. That's every fresh data folder: a new install, a deleted or renamed data folder, or a new `STARTICA_DATA_DIR`.

**Fix.** Add your product in step 2 and click **Finish**, or click **Skip setup**. Either way it won't open by itself again in that data folder. If you skip without a product, Today links back to the wizard ("Set up your first product").

If you see the wizard while expecting your data, check that Startica is using the data folder you think it is (an unset or different `STARTICA_DATA_DIR`). See [Data folder](/reference/data-folder).

## Stuck in the demo

**Symptom.** Startica keeps opening Fieldnote with the "Demo:" banner, or the demo won't start.

**Cause.** Demo mode is remembered in `startica-mode.json` in the data folder, so Startica starts in the demo until you leave it.

**Fix.** Click **Leave demo** in the banner; Startica restarts with your own data. If the app won't start in the demo, quit Startica (**Quit Startica** in the tray menu), then delete `startica-mode.json` from the data folder, or change it to `{"demo":false}`, and open Startica again. Your own data was never touched. See [Try the demo](/guides/demo-mode).

## No demo link on the welcome page

**Cause.** **Look around with a sample product first** needs the desktop app, because it restarts the app. The browser run (`yarn dev:desktop-web`) doesn't show it.

**Fix.** Use `yarn dev:desktop` or an installed build, or load the sample product into its own folder with `yarn seed:demo`. See [Try the demo](/guides/demo-mode#in-a-browser-run).

## Port 58300 in use

**Symptom.** A dialog says "Startica couldn't start" or "The Startica server stopped while starting". Running from source, the terminal shows "Port 58301 is already in use. Is Startica already running?"

**Cause.** The installed app's local server uses port 58300, and running from source uses 58301, unless you set `PORT`. Something else is already listening there. From source, that's usually `yarn dev:desktop-web` or `yarn dev:desktop` in another terminal, or a leftover process. Use 58301 in the commands below for a dev run.

**Fix.** Find what's using the port and stop it.

### macOS

```bash
lsof -iTCP:58300 -sTCP:LISTEN
```

### Linux

```bash
lsof -iTCP:58300 -sTCP:LISTEN
```

### Windows

```text
netstat -ano | findstr :58300
```

You can also move Startica to another port with the `PORT` environment variable. See [Environment variables](/reference/environment).

## Second launch focuses the window

**Symptom.** You start Startica again, and nothing new opens. The existing window comes to the front.

**Cause.** This is intended. Only one copy of Startica runs at a time. Dev mode and a built copy share this lock too, because they share the same data folder.

**Fix.** Nothing to fix. If you want to start a different copy (for example dev mode instead of the installed app), quit the running one first with **Quit Startica** from the tray or menu bar icon. Closing the window isn't enough: Startica keeps running in the background.

If no window appears and you can't find the tray icon, a stale process may be holding the lock. On macOS or Linux, list it:

```bash
pgrep -fl Startica
```

## The product database won't connect

**Symptom.** **I ran it: test and save** (or **Test and save**) shows an error, or the **Product database** card in **Settings → Products → Connections** shows **Error**.

**Cause and fix.** Read the message. The common ones:

- "The read-only login doesn't exist yet…" or "startica.daily_metrics doesn't exist yet…": the setup SQL hasn't run in this database. Copy it from step 2 and run it in Supabase's SQL Editor or with `psql`, then test again.
- "The read-only login's password doesn't match…": run the SQL shown in the dialog again, wait 2–3 minutes (Supabase's pooler takes a few minutes to pick up a new password), then test again.
- "This login is a superuser", "…can create roles", "…bypasses row-level security" or "…can change data": Startica refuses any login that can do more than read. Use the guided **Set up**, which connects as `startica_reader`, instead of an admin URL.
- "Couldn't reach the database…": check the host, port, firewall and allow-lists. On Supabase, use the **Transaction pooler** connection string.
- A Postgres error such as `relation "public.event" does not exist` while you run the SQL: a table or column name in step 1 is wrong. Fix it, click **Write the SQL** again and run the new script.

Every message and its fix: [Product database troubleshooting](/credentials/supabase#troubleshooting).

## Google Analytics doesn't sync

**Symptom.** The **Google Analytics 4** card in **Settings → Products → Connections** shows **Error**.

**Cause and fix.** Read the error under the card:

- "No credentials saved for this connection": the connection was made with **Connect with Google**, which older versions had. It has no key of its own. Click **Replace key** and paste a service account key.
- "The GA4 key isn't valid JSON: paste the whole .json file" or "The GA4 key isn't a service account key: reconnect GA4 in Settings → Products → Connections": click **Replace key** and paste the whole `.json` file of a service account key.
- A permission error: the service account isn't a **Viewer** on the property, or the property ID belongs to another property. Add its email under **Admin → Property access management** in GA4.

A service account key doesn't expire, so a connection that worked won't sign itself out. See [Google Analytics](/credentials/google#troubleshooting).

## Umami doesn't sync

**Symptom.** The **Umami** card in **Settings → Products → Connections** shows **Error**, or the connect dialog won't save.

**Cause and fix.** Read the error under the card or in the dialog:

- "Umami refused the credentials: …": the API key was deleted or mistyped, or the user name or password is wrong. Umami Cloud only takes API keys, not `username:password`. Create a new key and click **Change**.
- "Umami has no website with that ID for these credentials (or the server address isn't your Umami). …": copy the Website ID again from **Settings → Websites → Edit** in Umami, check **Server**, and check that the key's user can see the website. A view-only user only sees websites in a team it's in.
- "That address didn't answer like Umami's API: …": **Server** isn't your Umami. Enter the address you open Umami at.
- "This Umami user signs in with two-factor authentication, …": use an API key, or a view-only user without two-factor sign-in.
- "Umami didn't find …: check the server address, or update Umami.": **Server** doesn't point at your Umami. Enter the address you open Umami at.
- "Umami is limiting requests right now; …": wait, then click **Sync now**.

Every message and its fix: [Umami troubleshooting](/credentials/umami#troubleshooting).

## Search Console or Bing doesn't sync

**Symptom.** The **Google Search Console** or **Bing Webmaster Tools** card in **Settings → Products → Connections** shows **Error**, and **SEO & GEO → Search** says "Last sync failed:". Problems with the property, site or key usually show earlier, in the connect dialog, since Startica checks access before saving.

**Cause and fix.** Read the error:

- "The Google Search Console API isn't turned on for the service account's Google Cloud project.": enable the API in that project, then sync again.
- "Search Console didn't let the service account read this property (…)": the service account was removed from the property. Add it again under **Settings → Users and permissions** in Search Console.
- "This connection uses the GA4 key, but GA4 isn't connected for this product.": reconnect GA4, or give Search Console a key of its own.
- "Bing refused the API key.", or "The Bing key can't read …": generate a new key, or enter the site exactly as Bing lists it.

Every message and its fix: [Google Search Console](/credentials/search-console#troubleshooting) and [Bing Webmaster Tools](/credentials/bing-webmaster#troubleshooting).

## Keychain prompts

**Symptom (macOS).** A dialog says Startica wants to use confidential information stored in "Startica Safe Storage" in your keychain.

**Cause.** Startica encrypts your API key, tokens and connection credentials with the macOS Keychain. Because builds aren't signed, macOS may treat each new build as a different app and ask again after you rebuild or update.

**Fix.** Enter your login password and click **Always Allow**. If you click **Deny**, Startica can't read or save secrets until you allow it.

**Symptom (Linux).** The terminal shows "No system keyring found; secrets are only lightly protected on this computer."

**Fix.** Install and unlock a keyring that supports libsecret, such as GNOME Keyring or KWallet, then save your secrets again in Settings.

## Secrets after switching modes

**Symptom.** After using the desktop app, browser mode (`yarn dev:desktop-web`) can't read your keys: an AI job or a connection fails with "Unreadable secret".

**Cause.** The two modes encrypt secrets differently. The desktop app uses the OS keychain. Browser mode uses a key file in the data folder. Both use the same database. The desktop app moves secrets saved in browser mode into the keychain when it starts, but browser mode can't read the keychain.

**Fix.** Save the keys again in browser mode, or go back to the desktop app. The installed app isn't involved: running from source uses its own Startica Dev folder and keychain entry. To use browser mode for testing without this clash, give it its own data folder:

```bash
STARTICA_DATA_DIR=/tmp/startica-browser yarn dev:desktop-web
```

## Few Reddit results

**Symptom.** Scans finish, but the Inbox stays nearly empty, or only Hacker News threads show up.

**Causes and fixes:**

| Cause | Fix |
|---|---|
| No subreddits are watched. | On **Intel** → **Communities**, click **Watch** on a few subreddits. The Inbox shows a notice while none are watched. |
| The product has no brief yet. | Scans skip products without one. Build intel first. |
| A subreddit name is misspelled, private or banned. | It's skipped silently. Check the name (no `r/` prefix) by opening `https://www.reddit.com/r/<name>/`. |
| Only the first 10 watched subreddits are read. | Keep the list short and active. |
| Keyword searches are limited. | Reddit gets at most 3 keyword searches per scan, inside your watched subreddits. Put your best keywords first by adding them yourself: your own keywords are searched before AI ones. |
| Threads were scored as not relevant. | Check the **Archived** tab. Improve the brief or your notes, or use **Draft a reply anyway**. |
| Threads are too old. | Scans look back about a day, and threads older than 7 days aren't scored. |

## No Bluesky, Mastodon or Discourse results

**Symptom.** Scans finish, but nothing arrives from one of these channels.

| Channel | Cause | Fix |
|---|---|---|
| Bluesky | Bluesky is searched with your first 10 listening keywords. Vague or very niche keywords find nothing useful. | Check the **Keywords** tab. Put your best keywords first by adding them yourself. |
| Mastodon | No hashtag is watched. New Mastodon communities must be hashtags; one saved in an earlier version that isn't is marked in red on **Intel** ("Startica can't read this: write it as a hashtag on a server…"). | Watch a Mastodon community named `#tag@server`, for example `#fieldwork@mastodon.social`. A small server only sees posts from servers it's connected to; a large one sees more. |
| Mastodon | The server is down or refuses unauthenticated requests. | Try another server for the same hashtag. |
| Discourse | The community's **URL** is empty and its name isn't an address (possible for forums added in an earlier version; new ones need the address). **Intel** marks it in red: "Startica can't read this forum: add its address as the URL." Until you add it, the forum is skipped silently. | Edit the community and put the forum's address in **URL**, for example `https://forum.example.com`. |
| Discourse | The forum isn't among the first 5 watched forums; only those are read. | Ignore forums you don't need, so the ones you care about are among the first 5. |
| Discourse | The forum is private (login required), down or rate-limiting. | Open the forum in a private browser window. If you can't read it without signing in, Startica can't either. |
| All | Threads were scored as not relevant. | Check the **Archived** tab. |
| All | The source failed during the scan. A failing source is skipped and the rest of the scan continues. | On the **System** page, open the latest `listen_scan` run: its result lists each failed source's error under `errors`. |

## X search fails

**Symptom.** You added an X API token, but no X posts arrive. The **X API (optional, paid)** card in **Settings** may show "Last X request failed: …" in red.

**Causes:**

- **No credits** on your X developer account ("Last X request failed: No X API credits left."), a token that was revoked or regenerated ("Last X request failed: X refused the token (revoked or without access)."), or X's rate limit ("Last X request failed: X rate limit; Startica tries again next scan."). An X error doesn't stop the scan: the other sources are read and scored as usual, and X is tried again at the next scan.
- **The daily read cap is used up.** The **X API (optional, paid)** card shows "Reads today (UTC): _n_ of _cap_". With fewer than 10 reads left, X searches are skipped until midnight UTC.
- **Not due yet.** X is searched at most every 6 hours by default, not every hour.
- **No listening keywords.** X uses your first 3.

**Fix.** Add credits or a new token in X's console, then click **Change** on the card and paste the new token. If you don't want X search for now, click **Remove**. See [X API](/credentials/x-api).

## Scans are slow

**Cause.** Reddit's public feeds allow about one request a minute, and Startica waits between requests to respect that. A scan of 10 subreddits plus 3 searches takes up to about 15 minutes. If Reddit answers with a rate-limit error, Startica waits and retries once. Each watched Discourse forum adds up to about 1.7 minutes (at most about 22 requests), because Startica spaces requests to a forum 4.5 seconds apart to stay under its limit for anonymous visitors. Forums are read one after another, and only the first 5 are read, so forums add at most about 8 minutes.

**Fix.** None needed, but keep the lists of watched subreddits and forums short. Each source's results are queued for scoring as soon as that source is done, so they appear in the Inbox without waiting for the whole scan. Hacker News, Bluesky and Mastodon are fast. Pasted Reddit links take up to a minute for the same reason.

## Accessibility scans

These are for scans in [Accessibility](/accessibility). A page that couldn't be checked shows its reason on the **Pages** screen; a scan that failed shows its error in the **Scans** list on the Overview.

### Scans run in the desktop app

**Symptom.** The Overview says "Accessibility scans run in the Startica desktop app." and **Scan now** is disabled.

**Cause.** Scans need a browser. The desktop app has one built in. Browser development mode (`yarn dev:desktop-web`) uses Playwright's Chromium, which isn't installed.

**Fix.** Use the desktop app (`yarn dev:desktop` or a build). In browser development mode, install Chromium once and restart the server:

```bash
yarn workspace @startica/desktop-web playwright install chromium
```

In [demo mode](/guides/demo-mode) scans are always off ("Scans are off in the demo, like every other outside call. The results below are sample data."). Leave the demo to scan your own sites.

### No page could be checked

**Symptom.** A scan ends as **failed** with "No page could be checked", sometimes followed by a reason.

**Cause.** Every page the scan tried was skipped or failed. Common reasons:

- The **Start address** is wrong, or the site is down.
- The start page needs signing in, so it answers with an error or redirects to a sign-in page on another domain.
- `robots.txt` disallows everything (common on staging and development servers).
- **Only pages matching** matches nothing the scan can reach.

**Fix.** Open the start address in your browser to check it loads without signing in. Check **Site settings**. For your own staging or development site, untick **Follow the site's robots.txt**. Then click **Scan now** again.

### Pages skipped by robots.txt

**Symptom.** **Pages** lists pages as skipped with "Blocked by the site's robots.txt".

**Cause.** **Follow the site's robots.txt** is ticked (the default), and the site's `robots.txt` disallows those paths for all agents.

**Fix.** That's intended for sites you don't run. For your own site, untick **Follow the site's robots.txt** in **Site settings** and scan again. Pages that redirect to another site ("Redirects off the site, to …") are skipped too, and always will be.

### Pages that couldn't be checked

**Symptom.** **Pages checked** on the Overview says "N couldn't be checked", and **Pages** lists those pages as failed.

**Causes and fixes:**

| Reason shown | Cause | Fix |
|---|---|---|
| "The page answered HTTP 404" (or another code of 400 or more) | The page is missing, needs signing in, or the server errored. A broken link on the site leads to a 404 here. | Fix or remove the link on the site, or add the path to **Skip pages matching**. |
| "The page took longer than 30 s" | The page took more than 30 seconds to load. | Check the page in your browser. Then use **Recheck page** on its report. |
| "The scanner returned no results for this page" | The page loaded but the checks couldn't run on it, for example because it navigated away while loading. | Recheck the page. If it keeps happening, skip it with **Skip pages matching**. |

Failed pages don't count toward the site's score.

### Fewer pages than expected

**Cause.** A full scan only finds pages that the sitemap lists or that are linked from pages it checked, up to 6 links deep and up to **Most pages per scan** (250 by default). Pages excluded by **Only pages matching** or **Skip pages matching**, sign-out and delete links, `/api/` addresses and files such as PDFs are never checked.

**Fix.** Raise **Most pages per scan** in **Site settings**, add the missing pages to the site's sitemap, or check a single page with **Check a page**.

## Security

These are for [Security](/security). Security checks and monitoring run only on sites you've proven are yours.

### Verify doesn't verify the site

**Symptom.** You press **Verify** on **Security → Overview**, and the lines under it say why each method didn't work.

**Cause and fix.** Read the line for the method you used:

- "No matching TXT record yet (DNS changes can take a while to appear)": the record isn't visible yet, or it's on another name or has another value. Startica looks on the site's host name and on the same name without `www.`, for exactly the value shown (`startica-verification=` followed by the code). Wait up to an hour, then press **Verify** again. To see what DNS answers, run `dig +short TXT fieldnote.example`.
- "https://fieldnote.example/.well-known/startica-verification.txt answered HTTP 404": the file isn't at that address. It must be at the root of the site's host name, even if the start address has a path. Some site builders and hosts leave out folders whose names start with a dot, so check that `.well-known` was published.
- "… answered without the code": the address answered, but not with the code shown. Copy the code again. A sign-in page or a page that answers every address gives this too.
- "… couldn't be reached": the site didn't answer. Check the start address in **Site settings**.
- "Search Console isn't connected for this product": use the DNS record or the file, or [connect Search Console](/credentials/search-console).
- "Search Console is connected, but its last sync failed": fix the connection first. See [Google Search Console](/credentials/search-console#troubleshooting).
- "The Search Console property (https://www.fieldnote.example/) doesn't cover this site": a URL-prefix property covers only addresses that start with it, so `https://www.` doesn't cover `https://` without `www.`, or `http://`. A domain property (`sc-domain:fieldnote.example`) covers the domain and every subdomain.

In the [demo](/guides/demo-mode), **Verify** is disabled ("Verification is off in the demo."). See [Prove the site is yours](/security#prove-the-site-is-yours).

### Security checks don't run

**Symptom.** **Findings** or **Report** says "Security checks are off until you prove the site is yours.", **Monitoring** says "Monitoring starts once you prove the site is yours.", or **Check now** says "Verify the site first".

**Cause.** The site isn't verified. Changing a site's start address to a different host name (for example from `fieldnote.example` to `app.fieldnote.example`) undoes its verification. Changing only the path doesn't.

**Fix.** Open **Security → Overview** and press **Verify**. The code stays the same after a host change, so a DNS record or file you already published still counts if it's on the new host name.

Once verified, the Overview says "Run a scan to check the site". The checks run as part of scans, so press **Scan now**.

### "Some checks couldn't run last time"

**Symptom.** **Security → Monitoring** shows "Some checks couldn't run last time:" with one or more lines.

**Cause.** An outside service that monitoring reads was down, slow or limiting requests. Each line names the part that failed and why, for example:

- "Certificate logs and DNS: crt.sh answered HTTP 502", or a timeout: crt.sh is a free public service and is often busy.
- "Vulnerability databases: api.osv.dev answered HTTP 429": OSV.dev, FIRST EPSS (`api.first.org`) or CISA's KEV list (`www.cisa.gov`) failed or was limiting requests.

**Fix.** Usually nothing. The other parts still ran, and findings from the part that failed stay as they were. Monitoring runs again every day at 06:47 and after each full scan, or click **Check now** later. See [Outside services](/security/monitoring#outside-services).

### No subdomains, certificates or look-alikes

**Cause.** Sites on your computer or network (`localhost`, private addresses) and sites at reserved names (`.example`, `.test`, `.invalid`) aren't in public certificate logs or DNS, so monitoring skips that part for them. Libraries and third-party scripts are still checked.

For a site at a reserved name, monitoring doesn't start after a scan, and **Check now** says "Monitoring is already running for this site" without starting a run. The daily run still checks it.

Elsewhere, "Monitoring is already running for this site" means a run is waiting or running. Jobs run only while Startica is open.

## SEO & GEO

Each SEO & GEO screen has a troubleshooting table with every message: [AI visibility](/seo/ai-visibility#troubleshooting), [Agents](/seo/agents#troubleshooting), [Off-site presence](/seo/off-site#troubleshooting) and [Opportunities](/seo/opportunities#troubleshooting). The common problems are below.

### AI visibility won't run

**Symptom.** **Run now** on **SEO & GEO → AI visibility** is disabled, or clicking it shows an error.

**Cause and fix:**

- Disabled, with "Add an AI key in Settings first" when you point at it: there's no Anthropic or OpenAI key. See [No AI API key](#no-ai-api-key).
- Disabled, with "AI is off in the demo": leave the [demo](/guides/demo-mode) to run your own product.
- Disabled with no reason, or "Add some questions first": the product has no active questions. Add or resume some, or click **Suggest questions**.
- "A run is already going": wait for it, or stop it.

### An AI visibility run stopped or failed

**Symptom.** A note above the tiles, for example "Last run (yesterday): Stopped at the $2.00 cap after 31 of 60 questions." It's red when the run failed.

**Cause and fix:**

- "Stopped at the $_n_ cap after _n_ of _n_ questions.": the run reached its **Cost cap per run** ($2 by default). The answers so far count. Raise the cap in **Settings** on the AI visibility screen, or pause some questions.
- "Monthly AI budget reached ($_n_ of $_n_)": see [Budget cap reached](#budget-cap-reached). The run keeps the answers it got.
- "No Anthropic API key: …", "No OpenAI API key: …" or "Unknown model …": the `answer` or `score` task uses a model whose provider has no saved key. See [No AI API key](#no-ai-api-key).
- **Failed** on single questions: any other error fails only that question, and the run carries on. **Read the answer** shows the error. If every question fails, the run fails with the first error as its note.

### No weekly AI visibility run

**Cause.** Weekly runs are off by default. With **Run every week** on, a run starts on Mondays at 09:30, and only if Startica is open, an AI key is saved, the product has active questions and no run is going. A missed Monday isn't caught up.

**Fix.** Turn on **Run every week** in **Settings** on the AI visibility screen, or click **Run now**.

### Agents or Off-site checks fail

- **Agents** says "The last check didn't finish: …": the check failed with that error and isn't retried. Click **Check now**. If most checks say "couldn't be fetched", the site was down, slow or at a reserved name. See [Agents troubleshooting](/seo/agents#troubleshooting).
- **Off-site presence** shows "Couldn't read it" or "Its robots.txt asks not to be read" on a card: the page timed out, failed or asks not to be read. Startica doesn't read it; open the page yourself. See [Off-site troubleshooting](/seo/off-site#troubleshooting).

## Ad creatives

These are for [Creatives](/ads/creatives) on an ad campaign.

### Can't draw a picture with AI

**Symptom.** In the creative dialog, **Draw it with AI** is greyed out with "needs an OpenAI key in Settings", **Draw again** is disabled, and the **Sizes** card says "no OpenAI key yet: upload pictures instead, or add a key in Settings".

**Cause.** Pictures are drawn only by OpenAI's image models, so they need an OpenAI API key, even if Claude is your provider for everything else.

**Fix.** Add an OpenAI key in **Settings** → **General** → **AI**. Or choose **Upload my own** or **No picture, just the words**, which need no AI. See [The picture](/ads/creatives#the-picture).

### A creative fails to draw

**Symptom.** The creative shows **Failed**, or keeps its earlier images, with a red message.

**Cause and fix:**

- "Leave _name_ out of the picture: ads can't show other brands": what the picture shows names a competitor from Intel. Click **Edit** and remove the name.
- "OpenAI declined to draw this (…)": OpenAI's moderation refused the description. Change what the picture shows (no real people, brands or health claims) and draw again.
- "Monthly AI budget reached ($_n_ of $_n_)": see [Budget cap reached](#budget-cap-reached). Pictures count toward the monthly budget.
- "No OpenAI API key: …": the key was removed. See [No AI API key](#no-ai-api-key).

A failed drawing isn't retried by itself. What it cost still shows on the card.

### A creative fails to render

**Symptom.** The creative shows **Failed** after **Rendering**.

**Cause and fix:**

- "Images can't be rendered here: open Startica's desktop app (or install Playwright's Chromium for browser dev mode)": you're in browser development mode without Chromium. Use the desktop app, or install Chromium as in [Scans run in the desktop app](#scans-run-in-the-desktop-app).
- "The _width_×_height_ image is bigger than the platform takes": even as a JPEG at quality 75, that size is over the platform's file limit. Try a less detailed picture or another template.
- "The picture is missing: draw or upload it again": the picture's file is gone from the [data folder](/reference/data-folder#ad-images). Click **Edit** and draw or upload it again.

After fixing the cause, click **Render again** (the arrows icon). See [Rendering](/ads/creatives#rendering).

### Words shrunk or cut off

**Symptom.** Above the downloads: "The words don't fit at 1.91:1: they're cut off." or "The words had to shrink a lot to fit at 1.91:1, so they may be hard to read."

**Cause.** The headline, supporting line and button don't fit their space at that size, even after the template shrank them. Wide sizes have the least room.

**Fix.** Shorten the headline or supporting line, or try another template. See [Templates](/ads/creatives#templates).

## Issue trackers

These are for [GitHub and GitLab issues](/accessibility/issue-trackers).

### GitHub or GitLab won't connect

**Symptom.** **Save and check** shows an error, and the **Issue tracker** card in **Settings → Products** shows **Error** with the reason in red.

**Cause and fix:**

- "Reading the repository failed: the token is invalid or expired" (GitLab: "Reading the project failed: …"): the token was mistyped, revoked or has expired. Create a new one and save it with **Change**.
- "… failed: the token isn't allowed to do this (check its permissions)": on GitHub, give the token **Issues: Read and write**. On GitLab, it needs role **Reporter** or higher and scope **api**.
- "… failed: repository not found, or the token can't see it": check the repository path and that the token has access to it. For GitHub Enterprise, **Server** must end in `/api/v3`.
- "Issues are turned off for _repository_": turn on issues in the repository's settings.
- "Couldn't reach _host_ (…)": check the **Server** address and your connection.

Every message and its fix: [When the check fails](/credentials/github-gitlab#when-the-check-fails).

### Issues aren't opened or closed

**Symptom.** A scan finishes, but no issues appear in the repository, or fixed problems' issues stay open.

**Causes:**

- **Open issues automatically after each scan** is set to **No, only when I click Create issue** (the default), or to an impact higher than the new problems.
- Startica opens at most 10 issues per run, most important first. The rest are opened after the next scans.
- **Close the issue when Startica sees it fixed, and reopen it if it comes back** is unticked.
- A request failed, for example after the token expired. The **Issue tracker** card shows the error in red, such as "Opening the issue failed: the token is invalid or expired" or "Closing the issue failed: …". A failed sync is tried once more, then waits for the next scan.
- Issues are opened and closed after a scan or check finishes, and only while Startica is open.

**Fix.** Check the settings and the error on the card, fix the token with **Change**, then run a scan. Startica doesn't notice issues that people close, reopen or delete in the repository. See [Closing fixed issues](/accessibility/issue-trackers#closing-fixed-issues).

## Posting with Startica

These are for the **Post with Startica** window that **Post…** opens (beta). In every case, **Copy & open thread** (or **Copy**) and **Mark as posted** still work. See [Posting with Startica](/guides/assisted-posting).

### No Post… button

**Cause.** **Post…** appears only in the desktop app, only on drafted Inbox replies and unposted Content Studio pieces, and only for X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse. It's hidden in browser mode (`yarn dev:desktop-web`) and for Facebook, blog, newsletter, email and other channels. On the supported sites it's also hidden when:

- the item is a thread on X, Bluesky or Mastodon,
- the text is over the site's limit (X 4,000 characters, LinkedIn 3,000, Mastodon 500, Bluesky 300),
- it's for Mastodon and no server is set in **Settings → Channels → Posting**,
- it's a Content Studio piece for Discourse and the product has no watched Discourse forum,
- the Inbox link isn't a post link (for example an X or LinkedIn profile).

**Fix.** Use the desktop app (`yarn dev:desktop` or a build). Set your Mastodon server, watch a Discourse forum, or shorten the text (a Mastodon reply's `@author ` mention counts toward its 500 characters). Otherwise copy and post by hand.

A Hacker News, Reddit or Discourse piece with no title still shows **Post…**; clicking it says "Add a title first: this channel's posts need one". Fill in the **Title** and click it again. See [Posting with Startica](/guides/assisted-posting#when-the-post-button-is-hidden).

### "Sign in on this page first"

**Cause.** You're not signed in to the site in the posting window. Its sign-ins are separate from your normal browser.

**Fix.** Sign in on the page, then click **Fill in again** in the bar. You only need to do this once per site; Startica keeps the sign-in between launches.

### Sign-in refuses the window

**Symptom.** Signing in to X or Reddit fails in the posting window: a "Sign in with Google" or "Sign in with Apple" page says the browser isn't supported or secure, or the site's own sign-in keeps failing.

**Cause.** Some sign-in pages refuse browsers embedded in apps. The posting window presents itself as plain Chrome, but a site can still detect it.

**Fix.** Sign in with the site's own username (or email) and password instead of Google or Apple, if your account has one. If the site still refuses, use **Copy & open thread** for that site and post in your normal browser.

A Discourse forum can sign you in with Google, Apple, GitHub, GitLab, Discord or Microsoft inside the posting window. A forum with its own single sign-on elsewhere (a company login, for example) can't finish signing in there: that page opens in your normal browser. Use the forum's own username and password if it has them, or copy and post by hand and use **Mark as posted**.

### "Couldn't find where to fill it in"

**Cause.** The reply or post box wasn't where Startica expected it: the site changed its layout, a CAPTCHA or interstitial page is in the way, or the thread is locked or archived.

**Fix.** The text is already on your clipboard. Paste it into the box and press the site's button; Startica still saves the link if it can recognize the post. If it keeps happening on a site, report it in [GitHub Discussions](https://github.com/chriscasper/startica/discussions).

### "Did it post?" (link not saved)

**Cause.** You pressed the site's button, but Startica couldn't find the link to the new post. This is also what you see when the site refused the post.

**Fix.** Check the page. If it posted, copy the link to your post, click **Save link…**, paste it into **Link to your post** and click **Save**. Or close the window and use **Mark as posted** with the link.

### Hacker News: "posting too fast"

**Cause.** Hacker News limits how often an account can post, especially new accounts. When it refuses a post, Startica can't find a new item, and the bar asks "Did it post?".

**Fix.** Nothing was posted. Close the window, wait a while, and click **Post…** again.

### Discourse: "add its link in Startica then"

**Cause.** The forum held your post for a moderator, so it has no link yet. Startica recorded it as posted without a link.

**Fix.** Once the moderator approves it, click **Add link** and paste the post's link: on the card in the Inbox's **Posted** tab for a reply, or on the posted piece in Content Studio. Replies to it are tracked from then on.

### LinkedIn: is this allowed?

LinkedIn's terms prohibit automated commenting and extensions that automate activity, and don't address filling in a box that you then submit yourself. LinkedIn enforces its rules more actively than the other sites. If you're unsure, use **Copy & open thread** for LinkedIn. See [LinkedIn and its terms](/guides/assisted-posting#linkedin-and-its-terms).

### Signed in as the wrong account

**Fix.** Sign out on the site's own page in the posting window, then sign in with the right account. To sign out of every site at once, see [Data folder](/reference/data-folder#posting-sign-ins).

## Jobs look stuck

**Symptom.** A job stays "running" on the System page, Intel says "Building…" for a long time, or new scans don't seem to start.

**Causes:**

- **Jobs only run while Startica is open.** If the app was quit, nothing ran in the meantime. Scheduled jobs that were missed aren't caught up later; the next scheduled time runs as usual.
- **Jobs in the same queue run one at a time.** A long scan (Reddit and Discourse forums are the slow parts) holds up the next scan, but not scoring or drafting, which have their own queues.
- **A job was interrupted.** If Startica quit in the middle of a job, that job is held by a lease until the lease expires, then it runs again. Leases are longer than the job's normal run time: 30 minutes for an intel build, 40 minutes for scans and engagement syncs. The old run's row on the System page stays "running"; that's cosmetic.

**Fix.** Leave Startica open and check System after the lease time. If a job failed, its error is in **Result / error**. AI-heavy jobs (intel builds, roadmaps, audits, drafts) never retry on their own: run them again from their page.

## Budget cap reached

**Symptom.** Jobs fail with "Monthly AI budget reached ($X of $Y)". **AI calls** shows the status `blocked`.

**Cause.** This month's spend reached the monthly budget in Settings. Startica stops calling the AI, at either provider, until the next calendar month (in your local time).

**Fix.** Open **Settings** → **General** → **AI**, click **Change keys or budget**, and raise **Monthly budget (USD)**. Leave the key fields blank to keep your keys. Then rerun the failed job from its page. See [Costs and budget](/concepts/costs).

## No AI API key

**Symptom.** Jobs fail with "No Anthropic API key: add one in Settings → General → AI (the ping task uses claude-haiku-5-5)" or "No OpenAI API key: …". System shows the key as **Missing**.

**Cause.** The task's model belongs to a provider whose key isn't saved. The message names the task and its model. This also happens if you edited a task to use the other provider's model and then removed that provider's key.

**Fix.** Open **Settings** → **General** → **AI** and click **Add API key** (or **Change keys or budget**), or click **Add key** on Today's Getting started checklist. Paste the key for the provider named in the error. Or switch the task back to a model from the provider whose key you have, with the pencil on its row. See [How Startica uses AI](/concepts/ai#providers).

## Updates

These are for the installed app's automatic updates. See [Updating](/getting-started/updating).

### "Updates work in the installed app"

**Symptom.** **Check for Updates…** in the tray menu says "Updates work in the installed app" ("This is a development build."), and **Check for Updates Automatically** is greyed out.

**Cause.** You're running dev mode (`yarn dev:desktop`), which never checks for updates.

**Fix.** Pull the latest code and restart. See [Update from source](/getting-started/updating#update-from-source).

### "Couldn't check for updates"

**Symptom.** **Check for Updates…** says "Couldn't check for updates", with the reason.

**Cause.** The check couldn't read the release files on GitHub: you're offline, GitHub didn't answer, or there's no published release to read yet. Automatic checks fail silently; their reason is in [the logs](#the-logs), on lines tagged `[updates]`.

**Fix.** Check your connection and click **Check for Updates…** again. Until a release is published, update [from source](/getting-started/updating#update-from-source).

### macOS: the update doesn't install

**Symptom.** On macOS, a newer release is found and downloaded, but Startica stays on the old version.

**Cause.** macOS only installs an update signed by the same developer as the app you're running, and releases aren't signed yet. See [When an update is not installed](/getting-started/updating#when-an-update-is-not-installed).

**Fix.** Update from source. A rebuilt unsigned app may ask for Keychain access again; see [Keychain prompts](#keychain-prompts).

## The window never opens

**Symptom.** Launching Electron from a terminal prints a JavaScript error (for example, that the module `electron` doesn't provide an export named `app`) and no window appears.

**Cause.** `ELECTRON_RUN_AS_NODE=1` is set in your shell. Code editors like VS Code and Cursor set it in their built-in terminals. It makes Electron run as plain Node.

**Fix.** Start dev mode with `yarn dev:desktop`, which clears the variable. If you start a built copy from an editor terminal, clear it first:

```bash
unset ELECTRON_RUN_AS_NODE
```

## Server exited unexpectedly

**Symptom.** A dialog says "The Startica server exited unexpectedly" and the app quits.

**Cause.** The background server crashed. The reason is in the log.

**Fix.** Start Startica from a terminal (see [The logs](#the-logs)) to capture the error, then open the app again. If it keeps happening, report it in [GitHub Discussions](https://github.com/chriscasper/startica/discussions) with the log.
