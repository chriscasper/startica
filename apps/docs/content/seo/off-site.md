---
title: Off-site presence
description: "The Off-site screen in SEO & GEO: which sites AI answers in your category cite, whether you and your competitors appear on them, and what you can do about each."
layout: doc
---

**Off-site presence** is the sixth part of [SEO & GEO](/seo). When an AI assistant answers "what's a good app for…" with web search on, it leans on other people's pages: review sites, "best of" lists, forum threads, videos, encyclopedias. If those pages name your competitors and not you, the answer usually does the same. Off-site presence takes the pages that [AI visibility](/seo/ai-visibility) answers cited, groups them by site, reads them to see whether you and your competitors appear, and suggests what you can honestly do about each site.

This page explains where the data comes from, every kind of site and its suggestion, how Startica reads the pages and what it never does, every part of the screen, the **Watch** button, the limits, the demo and what to do when something looks wrong. Off-site presence uses no AI and costs nothing.

## Find it

Open **SEO & GEO → Off-site** in the left sidebar. The screen is called **Off-site presence**. Like the rest of Startica, it shows the product picked in the product switcher. It doesn't need a site or any connection of its own, only AI visibility runs.

## Why it matters

AI answers are only as good as their sources, and you don't control most of them. A question like "good alternatives to TerraJot for a small research team" may be answered from a comparison article on `reviews.example`, a thread on a forum and a directory listing. If Fieldnote isn't on those pages, it's hard for the answer to name it, however good Fieldnote's own site is.

So the useful questions are: which sites do the answers in your category trust, are you on them, are your competitors, and is there an honest way to be there too. That's what this screen answers.

> [!NOTE]
> Being on a cited page doesn't guarantee a mention. Each AI provider decides what to search, which pages to trust and what to say. Treat this as a list of places worth your attention, not a recipe.

## Where the data comes from

Everything starts from [AI visibility](/seo/ai-visibility). Off-site presence uses the citations in the **last 4 finished runs** that answered at least one question (stopped and capped runs count if they answered something; a run still going doesn't). Questions that failed in those runs are left out.

With no such run, the screen shows **Starts from AI visibility**: "Off-site presence reads the sources AI answers cite. Add questions and run them on AI visibility, and the sites they lean on show up here." Add questions and run them first.

From those answers, Startica:

1. **Groups the cited pages by site.** A site is the page address's host name without `www.`, so `www.reviews.example` and `reviews.example` are one site, but `old.forum.example` is a site of its own.
2. **Counts, for each site,** how many answers cited it (an answer counts once per site, however many of its pages it cites), how many of those answers didn't mention your product, the questions those answers came from, and each page with how many times it was cited.
3. **Works out what kind of site it is.** See [Kinds of sites](#kinds-of-sites).
4. **Adds what the page reads found:** whether your product appears, and which competitors. See [How pages are read](#how-pages-are-read).
5. **Ranks the sites.** Sites cited by the most answers that **didn't** mention you come first, then by the number of answers citing them, then by name. Your own site always comes last.

This is worked out fresh every time you open the screen. Only what each page said when it was read is stored.

## Kinds of sites

Each site gets one kind, shown as a badge on its card. Startica checks them in this order:

| Kind | Badge | How it's decided |
| --- | --- | --- |
| Your site | **Your site** | The product's website from **Settings → Products**, or a subdomain of it (`docs.fieldnote.example` for `fieldnote.example`). |
| A competitor's site | **Competitor's site** | The website of one of your competitors in [Intel](/getting-started/first-day), or a subdomain of it. A competitor without a website in Intel can't be recognized. |
| Community | **Community** | Reddit, Hacker News, Stack Exchange, Stack Overflow, Quora, Discord, Lemmy servers, and any host with a `forum`, `forums`, `discuss`, `discourse` or `community` part followed by more of the name, such as `forum.example.org` or `en.community.example.org`. |
| Directory or reviews | **Directory or reviews** | Software directories and review sites (G2, Capterra, GetApp, Software Advice, TrustRadius, Trustpilot, Product Hunt, AlternativeTo, SaaSHub, SourceForge, Slant, StackShare, Crozdesk) and the app stores (Apple's App Store, Google Play, the Chrome Web Store). |
| Video | **Video** | YouTube, Vimeo, TikTok and Loom. |
| Reference | **Reference** | Wikipedia and the other Wikimedia sites, Britannica, GitHub, GitLab and MDN. |
| Article or blog | **Article or blog** | Everything else. |

The list of known sites was checked on 2026-10-13 and is updated with the app. A site that isn't on it is an **Article or blog**, even if it's really a directory or a forum on its own domain.

## What to do about each site

Each card has one suggestion, chosen by the site's kind and what the page reads found. "Fieldnote" below stands for your product's name. When competitors were found on the site's pages, the suggestion ends with, for example, "TerraJot, Quadrat are there."

| Kind | Suggestion |
| --- | --- |
| Your site | "Answers already cite your own pages. Keep them current and specific: they're your best source." |
| A competitor's site | "A competitor's own pages answer these questions. Publish your own honest page on the same topics (Opportunities can outline a comparison)." |
| Community, with a cited subreddit you don't watch | "AI answers quote these threads. Watch the community (it joins Intel → Communities, which the Inbox scans) and take part where Fieldnote genuinely helps; never astroturf." |
| Community, otherwise | "AI answers quote these threads. Take part where Fieldnote genuinely helps, under your own name; never astroturf." |
| Directory or reviews, where you appear | "Fieldnote is listed. Keep the listing complete and current, and ask happy users for honest reviews." |
| Directory or reviews, where you don't appear | "List Fieldnote here, or claim its listing, and ask happy users for honest reviews. Never pay for or fake reviews." |
| Directory or reviews, not read | "Check whether Fieldnote is listed here; if not, list it or claim its listing, and ask happy users for honest reviews. Never pay for or fake reviews." |
| Video | "Answers cite videos here. A short, honest demo or how-to for the questions people ask can be cited too." |
| Reference | "A reference source. You can't add yourself to most of these; being notable and well documented elsewhere is what gets a product included." |
| Article or blog, where you appear | "Fieldnote is already mentioned here." |
| Article or blog, where you don't appear | "If it's a list, review or comparison that takes suggestions, tell its author what Fieldnote does and who it suits. Don't pay for placement." |
| Article or blog, not read | "Not read yet. If it's a list, review or comparison that takes suggestions and Fieldnote isn't in it, tell its author what Fieldnote does and who it suits. Don't pay for placement." |

"Not read" means none of the site's pages could be read yet (see [Site cards](#site-cards)), so Startica doesn't know whether you're there. Check the page before you act.

For a competitor's site, [Opportunities](/seo/opportunities#ai-answers-opportunities) lists the comparison questions where answers named competitors and not you, and can write an honest comparison article in Content Studio.

### What Startica never does

Off-site presence tells you where to look. Everything else is up to you:

- **It never posts, signs up, submits a listing, writes a review or contacts anyone.** It has no accounts on these sites and doesn't fill in forms.
- **It doesn't recommend shortcuts.** No fake reviews, no paid placement, no astroturfing (posting as a fake customer, or getting others to pass off your marketing as their own opinion). They break most sites' rules, they're often against the law on advertising, and when they're found out they cost more trust than they win.

If you take part in a community, do it under your own name and say you make the product. [Drafting replies](/guides/drafting-replies) follows each community's self-promotion rules.

## How pages are read

To see whether you and your competitors appear on a cited site, Startica reads some of its pages as the `offsite_check` background job ("Reading pages AI answers cite" on the **System** page).

### When it runs

- **After every AI visibility run that answered at least one question**, including a stopped or capped run.
- **On Read the pages again** on the Off-site screen.

Only one read per product waits at a time: clicking the button while one is waiting or running does nothing more. It isn't retried if it fails. Like every job, it runs only while Startica is open. See [Background jobs](/reference/jobs).

### Which pages

Each read takes the sites in their ranked order, leaves out your own site, and takes:

- **Only pages that are due.** A page that was read, or blocked by `robots.txt`, rests for 7 days, even when you click **Read the pages again**. A page that failed is tried again on the next read.
- **Only addresses that pass the safety rules** below.
- **Up to 3 pages of each site,** its most-cited due pages. So once a site's top pages are resting, the next read takes the ones after them.
- **At most 30 pages** per read, in that order.

### Politeness

The addresses come from AI answers, and the sites belong to other people, so the reads are deliberately slow and small:

- **One page at a time**, with at least 1.5 seconds between requests to the same site.
- **`robots.txt` first.** Before the first page on a site (each scheme and host separately), Startica fetches its `/robots.txt` and follows the rules for `StarticaOffsiteCheck`, or for `*` when there's no group for that name, matched against the page's path and query string. A page the rules disallow isn't requested; it's recorded as blocked. Following [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309): when `robots.txt` doesn't exist (an HTTP 4xx answer), every page is allowed; when it can't be read (a 5xx answer, a timeout or a network error), no page is, and each is recorded as blocked with "Its robots.txt couldn't be read".
- **Identifies itself** with the user agent `StarticaOffsiteCheck/0.1 (+https://mystartica.com; reads pages AI answers cite, for the product's owner)`, so site owners can see what the requests are.
- **Plain GET requests.** No browser, no JavaScript, no cookies, no sign-in, nothing submitted. Each request waits at most 15 seconds, and only the first 1 MB of each page is read.

### Safety rules for addresses from AI answers

An AI answer could cite any address, including one on your own network. Startica requests a page only when its address:

- uses `http://` or `https://`, on the standard ports (80 or 443);
- has no user name or password in it;
- isn't `localhost`, a private network address (`10.…`, `192.168.…`, `172.16.…` to `172.31.…`, `127.…`, `169.254.…`, and local IPv6 addresses), or a reserved name ending in `.example`, `.test`, `.invalid` or `.localhost`;
- has a dot in its host name;
- **resolves only to public addresses.** Before each request, Startica looks the name up in DNS. If any of its addresses is private, local, link-local, shared (carrier NAT, `100.64.…` to `100.127.…`), reserved, for documentation or multicast, in IPv4, IPv6 or IPv4-mapped IPv6, the request isn't sent. This is checked before anything else, `robots.txt` included: such a page is recorded as failed with "Startica doesn't read this address (its name points to a private or reserved address)".

Startica follows redirects itself, at most 5, and checks every hop against these rules, its DNS lookup included, before sending anything to it. A page whose redirect breaks a rule, or that redirects more than 5 times, is recorded as failed.

> [!NOTE]
> One gap remains: the request resolves the name again after the check, so a site that changes its DNS answer between the two (DNS rebinding) could still point a request at a private address. The window is short, and the request is a plain GET with no cookies or credentials.

### What's checked on each page

Startica takes the page's visible text, leaving out scripts, styles and other hidden markup, and looks for:

- **Your product,** by its name and the first part of its website address (`fieldnote` for `https://fieldnote.example`), the same way [AI visibility judges mentions](/seo/ai-visibility#how-each-answer-is-judged): whole words, with or without spaces, ignoring case and punctuation. Names shorter than 3 characters are ignored.
- **Each competitor in Intel,** by name, the same way.

It also keeps the page's `<title>`. Each page ends up in one of three states:

| State | Means |
| --- | --- |
| Read | The page loaded. Startica saved whether it names you and which competitors it names. |
| Blocked by `robots.txt` | The site's `robots.txt` asks `StarticaOffsiteCheck` (or every agent) not to read this page, or couldn't be read. The page wasn't requested. |
| Failed | The page didn't load in 15 seconds, answered with an HTTP error (400 or higher), broke a safety rule (on a redirect or its DNS lookup), redirected more than 5 times, or couldn't be reached. It's tried again on the next read. |

### Privacy

- **These requests go from your computer to those sites.** Unlike AI visibility's web searches, which the AI provider runs on its servers, the page reads come from your computer and your internet connection. Each site sees your IP address and the user agent above, like any visit.
- **Nothing goes to an AI.** The pages are checked with fixed rules on your computer.
- **Results stay on this computer,** in the `offsite_pages` table of your local database: one row per product and page with its address, site, title, state, HTTP status, whether it names you, the competitors it names, any error and when it was read.

See [Privacy and security](/concepts/privacy-security#what-goes-over-the-network).

## The screen

From top to bottom:

- **Filters:** **All**, **Communities**, **Directories and reviews**, **Articles** (articles and blogs, and videos) and **Competitors and you** (competitors' sites and your own). A filter with no sites says "Nothing of this kind cited in the recent answers."
- **Read the pages again** (**Reading pages…** while a read is waiting or running). It queues a read of the cited pages; see [Which pages](#which-pages).
- **Four tiles,** always over all sites, whatever the filter:

  | Tile | What it counts |
  | --- | --- |
  | **Sites cited** | Every site cited in the answers, including yours, "in 36 answers from the last 4 runs". The answers are those that didn't fail. |
  | **Your site cited** | The share of those answers that cite your own site, with "in at least 12 answers", or 0% and "in no answers yet". When answers cite more than one of your host names (`fieldnote.example` and `docs.fieldnote.example`), it counts the most-cited one, so the real share may be higher. Needs the product's website in **Settings → Products**. |
  | **Communities** | The number of community sites cited: "forums and threads answers quote". |
  | **Lists without you** | Directories and articles whose read pages don't name you: "directories and articles you're not on". Sites that haven't been read, or couldn't be, aren't counted, and neither are videos. |

- **A card for each site,** in ranked order, up to 40.
- **A note at the bottom:** "From the citations in the last 4 AI visibility runs. To see whether you and your competitors appear, Startica reads up to 30 of the cited pages after each run (at most 3 per site; a page read once rests for a week, one that failed is tried again), as StarticaOffsiteCheck, following each site's robots.txt. It never posts, signs up or contacts anyone: what you do with a site is up to you."

### Site cards

Each card shows:

- **The site's name**, its kind badge, and where you stand:

  | Shown | Means |
  | --- | --- |
  | **You're there** | At least one of the site's read pages names your product. |
  | **You're not there** | The site's pages that were read don't name your product. Pages that weren't read, or couldn't be, don't count. |
  | "Your own pages" | It's your site. |
  | "Not read yet" | None of its pages were read, and at least one hasn't been tried yet: the read hasn't run, or hasn't reached it. |
  | "Couldn't read it" | None of its pages were read, every one has been tried, and at least one failed. |
  | "Its robots.txt asks not to be read" | None of its pages were read, none failed, and at least one is blocked by `robots.txt` (or its `robots.txt` couldn't be read). |
  | "Startica doesn't read this address" | Every page of the site breaks the [safety rules](#safety-rules-for-addresses-from-ai-answers), for example a reserved name or an unusual port, so none is ever requested. |

- **A sentence of counts,** for example "Cited in 9 answers, 6 of them without mentioning you. Competitors on its pages: TerraJot, Quadrat." The "without mentioning you" part is left out for your own site and when every answer mentioned you; the competitors part appears only when a read page names them.
- **Watch r/…** buttons, one for each cited subreddit you don't watch yet. See [Watch a community](#watch-a-community).
- **The suggestion** for the site. See [What to do about each site](#what-to-do-about-each-site).
- **The page and the questions that cited it** (or "3 pages and the questions that cited it"), which opens:
  - every cited page on the site, most-cited first, as a link that opens in your browser, titled with the page's own `<title>` once it's been read. After each: "2 citations", then "mentions you" or "doesn't mention you" for a page that was read, and "names TerraJot, Quadrat" when it names competitors.
  - **Asked:** the AI visibility questions whose answers cited the site.

## Watch a community

AI answers often quote Reddit threads. When a site's cited pages include threads on `reddit.com` (or a subdomain such as `old.reddit.com`), the card has a **Watch r/…** button for each subreddit you don't already watch, for example **Watch r/ecology**.

Clicking it adds the subreddit to the product's communities with the status **Watching**, with the reason "AI answers cite its threads (SEO & GEO → Off-site)." If the subreddit is already in your communities (suggested or ignored), it's set to **Watching**. The toast says "Watching r/ecology: the Inbox scans it from now on", and the button disappears. Watch is off in the demo ("Changes to communities are off in the demo.").

From then on it's like any community you watch: it's listed on **Intel → Communities**, where you can stop watching it, and the hourly Reddit scan reads it for conversations worth replying to, which arrive in the **Inbox**. See [Finding conversations](/guides/finding-conversations#communities). Watching doesn't post anything or join the subreddit.

Other communities, such as Hacker News or a forum, have no button. Hacker News is searched by keyword already; a Discourse forum can be added by hand in **Intel → Communities**.

## Limits

- **Only what AI answers cited.** The screen knows the sites that appeared in your AI visibility answers, from one model, for your questions, in the last 4 runs. It isn't a list of every site in your category, and it doesn't search the web for mentions of you. Better questions and more runs give a better picture. See the [limits of AI visibility](/seo/ai-visibility#limits).
- **"You're not there" can be wrong.** It's based on the pages Startica could read, at most 3 per site, as plain HTML without JavaScript. Startica can miss you when:
  - a page loads its content with JavaScript, so the HTML it gets doesn't contain the list;
  - a page shows a cookie wall, a sign-in or a bot check instead of its content, but answers with HTTP 200;
  - you're on a page of the site that wasn't cited or wasn't among the 3 read;
  - the page names you in another way, such as only in an image or a spelling far from your product's name.

  And when some of a site's pages were read and others weren't, the state comes from the read pages only. Open the pages before you act.
- **"You're there" is a word match.** A page that mentions you only to say you're a bad fit still counts. Read it.
- **Many sites block unknown readers.** Large communities and directories often disallow every agent but a few in `robots.txt`, or answer with a bot check. Startica follows `robots.txt` (and reads nothing from a site whose `robots.txt` it can't read) and doesn't try to get round bot checks, so those sites show "Its robots.txt asks not to be read" or "Couldn't read it". Open them yourself.
- **Kinds come from a fixed list.** A directory or forum on its own domain is an **Article or blog**, and a competitor needs its website in Intel to be recognized.
- **A week between reads.** A page read or blocked by `robots.txt` in the last 7 days isn't read again, so a change on a site can take a week to show.
- **No history.** The screen shows the current picture, not how a site changed over time, and sites can't be dismissed yet.

## Costs

Off-site presence uses no AI and costs nothing. The page reads are plain requests from your computer. The AI visibility runs it's built on do cost money; see [Costs](/concepts/costs#ai-visibility).

## Troubleshooting

| What you see | What it means and what to do |
| --- | --- |
| **Starts from AI visibility** | No AI visibility run has finished with at least one answer. Add questions and click **Run now** on [AI visibility](/seo/ai-visibility). |
| "Add a product in Settings first." | There's no product yet. Add one in **Settings → Products**. |
| "Not read yet" on every card | The read hasn't run yet, or is waiting. It starts after each AI visibility run; click **Read the pages again**, and check **System → Running and waiting** for "Reading pages AI answers cite". Jobs run only while Startica is open. |
| "Not read yet" stays on one card | None of its pages has been reached: each read takes at most 30 pages, from the sites ranked highest. It gets its turn as the pages ahead of it rest for a week. |
| "Startica doesn't read this address" | The site's addresses break the [safety rules](#safety-rules-for-addresses-from-ai-answers): a reserved name, an unusual port, a user name in the address, or a private network address. Open the page yourself. |
| "Its robots.txt asks not to be read" | The site's `robots.txt` disallows the page for `StarticaOffsiteCheck` or for every agent, or couldn't be read (a server error or a timeout). Startica won't read the page; a disallowed page is checked again after a week. Open it yourself. |
| "Couldn't read it" | The page timed out, answered with an error, redirected somewhere Startica won't go (or more than 5 times), resolved to a private address, or couldn't be reached. It's tried again on the next read. |
| **You're not there**, but you are | See [Limits](#limits): the page may need JavaScript, show a wall to unknown readers, or list you on a page that wasn't read. |
| **Read the pages again** shows **Reading pages…** and does nothing more | A read for the product is waiting or running. It can take several minutes: one page at a time, with pauses per site. |
| Clicking **Read the pages again** changes nothing | Every page it would read was read or blocked by `robots.txt` in the last 7 days, or failed again. |
| A site is an **Article or blog** but it's a directory or forum | It isn't on Startica's list of known sites. The suggestion still applies if it's a list or review. |
| A competitor's site shows as **Article or blog** | Add the competitor's website in Intel. |
| "Reading other sites is off in the demo, like every other outside call." | You're in the [demo](/guides/demo-mode). |
| "Changes to communities are off in the demo." | **Watch** is refused in the [demo](/guides/demo-mode). |

## In the demo

In [demo mode](/guides/demo-mode), Off-site presence is built from the four sample AI visibility runs. Their answers cite three sites: `fieldnote.example` (Fieldnote's own site, with its offline-notes page), `reviews.example` (a "best field notebook apps" list) and `reddit.example` (threads titled "What do you use for field notes? : r/ecology"). The demo's sample page reads say the review list names TerraJot and Quadrat but not Fieldnote, so that site shows **You're not there**, and that some of the threads mention Fieldnote or Logbook Pro.

The demo uses reserved `.example` names, which no real site can have, so `reddit.example` isn't recognized as Reddit: it shows as an **Article or blog**, the **Communities** tile is 0, and there's no **Watch** button. Outside calls are off, so **Read the pages again** is disabled ("Off in the demo") and no pages are requested.

## Related

- [SEO & GEO](/seo)
- [AI visibility](/seo/ai-visibility): the runs whose citations this is built from
- [Opportunities](/seo/opportunities#get-listed-on-a-page-ai-answers-cite): comparison and "best of" pages cited in answers that didn't mention you
- [Finding conversations](/guides/finding-conversations#communities): watched communities and the Inbox
- [Drafting replies](/guides/drafting-replies)
- [Background jobs](/reference/jobs)
- [Privacy and security](/concepts/privacy-security#what-goes-over-the-network)
