---
title: Competitor benchmarks
description: Track competitors' public Bluesky, Mastodon, Reddit and Hacker News accounts next to your own, and see who posts more, grows faster and gets more engagement.
layout: doc
---

**Intel → Benchmarks** compares your own social accounts with your competitors' on the same channels: followers and how they grow, how often each account posts, and how much each post gets back. Startica reads public numbers once a day, without signing in anywhere, and writes a few plain observations when the gap is big enough to mean something.

## Add accounts

1. Open **Intel** and choose the **Benchmarks** tab.
2. Click **Add an account**.
3. Under **Whose account**, pick a competitor from your Intel list, or **Yours** for your own account.
4. Pick the channel and paste the handle or the profile link.

| Channel | Handle | What Startica reads |
| --- | --- | --- |
| Bluesky | `name.bsky.social` or a custom domain like `fieldnote.example`, or a `bsky.app/profile/...` link | Followers, total posts, posts in the last 7 days, average engagement |
| Mastodon | `@name@server.example`, or a profile link on the account's server | Followers, total posts, posts in the last 7 days, average engagement |
| Reddit user | `u/name` or a `reddit.com/user/...` link | Posts and comments in the last 7 days only |
| Hacker News user | The username, or a `news.ycombinator.com/user?id=...` link | Karma, total stories and comments, items in the last 7 days, average engagement on stories |

Startica reads a new account right away, in the background. Add your own account on each channel you add competitors on: observations compare with it, and a channel with only competitors just says "Add your own account to compare".

> [!NOTE]
> **X isn't included.** Startica doesn't look up accounts on X (its API charges per read and the X search in Startica is limited to keywords). You won't find X in the channel list.

### What the numbers mean

- **Posts, last 7 days** counts the account's own posts in the latest page of its feed (up to 50 on Bluesky, 40 on Mastodon, 50 on Hacker News, 100 on Reddit), not reposts or boosts of other people's posts. Bluesky counts top-level posts; Mastodon, Reddit and Hacker News count replies and comments too.
- **Average engagement** is the average likes, reposts, quotes and replies on the account's 20 most recent top-level posts (Bluesky, Mastodon), or points plus comments on its 20 most recent stories (Hacker News; comments have no public points). Reddit's public feed has no votes, so Reddit shows posting frequency only, with no followers, karma or engagement.
- **Followers, 4 weeks** is the change between the latest check and the oldest one within the 28 days before it. It needs at least a week of checks.

## Read the comparison

Each channel has a chart with one line per account. Switch it between followers (karma on Hacker News), posts in the last 7 days and average engagement. **Show as table** under the chart lists every day's numbers. The table below it has each account's latest numbers, when it was last checked, and the error if it couldn't be read.

The observations at the top are rules, not AI. They compare each competitor with your own account on the same channel and appear when:

| Rule | Example |
| --- | --- |
| One side posts at least twice as often (and at least 3 times a week) | "TerraJot posts 3× more often than you on Bluesky (12 vs 4 posts in the last 7 days)." |
| One side's followers grow at least twice as fast, gaining at least 20 | "Quadrat gained 371 followers on Bluesky in 4 weeks (+33%); you gained 60 (+15%)." |
| One side's average engagement is at least 1.5 times the other's (and at least 3) | "Quadrat's Bluesky posts get 2.2× the engagement of yours." |

The six strongest are shown.

## When checks happen

The `competitor_sync` job reads every account once a day (or as often as **Intel → Following → Settings** says) and when you click **Check now**. It waits a moment between accounts, and Reddit's public feeds allow about one request a minute, so a check with several Reddit accounts takes a few minutes. Each account is read on its own: if one fails (a renamed handle, a server that's down), the error shows next to that account and the others still update. A second check on the same day replaces that day's numbers. See [Background jobs](/reference/jobs).

Requests go to `public.api.bsky.app` (Bluesky), the account's own Mastodon server, `hn.algolia.com` (Hacker News) and `www.reddit.com` (the user's public feed). Nothing is posted and no account is needed. The same read also keeps each competitor account's recent posts for its [activity feed](/guides/competitor-watch#activity), with no extra requests.

## Intel rebuilds keep tracked competitors

Rebuilding intel replaces the competitors the AI wrote, except the ones with tracked accounts, followed people or an [in-depth profile](/guides/competitor-watch): those are kept, with their accounts and history, as if you had added them yourself. The AI is told about them so it doesn't add them twice. Deleting a competitor deletes its tracked accounts and their history too.

## In the demo

The [demo](/guides/demo-mode) has Fieldnote's own accounts and two competitors' (TerraJot and Quadrat) with five weeks of history, all on made-up handles. **Check now** is off in the demo because it makes no requests.

## Related

- [Competitor research and following](/guides/competitor-watch): a competitor's profile, its people and blog, and what they post

- [Analytics](/guides/analytics)
- [Background jobs](/reference/jobs)
