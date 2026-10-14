---
title: Settings
description: Every tab, card and field on Startica's Settings page, with defaults, limits and where each value is stored.
layout: doc
---

The Settings page (sidebar → **Settings**, header "AI and the app, your products, and channels.") has three tabs, picked with the switch at the top:

| Tab | Address | Shown under the switch | Cards |
| --- | --- | --- | --- |
| **General** (the default) | `/settings` | "AI provider, keys and budget; how the app runs." | **AI**, **App** |
| **Products** | `/settings?tab=products` | "Your products, where Startica reads their results, and the sites it checks." | **Products**, **Connections for _product_**, **Issue tracker for _product_**, **Sites for _product_** |
| **Channels** | `/settings?tab=channels` | "Finding conversations and posting: X and Mastodon." | **X API (optional, paid)**, **Posting**, **Elsewhere** |

This page lists every field on them, what it does, its default and limits, and where the value ends up in the local database. The page refreshes itself when any of the underlying tables change, so a sync finishing in the background shows up without a reload. Links elsewhere in the app such as "Add one in Settings" open the **Products** tab.
Two kinds of storage are mentioned below:

| Storage | What it means |
| --- | --- |
| **Secret** | A row in the `secrets` table, encrypted. In the desktop app the encryption key lives in the OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret). In browser dev mode a key file in the data folder is used instead. See [Data folder](/reference/data-folder). |
| **Plain** | A normal row in the SQLite database (`startica.db`), readable by anyone who can open the file. |

## General

### AI

The card description shows the provider in use, each key's status and the budget: "Using Claude (Anthropic)." (or "Using OpenAI."), "Anthropic API key: saved", "OpenAI API key: not set" and "Monthly budget: $_n_." A missing key for the provider in use shows "not set" in red.

#### Provider, keys and budget

The button reads **Add API key** until the provider in use has a key, then **Change keys or budget**. It opens "AI provider":

| Field | Rules | Default | Storage |
| --- | --- | --- | --- |
| Use | **Claude (Anthropic)** or **OpenAI**. | Claude, or the provider with a saved key | Plain, `settings` table key `ai_provider` |
| Anthropic API key | Must start with `sk-ant-`. Required if **Use** is Claude and no key is saved. Once a key is saved the label reads "(leave blank to keep the saved one)"; otherwise, for the provider not in use, "(optional)". | (none) | Secret `anthropic_api_key` |
| OpenAI API key | Must start with `sk-` (and not `sk-ant-`). Same rules as above. | (none) | Secret `openai_api_key` |
| Monthly budget (USD) | Required, at least 1, at most 10,000. | 50 | Plain, `settings` table key `ai_monthly_budget_usd` |

Switching provider moves every task still on the other provider's models to the new provider's recommended models (see the defaults below). Tasks already on the new provider's models keep their settings.

When the provider not in use has a saved key, a **Remove Claude (Anthropic) key** or **Remove OpenAI key** button appears next to the main button. It deletes that key. Any task you routed to that provider's models stops working until you add the key again.

How they are resolved at run time:

- **Key:** each task's model decides the provider, and the call uses that provider's saved key. Without one, the call fails with "No Anthropic API key: add one in Settings → General → AI (the _task_ task uses _model_)" or the same for OpenAI.
- **Budget:** the saved value, else 50. A value that is not a positive number falls back to 50. One budget covers both providers.
- **Enforcement:** before every AI call, Startica adds up the estimated cost of this month's calls (from the 1st of the month, local time). When spend has reached the budget, the call is not made, it is logged as `blocked`, and the job fails with "Monthly AI budget reached ($_spent_ of $_budget_)". See [Costs](/concepts/costs).

Get a key at platform.claude.com → API keys or platform.openai.com/api-keys. See [Anthropic API key](/credentials/anthropic) and [OpenAI API key](/credentials/openai).

The welcome wizard's **Connect AI** step saves the same provider, key and budget. See [First run](/getting-started/first-run).

#### Model for each task

The table sits in a collapsed section, **Advanced: the model for each task** ("Picking a provider sets these to its recommended models; change one only if you have a reason to."). It lists one row per task with its **Model**, **Effort** and **Max tokens**. The pencil opens "Model for '_task_'" ("Applies to the next job that runs this task."). Storage: plain, `ai_models` table. Each row shows the model's name and price with its ID below. The rows are created with Claude's defaults the first time the app starts; choosing OpenAI (in the wizard or in the **AI** card) moves them to OpenAI's:

| Task | Description shown | Claude default | OpenAI default | Effort | Max tokens (Claude / OpenAI) |
| --- | --- | --- | --- | --- | --- |
| answer | AI visibility: answering your questions with web search, as an assistant would | `claude-sonnet-5-5` | `gpt-6.1-sol` | low | 4,000 / 8,000 |
| draft | Reply and post drafts | `claude-sonnet-5-5` | `gpt-6.1-sol` | medium | 4,000 / 8,000 |
| image | Ads: drawing ad pictures (OpenAI only; effort is the image quality) | `gpt-image-2.5-flare` | `gpt-image-2.5-flare` | medium | 4,096 / 4,096 |
| ping | System health check | `claude-haiku-5-5` | `gpt-6-luna` | low | 256 / 1,024 |
| research | Web research on competitors and communities | `claude-opus-5-5` | `gpt-6.1-sol` | high | 16,000 / 32,000 |
| score | Scoring conversations for relevance, and reading AI visibility answers | `claude-haiku-5-5` | `gpt-6-luna` | low | 1,024 / 2,048 |
| strategy | Briefs, positioning, roadmap and weekly re-plan | `claude-opus-5-5` | `gpt-6.1-sol` | high | 16,000 / 32,000 |
| vision | Reading images in threads and screenshots | `claude-sonnet-5-5` | `gpt-6.1-sol` | medium | 4,000 / 8,000 |

OpenAI's output limits are higher because they include reasoning tokens.

The `image` row is the exception to the provider switch: it's always on an OpenAI image model, so choosing Claude doesn't move it, and drawing an [ad picture](/ads/creatives) needs an OpenAI API key even when Claude is in use. See [The image task](/concepts/ai#the-image-task).

Rows appear sorted alphabetically by task. Which jobs use which task is listed in [Background jobs](/reference/jobs).

> [!NOTE]
> Despite its description, the `vision` task is used by Accessibility: the [alt text review](/accessibility/ai-help#alt-text-review) and **Ask AI** on [Needs review](/accessibility/ai-help#needs-review) items.

Edit dialog fields:

| Field | Options | Notes |
| --- | --- | --- |
| Model | Claude Fable 5.1 ($10 / $50 per M tokens), Claude Opus 5.5 ($4 / $20), Claude Sonnet 5.5 ($2 / $10), Claude Haiku 5.5 ($0.1 / $0.5), GPT-6 Astra ($10 / $50), GPT-6.1 Sol ($2 / $10), GPT-6 Luna ($0.1 / $0.5). For the `image` task instead: GPT Image 2.5 Flare ($5 / $30) and GPT Image 2.5 Sunburst ($5 / $30). | Prices are input / output per million tokens. Stored as `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`, `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`. Saving needs a key for the model's provider; otherwise: "Add an Anthropic API key first (Change keys or budget)" or the same for OpenAI. An image model on a text task fails with "Image models only draw pictures: pick a text model", and a text model on the `image` task with "Pick an image model for this task". |
| Effort | `low`, `medium`, `high`, `xhigh`, `max` | Pre-selects `medium` if the row has none. Labelled **Quality** for the `image` task, where it's the picture's quality. |
| Max output tokens | Whole number from 256 to 64,000 | A response that hits the limit fails as truncated. |

If a task's row is missing, Startica uses the defaults above for the provider in use. The `answer` row is added to existing workspaces when they update to the version with [AI visibility](/seo/ai-visibility), on the provider of their `draft` model. The `image` row is added, with `gpt-image-2.5-flare` at `medium`, when they update to the version with [ad creatives](/ads/creatives).

### App

"Scans, syncs and the weekly re-plan only run while Startica is open (closing the window keeps it running in the tray)."

| Item | What it does |
| --- | --- |
| **Open Startica in the tray when I log in, so scheduled scans and syncs keep running** | Installed app only. Turns launch at login on or off; it's the same setting as **Launch at Login** in the tray menu and the wizard's **Open Startica when I log in**. Elsewhere the card says "Launch at login: available in the installed app." See [Running in the background](/guides/background). |
| **Data folder: _path_** | Where Startica keeps its database and files. **View** opens it in Finder, Explorer or your file manager. To change it, see [Data folder](/reference/data-folder). |
| **Run setup again** | "Opens the welcome steps again and brings back the Getting started checklist on Today." |

**Run setup again** opens the welcome wizard (**Welcome to Startica**) and, if you hid it, brings back the **Getting started** checklist on Today. The wizard starts at the first step that isn't done; with a key and a product already saved, that's **A few extras**. Nothing you saved is reset. See [First run](/getting-started/first-run#run-setup-again).

| Value | Storage |
| --- | --- |
| Launch at login | The operating system's login items, not the database |
| Whether the wizard was finished or skipped, and whether the checklist was hidden | Plain, `settings` table key `setup` (`{ "welcomeDone": …, "checklistDismissed": … }`) |

The wizard opens by itself only while there's no product and `welcomeDone` isn't set. **Run setup again** clears both flags.

## Products

### Products card

"The things you market and check with Startica. Pick one to see its connections and sites below; the header's switcher sets the product the rest of the app shows."

Click a product's name to show its **Connections**, **Issue tracker** and **Sites** below (the address gets `&product=…`). This doesn't change the active product: **Active** marks the one the rest of the app shows, and **Showing below** marks the one you picked, when they differ.

The table lists each product's **Name** (with an **Active** badge on the one selected in the header, and the one-liner underneath), **Website** and **Stage**, plus an edit (pencil) button. With no products it shows "No products yet. Add the first one to get started." The **Connections**, **Issue tracker** and **Sites** cards below only appear once a product exists.

**Add product** opens the "Add a product" dialog ("After adding it, open Intel to build its brief."). The pencil opens "Edit _name_" with the same fields:

| Field | Required | Values and rules | Default |
| --- | --- | --- | --- |
| Name | Yes | Any non-empty text. | (none) |
| Website | Yes | A full URL, e.g. `https://fieldnote.app`. Error otherwise: "Enter a full URL, e.g. https://example.com". | (none) |
| One-liner | No | One sentence ("What it is, in one sentence"). Blank is saved as empty. | (empty) |
| Stage | Yes | Idea, Pre-launch, Launched, Growing (`idea`, `pre_launch`, `launched`, `growing`). | Launched |

Storage: plain, in the `products` table. Adding a product also makes it the active product (a cookie named for the product switcher, valid for a year), so Intel opens on it.

> [!NOTE]
> There is no way to delete a product from the UI yet.

#### Per-product scoring thresholds

Each product also has two scoring thresholds (stored in the `products` table). A conversation found by listening gets a draft only if its scores meet both; otherwise it is archived. Pasted links ignore them.

| Column | Default | Meaning |
| --- | --- | --- |
| `relevance_threshold` | `0.7` | Minimum relevance score (0 to 1). |
| `intent_threshold` | `0.5` | Minimum intent score (0 to 1). |

Change them with **Scoring** in the Inbox toolbar; see [Finding conversations](/guides/finding-conversations#thresholds). Other per-product settings (your notes, keywords, watched communities, voice profiles) live on their own pages: see [Finding conversations](/guides/finding-conversations) and [Voice profiles](/guides/voice-profiles).

### Connections

The card is titled **Connections for _product_**, for the product picked in the list (the active product unless you pick another). "Where Startica reads this product's results. Engagement on Reddit, Hacker News, Bluesky, Mastodon and Discourse needs no setup." Each connection belongs to one product; click another product in the list above to configure its connections.

Every connection row shows a status badge, a short description, "Last synced _date_" once it has synced, any error, and a trash button to remove it (after a confirmation; its saved credential is deleted too).

| Badge | Meaning |
| --- | --- |
| Not connected | Nothing saved. |
| Checking… | Saved, not tested yet (a test sync is queued on save). |
| Connected | The last sync succeeded. |
| Error | The last sync failed; the error is shown. |

#### Google Analytics 4

"Visits by source, key events, and visits from each Startica reply."

**Connect** (or **Replace key** once saved) opens "Connect Google Analytics 4". It says Startica reads GA4 with a service account, a key that can only view the properties you add it to, and lists the setup steps. Fields:

| Field | Notes |
| --- | --- |
| Property ID | Required, digits only (hint: "In Google Analytics: Admin → Property details."). Otherwise: "The GA4 property ID is a number (Admin → Property details)". |
| Service account key | **Choose file…** loads the downloaded `.json` file, or paste its contents. It must be a whole service account key (`"type": "service_account"` with `client_email` and `private_key`). Otherwise: "Paste the whole service account key: the contents of the .json file, starting with {". Leave it blank when replacing to keep the saved key. |

The dialog lists the three setup steps above the fields, with links to Google Cloud's Data API and service accounts pages. **Save and test** stores the key encrypted and queues a test sync. Once saved, the row shows "Property _id_". Full walkthrough: [Google Analytics](/credentials/google).

#### Umami

"Visits, visitors, sources, pages, custom events, and visits from each Startica post. Use it instead of Google Analytics, or as well (Google Analytics is used when both work)."

**Connect** (or **Change** once saved) opens "Connect Umami": "Startica reads your Umami statistics with an API key. It only reads; nothing is changed in Umami." It lists two setup steps (create an API key under **Settings → API keys**, on Umami Cloud or your own Umami 3.4 or later; for read-only access, put the website in a team, add a view-only user to that team as view-only and create the key as that user; on older installs, `username:password` of a view-only user; copy the website's ID from **Settings → Websites → Edit**). Fields:

| Field | Notes |
| --- | --- |
| Server | Empty for Umami Cloud (placeholder: "Leave empty for Umami Cloud, or https://umami.example.com"). Hint: "Your own Umami: its address. Startica adds /api." `cloud` or a `cloud.umami.is` address also means Umami Cloud (`https://api.umami.is/v1`); `umami.example.com` is saved as `https://umami.example.com/api`. Otherwise: "Enter Umami Cloud, or your Umami's address (e.g. https://umami.example.com)". |
| Website ID | Required. Otherwise: "Paste the Website ID from Umami (Settings → Websites → Edit); it looks like 4fb7a6c2-…". |
| Key events (optional) | Custom event names, separated by commas (placeholder: "signup, purchase"). Hint: "Custom event names that count as conversions. Empty: every custom event counts." |
| API key | An `umami_…` key, or `username:password` on an older self-hosted Umami. Leave it blank when changing to keep the saved key. |

The footnote says "Startica checks the key can read the website before saving. It's stored encrypted on this computer." **Save and sync** first checks that the credentials can read the website and that the server answers like Umami's API with that website's ID (skipped in demo mode); a problem shows in the dialog and nothing is saved. Then it saves and queues a sync. Once saved, the row shows "Umami Cloud" or the server, "website _first 8 characters of the ID_…" and the key events. Full walkthrough: [Umami](/credentials/umami).

#### Google Search Console

"Searches you're found for: clicks, impressions, positions, and your sitemaps. Shows on SEO & GEO → Search."

**Connect** (or **Change** once saved) opens "Connect Google Search Console": "Startica reads Search Console with a service account: read-only, and it only sees the properties you add it to." It lists three setup steps (enable the **Google Search Console API**, create a service account or reuse the GA4 one, add its email in Search Console under **Settings → Users and permissions → Add user** with **Restricted** permission), with links. Fields:

| Field | Notes |
| --- | --- |
| Property | Required (otherwise: "Enter the Search Console property, e.g. example.com or https://example.com/"). Hint: "A domain on its own means a Domain property (sc-domain:). Use the full address for a URL-prefix property." `fieldnote.example` is saved as `sc-domain:fieldnote.example`; `https://fieldnote.example` as `https://fieldnote.example/`. |
| Use the GA4 service account key | Only when the product has a GA4 connection. Ticked by default for a new connection. When ticked, the GA4 connection's key is used, any key pasted below is ignored, and a key the connection had of its own is deleted. |
| Service account key (**Or a service account key of its own** when GA4 is connected) | **Choose file…** loads the `.json` file, or paste its contents. Same check as GA4's key. Leave it blank when changing to keep the saved key. |

The footnote says "The first sync reads the last 16 months, which can take a minute. The key is stored encrypted on this computer." **Save and sync** first checks that the key can read the property (skipped in demo mode); a problem, such as "The service account can't read …", shows in the dialog and nothing is saved. Then it saves and queues a sync. Once saved, the row shows the property, plus "· uses the GA4 key" when it does. Full walkthrough: [Google Search Console](/credentials/search-console).

#### Bing Webmaster Tools

"Optional. Clicks and impressions from Bing and Copilot (Bing reports them together), and top queries and pages, updated weekly by Bing."

**Connect** (or **Replace key** once saved) opens "Connect Bing Webmaster Tools" with two setup steps (add and verify the site in Bing Webmaster Tools; generate an API key under **Settings → API access**). Fields:

| Field | Notes |
| --- | --- |
| Site | Required, the site as Bing Webmaster Tools lists it (otherwise: "Enter the site as Bing Webmaster Tools lists it, e.g. https://example.com/"). A bare domain gets `https://`, and a trailing slash is added. |
| API key | The key from Bing. Leave it blank when replacing to keep the saved key. |

The footnote says "A Bing API key can do anything your Bing Webmaster Tools account can; Startica only reads with it. It's stored encrypted on this computer." **Save and sync** first checks that the key can read the site (skipped in demo mode) and shows any problem in the dialog; then it saves and queues a sync. Once saved, the row shows the site. Full walkthrough: [Bing Webmaster Tools](/credentials/bing-webmaster).

#### Stripe

"Active subscriptions, MRR, new subscriptions and cancellations."

**Connect** (or **Replace key** once saved) opens "Connect Stripe" with one field, **Restricted key** (`rk_live_…`), and the button **Save and test**. The key needs Read access to Customers, Subscriptions, Prices and Invoices and nothing else. The dialog lists the three setup steps, with a link to Stripe's **Create restricted key** page (`https://dashboard.stripe.com/apikeys/create`). Full walkthrough: [Stripe](/credentials/stripe).

#### Product database

"Product numbers like signups and active users, through a read-only login that sees daily totals only. Works with Supabase and any Postgres."

| Control | Shown when | What it does |
| --- | --- | --- |
| Set up / Change setup | Always (**Change setup** once connected) | Opens "Connect the product database" (below). |
| Use a URL instead | Always | Opens "Connect with a connection URL": "Advanced: if you made your own view and read-only login. The view must return (day date, metric text, value numeric). Startica tests the login first and refuses one that can change data." Fields: **View** (required, `schema.view`, lowercase; default `startica.daily_metrics`) and **Connection URL of a read-only login** (`postgresql://…`; leave it blank to keep the saved one). Button: **Test and save**. |

Once set up with **Set up**, the row shows "Tracking: _metric names_ · _host_".

"Connect the product database" says: "You run a short SQL script in your own database. It creates a view with daily totals only, and a read-only login that can see nothing else. Startica connects with that login. It never needs a login that can change your data." It has three steps:

| Step | Fields and buttons |
| --- | --- |
| 1. Pick what to count | One row per metric: **Metric name** (lowercase letters, numbers and `_`), **Table** (`schema.table`; `public` when no schema is given), **Date column** (default `created_at`) and **Count per day** (**Rows**, or **Distinct…** with the column to count). A new setup starts with `signups`: rows of `auth.users` by `created_at`. **Add metric** (up to 12) and a trash icon per metric. **Write the SQL** writes the script; changing a metric afterwards hides it until you write it again. |
| 2. Run this SQL in your database | The script, with **Copy**, and a link to the Supabase **SQL Editor**. Other Postgres: run it with psql as the database owner. The script includes the read-only login's password; when the product already has a connection, it reuses that login's password. |
| 3. Paste your connection string | Hint: "Supabase: **Connect** at the top of your project → **Transaction pooler**. Leave `[YOUR-PASSWORD]` as it is." Startica keeps the host, port, database and options and signs in as `startica_reader` with the script's password. When changing an existing setup, leave it empty to keep the saved database. |

**I ran it: test and save** checks the login (it must not be able to change data) and reads the view, then saves the connection and queues a sync. In demo mode the check is skipped. Errors and what they mean: [Product database](/credentials/supabase#troubleshooting).

Analytics shows `signups` and `active_users` by name; other metrics are stored too.

#### Sync now

**Sync now** appears once the product has at least one connection and queues a `metrics_sync` job for all of this product's connections, including Search Console and Bing. Syncs also run automatically every day at 08:15 local time while Startica is open.

#### Where connections are stored

| Value | Storage |
| --- | --- |
| Pasted credential (service-account JSON, Umami API key or `username:password`, Bing API key, Stripe key, connection URL) and the product database's read-only connection URL | Secret, named `connection-<connection id>`. A Search Console connection that uses the GA4 key has none of its own. |
| Property ID, Umami server, website ID and key events, Search Console property, Bing site, whether the GA4 key is reused, view name, database host, Supabase project ref, metric definitions, status, last sync, errors | Plain, `connections` table |
| Search data (clicks, impressions and positions per day) | Plain, `search_stats` table |
| Search Console sitemaps, as last read | Plain, setting `search_sitemaps:<product id>` |

Saving a connection with the secret field left blank keeps the saved credential. Credentials are only read from Settings. There's no environment variable for any of them, in development either.

### Issue tracker

The card is titled **Issue tracker for _product_**, for the product picked in the list: "GitHub or GitLab: where Startica opens issues for the accessibility problems it finds, so they land in your normal workflow." Each product can connect one repository. Without one, the card says "Not connected." with **Connect**.

Once connected, it shows the service and repository (for example "GitHub: fieldnote/web") with a badge: **Connected**, **Error**, or **Checking…** while the token hasn't been checked yet. Below that, one line describes what Startica does, for example "Opens issues automatically after each scan for new serious and critical issues (at most 10 a scan); closes them when fixed. 3 opened so far." or "Opens issues when you click Create issue. 0 opened so far." The last error, if the last request failed, is shown in red. It clears after the next request that succeeds.

| Button | Shown when | What it does |
| --- | --- | --- |
| Connect / Change | Always ("Connect" until a repository is saved) | Opens the **Connect GitHub or GitLab** dialog ("Startica opens an issue in the repository for each problem its checks find: by hand from an issue's page, or automatically after each scan."), with steps for creating a GitHub or GitLab token. |
| Disconnect | A repository is connected | Asks "Disconnect the repository? Issues already opened stay in it.", then deletes the tracker, its saved token and Startica's record of the issues it opened. |

Dialog fields:

| Field | Rules | Default | Storage |
| --- | --- | --- | --- |
| Service | GitHub or GitLab | GitHub | Plain, `issue_trackers` table |
| Repository | `owner/name` (GitHub) or `group/project` (GitLab), placeholder "owner/name or group/project". A web address is accepted; a trailing `.git` is dropped. Anything else: "Enter the repository as owner/name (GitHub) or group/project (GitLab)". | (none) | Plain, `issue_trackers` table |
| Access token | Required the first time ("Paste an access token"). Hint: "Stored encrypted on this computer and only sent to that service.", or once saved, "Leave empty to keep the saved token." | (none) | Secret `issue-tracker-<tracker id>` |
| Labels for new issues | Comma-separated, at most 10 (extra ones are dropped). | `accessibility` | Plain, `issue_trackers` table |
| Open issues automatically after each scan | **No, only when I click Create issue**, **For new critical issues**, **For new serious and critical issues**, **For new moderate, serious and critical issues** or **For every new issue**. | No | Plain, `issue_trackers` table |
| Open issues automatically for security findings (use only with a private repository) | **No, only when I click Create issue**, **For critical findings**, **For high and critical findings**, **For medium, high and critical findings** or **For every finding except FYI**. Applies to findings from scans and [monitoring](/security/monitoring), within the same 10 a run. Security issues get your labels except `accessibility`, or `security` if that leaves none. | No | Plain, `issue_trackers` table (`auto_min_security`) |
| Close the issue when Startica sees it fixed, and reopen it if it comes back | Checkbox | Ticked | Plain, `issue_trackers` table |
| Server (only for GitHub Enterprise or self-hosted GitLab) | Empty for github.com and gitlab.com. Must be `https://` ("Use an https:// address for the server"); `http://` only for a server on this computer or network. For GitHub Enterprise Server, the API address, such as `https://ghe.example.com/api/v3`. | `https://api.github.com` or `https://gitlab.com` | Plain, `issue_trackers` table |

"Startica checks the token can see the repository when you save." **Save and check** saves the settings, then reads the repository with the token. If that fails, the settings stay saved, the dialog shows the error and the card shows **Error**. The issues Startica opened are recorded in the `tracker_issues` table.

Full guides: [Issues in GitHub or GitLab](/accessibility/issue-trackers) and [GitHub and GitLab](/credentials/github-gitlab).

### Sites

The card is titled **Sites for _product_**, for the product picked in the list: "The websites Accessibility checks. Scans, issues and pages are on the Accessibility screens." With no sites it shows "No sites yet."

| Column | Shows |
| --- | --- |
| Site | The name, linking to **Accessibility** → **Overview** for that site, with the start address underneath. |
| Pages per scan | The page cap for a full scan. |
| Score | The latest site score out of 100, or "–" before the first scan. |
| Target | The target score. |

Each row has **Site settings** and **Remove site**, the same as on the Accessibility Overview. **Add the site** (for the first one, filled in with the product's name and website) or **Add a site** sits in the card header. The site settings, including **Target score** (1–100, default 90), are described in [Accessibility: Site settings](/accessibility#site-settings). Storage: plain, `sites` table.

## Channels

### X API

The card is titled **X API (optional, paid)**. "With your own X API bearer token, Startica also finds X posts matching your top listening keywords, reads pasted X links and checks replies on what you post there. X charges per post read (about $0.005 each), so Startica scans at most every _n_ hours and stops at _n_ reads a day (about $_cost_). Without a token, paste X links as before."

The card shows "Token: saved" or "Token: not set" and "Reads today (UTC): _n_ of _cap_." When the last X search failed, a red line below says "Last X request failed: _reason_.", for example "No X API credits left", "X refused the token (revoked or without access)" or "X rate limit; Startica tries again next scan". It clears after the next successful search. See [When a search fails](/credentials/x-api#when-a-search-fails).

| Button | Shown when | What it does |
| --- | --- | --- |
| Add token / Change | Always ("Add token" until a token is saved) | Opens the **X API** dialog ("Create an app at console.x.com, add credits, and copy its Bearer Token (shown once). It's stored encrypted on this computer and only sent to api.x.com."). |
| Remove | A token is saved | Asks "Remove the X API token?" ("Startica stops reading X; pasting X links keeps working."), then deletes the saved token. The limits are kept. |

Dialog fields:

| Field | Rules | Default | Storage |
| --- | --- | --- | --- |
| Bearer token | Any text. Once a token is saved the label reads "Bearer token (leave blank to keep the saved one)". | (none) | Secret `x_api_bearer_token` |
| Most post reads per day | Required, whole number from 10 to 10,000. Below 10: "At least 10 (X returns at least 10 per search)". | 100 | Plain, `settings` table key `x_api` |
| Scan X at most every … hours | Required, whole number from 1 to 168. | 6 | Plain, `settings` table key `x_api` |

How they are resolved at run time:

- **Token:** the saved token. Without one, X isn't searched and X links aren't read. There's no environment variable for it.
- **Reads today:** counted per UTC day in the `settings` table key `x_api_usage`. Searches, pasted X links and engagement checks on X links all count. Lowering the cap applies to today straight away.

Full guide: [X API (optional, paid)](/credentials/x-api).

### Posting

"Post… opens the site in Startica's posting window with your reply filled in; you press the site's own button. You sign in to each site once, in that window. Mastodon replies and posts go out from your own server."

The card shows "Mastodon server: _server_." or, until one is set, "Mastodon server: not set (Post… stays hidden for Mastodon)." **Edit** opens the **Posting** dialog:

| Field | Rules | Default | Storage |
| --- | --- | --- | --- |
| Your Mastodon server | Your server's name, for example `mastodon.social`. You can also enter your handle (`you@mastodon.social`) or the server's address with `https://`; Startica keeps just the server name, in lowercase. Anything else: "Enter your server's address, e.g. mastodon.social". Empty turns Mastodon posting off. | (empty) | Plain, `settings` table key `posting` |

The welcome wizard's **Your Mastodon server (optional)** field sets the same value. The setting is for the whole workspace, not per product. Sign-ins for the posting window aren't stored here; see [Data folder](/reference/data-folder#posting-sign-ins). How posting works: [Posting with Startica](/guides/assisted-posting).

### Elsewhere

"Settings that live next to what they change." Two links:

- **Intel: watched communities and listening keywords**. See [Finding conversations](/guides/finding-conversations#communities).
- **Inbox → Scoring: what gets a draft**, the [per-product scoring thresholds](#per-product-scoring-thresholds).

## Not on this page

| Setting | Where |
| --- | --- |
| Launch at Login | Besides [General → App](#app): the tray (menu-bar) icon menu, installed app only, or **Open Startica when I log in** in the welcome wizard's last step. See [Background](/guides/background). |
| Automatic update checks | The tray menu: **Check for Updates…** and **Check for Updates Automatically**, installed app only. See [Updating](/getting-started/updating#automatic-updates). |
| Data folder location, port, disabling jobs | Environment variables. See [Environment variables](/reference/environment). |
| Watched communities, including Mastodon hashtags and Discourse forums | **Intel → Communities**. See [Finding conversations](/guides/finding-conversations#communities). |
| API key status, this month's spend, job history | The **System** page. See [Background jobs](/reference/jobs). |
| AI visibility: weekly runs and the cost cap per run | **Settings** on **SEO & GEO → AI visibility**, per product: **Run every week** (default off) and **Cost cap per run, in USD** ($0.10 to $50, default $2). Plain, `settings` table key `ai_visibility:<product id>`. See [AI visibility](/seo/ai-visibility#weekly-runs). |
