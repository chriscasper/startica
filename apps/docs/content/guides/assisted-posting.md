---
title: Posting with Startica (beta)
description: Post Inbox replies and Content Studio pieces to X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse from a Startica window that fills them in for you. You press the site's own button; Startica saves the link.
layout: doc
---

**Post…** opens the thread or the site's new-post form in a Startica window, with your reply (or your post's title and text) already filled in. You read it on the real page, edit it if you like, and press the site's own button. Startica sees that the post went through, saves its link and marks it as posted. It saves you the copy, the paste and the **Mark as posted** step.

Startica never presses the button that sends your post. It doesn't click it, press Enter or submit the form in any other way. On some sites it clicks the button that only *opens* a reply box (for example a comment's **reply** link), never the one that sends. Nothing is posted until you press the site's button yourself.

> [!WARNING]
> Posting with Startica is in beta. It has been tested end to end only against local stand-ins that imitate each site, not yet against the live sites with real signed-in accounts. The first real post on each site is the real test. If something doesn't work, the fallbacks below get you to the same result, and **Copy & open thread** and **Mark as posted** still work as before. Please report what you see in [GitHub Discussions](https://github.com/chriscasper/startica/discussions).

## Where it works

| Channel | Inbox replies | Content Studio pieces |
| --- | --- | --- |
| X | Yes, for links to a single post (`x.com/<user>/status/<id>`) | Yes, single posts |
| Hacker News | Yes | Yes |
| Reddit | Yes, to a post or to a comment | Yes |
| LinkedIn | Yes, for links to a post (`linkedin.com/feed/update/…` or `linkedin.com/posts/…`). Read [LinkedIn and its terms](#linkedin-and-its-terms) first. | Yes |
| Bluesky | Yes | Yes, single posts |
| Mastodon | Yes, once your Mastodon server is set in Settings | Yes, single posts, once your server is set |
| Discourse | Yes, to a topic or to a post in it | Yes, as a new topic in the product's first watched forum |
| Facebook, other sites | No: copy only | No: copy only |
| Blog, Newsletter, Email, Other (Content Studio) | | No: copy only |

**Post…** is only in the desktop app. In browser mode (`yarn dev:desktop-web`) it's hidden, and you copy and post by hand.

In Content Studio, the piece's channel decides which site **Post…** opens. A piece written for Bluesky opens Bluesky.

### When the Post button is hidden

**Post…** only appears when Startica can build the posting page for that item. It's hidden when:

| Reason | Applies to |
| --- | --- |
| The item is a thread (Content Studio format **Thread**) | X, Bluesky, Mastodon |
| The text is over the site's limit: 4,000 characters on X, 3,000 on LinkedIn, 500 on Mastodon (for a reply, including the `@author ` mention), 300 on Bluesky | Replies and pieces |
| No Mastodon server is set in **Settings → Channels → Posting** | Mastodon replies and pieces |
| The product has no watched Discourse forum | Discourse pieces (new topics) |
| The link isn't one Startica can open for posting (for example an X or LinkedIn profile link instead of a post link) | Inbox replies |

Longer text is never cut. Copy it instead, and post it by hand (or split it yourself).

Hacker News, Reddit and Discourse posts from Content Studio also need a title. **Post…** stays visible when the **Title** field is empty; clicking it then says "Add a title first: this channel's posts need one" and opens nothing.

## Post a reply or a piece

1. In the **Inbox**, open **To review** and get the draft right. In **Content Studio**, open the piece in the **Library**.
2. Click **Post…** (next to **Copy & open thread** in the Inbox, or **Copy** in Content Studio). Unsaved edits are saved first.
3. A **Post with Startica** window opens: a Startica bar at the top, and the site's real page below it.
4. Startica fills in the reply, or the title and text of a new post. The bar says what to check and names the button to press, for example "Check your reply, edit it if you like, then press “Comment” on the page. Startica never posts for you."
5. Read it on the page. Edit it there if you want to.
6. Press the site's own button.
7. The bar shows "Posted. Saving it to Startica…", then one of these, and the window closes on its own:

| Site | The bar says |
| --- | --- |
| Reddit, Hacker News, Bluesky, Mastodon, Discourse, and X when an [X API token](/credentials/x-api) is set | "Saved to Startica. Replies to it will be tracked for two weeks." |
| LinkedIn, and X without a token | "Saved to Startica." |
| Discourse, when the forum holds the post for a moderator | "Saved to Startica. The forum shows it once a moderator approves it; add its link in Startica then." |

In Startica, the Inbox card moves to **Posted**, or the piece shows as posted in the Content Studio **Library**, with the link to your post. From there it's the same as **Mark as posted** with a link: see [Engagement tracking](/guides/drafting-replies#engagement-tracking).

> [!NOTE]
> Startica saves the text you actually posted. If you edit the reply in the site's box before pressing its button, the edited version is what Startica records, on the Inbox card and as the Content Studio piece's text.

Only one posting window is open at a time. Clicking **Post…** on another card replaces it. Closing the window without posting records nothing.

## What each site opens

| Site | Reply | New post | Button you press |
| --- | --- | --- | --- |
| X | X's official post composer (`x.com/intent/tweet`) as a reply to that post, with your text in it | The same composer, with your text | **Reply** or **Post** |
| Hacker News | The item's page; the reply goes in its reply box | `news.ycombinator.com/submit`, with the title and the text (or the link, if the piece is only a link) | **reply** or **submit** |
| Reddit | The thread on `old.reddit.com`; the reply goes in the comment box, or in the reply box under the comment you're answering | `old.reddit.com/submit` as a text post, with the title and text. You pick the subreddit there. | **save** or **submit** |
| LinkedIn | The post's page; your reply is typed into its comment box | LinkedIn's own composer, opened with your text (`linkedin.com/feed/?shareActive=true`) | **Comment** or **Post** |
| Bluesky | The post's page; Startica opens its reply composer and types your reply in | Bluesky's official compose link (`bsky.app/intent/compose`), with your text | **Reply** or **Post** |
| Mastodon | The post, opened on **your own server**; Startica opens its reply box, which starts with an "@author " mention, and adds your reply after it | Your server's share page (`https://<your server>/share`), with your text | **Reply** or **Post** |
| Discourse | The topic or post; Startica clicks the topic's (or that post's) **Reply** button to open the composer and fills it in | The forum's new-topic page (`<forum>/new-topic`), with the title and text. You pick the category there. | **Reply** or **Create Topic** |

Reddit opens on old.reddit.com because its forms are simple and stable. Your post appears on the normal Reddit site as usual, and Startica saves a `www.reddit.com` link.

The button names in the table are what the bar tells you to press. A site may label its button slightly differently.

### Rich-text editors

LinkedIn, Bluesky and Discourse's rich editing mode use rich-text editors that ignore text set by a script. For those, Startica focuses the box and types your text in as real keyboard input. It still never presses the button. If the box already has text in it (for example because the site's own link pre-filled it), Startica leaves it as it is.

### Set your Mastodon server

Mastodon replies and posts go out from your own account on your own server, wherever the post you're replying to lives.

1. Open **Settings**, find the **Posting** card and click **Edit**.
2. In **Your Mastodon server**, enter your server, for example `mastodon.social`. You can also paste your handle (`you@mastodon.social`) or the server's address; Startica keeps just the server name.
3. Save. The card shows "Mastodon server: mastodon.social."

Until it's set, the card says "Mastodon server: not set (Post… stays hidden for Mastodon)." Anything that isn't a server name gets "Enter your server's address, e.g. mastodon.social". Leave it empty to turn Mastodon posting off again.

For a reply, the window opens the post on your server (through Mastodon's own `authorize_interaction` page), and Startica opens its reply box. Mastodon starts the reply with an "@author " mention, and Startica keeps it in front of your text. The 500-character check counts the mention too (`@` plus the author's handle and a space), so a reply that fits the check fits on the server.

Startica uses Mastodon's default limit of 500 characters, even if your server allows more.

### Discourse forums and moderation

- **Replies** work for any Discourse topic or post link in the Inbox. A topic link replies to the topic; a link to a post inside it (ending in a post number) replies to that post.
- **New topics** from Content Studio go to the product's **first watched Discourse forum** (the one you added first on the **Intel** page). There's no forum picker yet. Without a watched forum, **Post…** is hidden for Discourse pieces.
- **Titles.** Content Studio shows a **Title** field for Discourse pieces. Fill it in before posting.
- **Categories.** On the new-topic page, you pick the category. Startica doesn't.
- **Held for approval.** Many forums hold posts from new members for a moderator. Startica still records the post, without a link, and the bar says to add the link once it's approved. Then use **Add link**: on the posted card in the Inbox's **Posted** tab, or on the posted piece in Content Studio. Replies are tracked from then on.

## LinkedIn and its terms

> [!WARNING]
> LinkedIn is the riskiest site to use **Post…** on. LinkedIn's User Agreement prohibits using "bots or other unauthorized automated methods" to comment on posts, and its help pages prohibit browser extensions that "automate activity". Filling in a box that you then submit yourself isn't addressed either way, and LinkedIn enforces its rules more actively than the other sites. Startica opens LinkedIn's own share link for new posts and types your comment into the comment box; you press the button. Whether that's acceptable for your account is your call. If you'd rather not take the risk, use **Copy & open thread** for LinkedIn.

## Sign in once per site

The first time you post to a site, you're probably not signed in to it in the posting window. The bar says "Sign in on this page first (Startica remembers it), then click Fill in again."

1. Sign in on the page as you normally would. Sign-in pages from Google, Apple, GitHub, GitLab, Discord and Microsoft are allowed in the window, for sites that offer them.
2. Click **Fill in again** in the bar. Startica goes back to the right page and fills it in.

You sign in to each site once. For Mastodon that's your own server; for Discourse it's each forum. The posting window keeps its own sign-ins between launches, separate from your normal browser and from the app's main window. Startica never sees your password: you type it into the site's own page, and Startica doesn't read or store it. To sign out, see [Data folder](/reference/data-folder#posting-sign-ins).

Some Discourse forums sign you in through another site. Sign-in with Google, Apple, GitHub, GitLab, Discord or Microsoft works in the window. A forum with its own single sign-on elsewhere (for example a company login) opens that page in your normal browser, so the sign-in can't finish in the window. Use the forum's own username and password if it has them, or use the fallbacks: copy and post by hand, then **Mark as posted**.

## The bar

| Button | What it does |
| --- | --- |
| **Fill in again** | Goes back to the page Startica opened and fills it in again. Use it after signing in, or if the box got cleared. |
| **Copy text** | Copies the reply or post text to your clipboard, to paste by hand. |
| **Save link…** | Shows a **Link to your post** field. Paste the full link to what you posted and click **Save**. Use it when Startica posted fine but couldn't find the link. Anything that isn't a full `https://` address gets "That doesn't look like a link. Paste the full address, starting with https://". |
| **Close** | Closes the window. Nothing is recorded unless the post was already saved. |

## When something goes wrong

| The bar says | What happened | What to do |
| --- | --- | --- |
| "Sign in on this page first (Startica remembers it), then click Fill in again." | You're not signed in to the site in the posting window. | Sign in on the page, then click **Fill in again**. |
| "Couldn't find where to fill it in. The text is on your clipboard: paste it, then press …" | The box wasn't where Startica expected: the site changed its layout, a CAPTCHA or interstitial is in the way, or the thread is locked. | Paste the text into the box yourself and press the button. Startica still saves the link if it can. |
| "Did it post? Paste the link to it to save it in Startica." | You pressed the button, but Startica couldn't find the new post's link, or the site refused the post (Hacker News answers "You're posting too fast" when you post often). | If it posted, copy the link from the site, paste it into **Link to your post** and click **Save**. If it didn't post, wait and try again, or close the window. |
| "Posted, but Startica couldn't save it: … Mark it as posted in Startica." | The post went through but Startica couldn't record it. | Close the window and use **Mark as posted** (Inbox) or **Mark posted** (Content Studio), with the link. |

**Mark as posted** always works, with or without the posting window. If you already marked a reply as posted while its posting window was open, Startica only adds the link if it was missing.

More fixes are in [Troubleshooting](/troubleshooting#posting-with-startica).

## Privacy and safety

- **No AI in the browser.** Filling in is a fixed script per site that puts your text in a known box. No AI looks at or drives the page, and nothing from the page is sent to the AI. Text on a page can't instruct Startica to do anything, and posting costs nothing.
- **You always submit.** Startica fills in and you press the button. It has no "post for me", scheduling or bulk posting, and won't.
- **Separated from Startica.** The site in the window has no access to your files, to Startica's local server or to its launch token. Only the Startica bar above it can talk to the app, and it can only ask for the four things its buttons do.
- **Only the site.** The window shows only the site you're posting to (that exact host or its subdomains; for Mastodon your own server, for Discourse that forum), plus the Google, Apple, GitHub, GitLab, Discord and Microsoft sign-in pages, which follow the same rules and can't open further windows. Any other link opens in your normal browser. Requests for your camera, microphone, location or notifications are refused.
- **Only your own post.** Startica doesn't read pages through the posting window. It only looks at the request the site's button sends and the site's answer to it, to find the new post's link. On Bluesky it checks that the request creates a post, so a like or follow on the same page isn't mistaken for your post. It doesn't read your feed, messages or other pages.
- **A normal browser to the site.** The window identifies itself as plain Chrome, without Electron or Startica in its user agent, because some sign-in pages refuse embedded browsers.

See [Privacy and security](/concepts/privacy-security#the-posting-window) for the details.

## Current limits

- **Beta, tested only against stand-ins.** The desktop smoke test posts a reply on a local stand-in for each of the seven sites, plus three new posts from Content Studio: a Hacker News post, a Bluesky post, and a Discourse topic that the forum holds for approval (saved as posted without a link). Nothing has been tried yet against the live sites with real accounts. When a site changes its pages, filling in or link detection can break until Startica is updated; the fallbacks still work.
- **Seven sites.** X, Hacker News, Reddit, LinkedIn, Bluesky, Mastodon and Discourse. Facebook is unlikely.
- **No threads on X, Bluesky or Mastodon**, and nothing over the site's limit (X 4,000 characters, LinkedIn 3,000, Mastodon 500, Bluesky 300). Copy those and post by hand.
- **Inbox replies need a post link.** X links like `x.com/<user>/status/<id>` and LinkedIn links like `linkedin.com/feed/update/…` or `linkedin.com/posts/…`. Other links hide **Post…**; copy and open them instead.
- **Mastodon needs your server** in **Settings → Channels → Posting**.
- **Discourse new topics go to the first watched forum** only, and need a title. Posts held for moderation are saved without a link until you add it with **Add link**.
- **Titles for new posts.** Hacker News, Reddit and Discourse posts from Content Studio need a title in the piece's **Title** field before **Post…** works.
- **No engagement tracking on LinkedIn**, and on X only with an [X API token](/credentials/x-api) (each check is one paid read). Visits still show in Analytics through the tracking link on every site.
- **Desktop app only**, and only while Startica is running.
