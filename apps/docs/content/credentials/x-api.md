---
title: X API (optional, paid)
description: Add your own X API bearer token so Startica can find X posts, read pasted X links and check replies on your X posts, with a daily read cap that keeps the bill small.
layout: doc
---

Without any setup, X is paste-only in Startica: you paste an X link and the post's text, and Startica drafts a reply. If you add your own X API bearer token, Startica also:

- finds X posts that match your top 3 listening keywords,
- reads pasted X links by itself, so you don't need to paste the text,
- checks likes and replies on X posts you saved with a link.

X's API is paid per post read, and the bill goes to your X developer account, not to Startica. Startica rations its reads so the cost stays small and predictable. Everything else in Startica works the same without a token.

## What it costs

X bills each post the API returns. Startica estimates **about $0.005 per post read**, X's pay-per-use rate when this was built. X sets and changes its prices, so check the current rate in the X developer console. X's bill is always the authority.

| What uses reads | Reads |
| --- | --- |
| One search | One read per post returned (at least 10, at most 50, never more than what's left today) |
| A pasted X link | 1 |
| One engagement check on an X post you saved with a link | 1 |

Engagement checks run every 6 hours for two weeks after posting, so one tracked X post can use up to 56 reads (about $0.28) over that time, if the daily cap leaves room.

The **daily read cap** (default 100 reads, about $0.50 a day) covers all three. With the defaults, the most X can cost you is about $15 a month. Startica's monthly AI budget doesn't include X reads; the only limit on X spend is this cap and whatever you set in X's console.

> [!NOTE]
> Posts that X finds are scored by the AI like any other conversation, and the ones that qualify get a drafted reply. That AI cost comes from your monthly AI budget as usual. See [Costs](/concepts/costs).

## Get a bearer token

You need an X developer account with credits. The steps below follow what Startica's dialog asks for; X's console changes its labels from time to time.

1. Go to [console.x.com](https://console.x.com) and sign in with your X account. Accept the developer terms if X asks.
2. Create an app (X may call it a project and app).
3. Add credits to your developer account. Searches fail without them (the Settings card then shows "Last X request failed: No X API credits left.").
4. In the app's keys and tokens, generate the **Bearer Token** and copy it. X shows it only once; if you lose it, generate a new one.

Startica only reads with the token (recent search and post lookup). It never posts through the X API. Posting to X goes through X's own composer in the [posting window](/guides/assisted-posting).

## Enter it in Startica

1. Open **Settings** and find the card **X API (optional, paid)**.
2. Click **Add token**. The **X API** dialog opens.
3. Fill in the fields and save.

| Field | What to enter | Default | Limits |
| --- | --- | --- | --- |
| **Bearer token** | The token from X. Once one is saved, the label reads "Bearer token (leave blank to keep the saved one)". | (none) | |
| **Most post reads per day** | The daily read cap | 100 | 10 to 10,000. Below 10: "At least 10 (X returns at least 10 per search)" |
| **Scan X at most every … hours** | The shortest time between two X searches | 6 | 1 to 168 |

The token is stored encrypted on your computer and sent only to `api.x.com`. The card then shows "Token: saved" and how many reads were used today, for example "Reads today (UTC): 35 of 100." The card's description repeats your limits and the estimated cost per day at the cap.

The next hourly scan searches X. You don't need to do anything else; X posts appear in the Inbox like any other conversation.

## How Startica rations reads

| Rule | What it does |
| --- | --- |
| One search for the top 3 keywords | Your first 3 listening keywords are joined into one search (phrases in quotes, reposts excluded), instead of one search each. |
| At most every _n_ hours | A product's X search runs at most once per **Scan X at most every … hours**, even though the listening scan runs hourly. |
| Continue where it left off | The first search looks back 26 hours. Later searches ask only for posts newer than the newest one already found. |
| No author lookups | Looking up each post's author would roughly double the cost, so X posts show no author and link as `x.com/i/status/<id>`. The link opens the post normally. |
| Daily read cap | Searches ask for no more posts than are left today. With fewer than 10 reads left (X's minimum per search), the search is skipped. Pasted links and engagement checks stop at the cap too. |
| UTC days | The cap resets at midnight UTC, X's billing day, not your local midnight. |

Each product's set of top 3 keywords keeps its own schedule. If you change those keywords, the next search starts fresh with a 26-hour look-back.

> [!NOTE]
> A search returns at most 50 posts (fewer if fewer reads are left today). If more posts matched since the last search, the newest are taken and the older ones skipped, not fetched later. That's on purpose: fresh conversations are the ones worth joining. Specific keywords keep each search small and complete.

Every post a search returns is stored and scored: 50 is below the scan's limit of 60 new conversations per source, so no paid read is dropped. See [Finding conversations](/guides/finding-conversations#limits-per-scan).

## When a search fails

An X error doesn't stop the scan. The other sources are read and scored as usual, X is tried again at the next scan, and the **X API** card in **Settings** shows the error in red until a search succeeds:

| The card says | What happened | What to do |
| --- | --- | --- |
| "Last X request failed: No X API credits left." | Your X developer account is out of credits (HTTP 402). | Add credits in X's console. |
| "Last X request failed: X refused the token (revoked or without access)." | The token was revoked or regenerated, or the app has no access to search (HTTP 401 or 403). | Generate a new bearer token and save it with **Change**. |
| "Last X request failed: X rate limit; Startica tries again next scan." | X's rate limit (HTTP 429). | Nothing; it clears on the next successful search. |

Any other error shows its own message after "Last X request failed:". The same line also reports errors from reading a pasted X link and from checking replies on your X posts, not only from searches.

## Change the limits

Click **Change** on the card. Leave **Bearer token** blank to keep the saved token, adjust the two numbers and save. A lower cap takes effect right away, including for today.

## Remove the token

Click **Remove** on the card, then **Remove** in the confirmation ("Remove the X API token?"). The saved token is deleted. Startica stops reading X; pasting X links with their text keeps working. Your limits and today's read count stay saved for next time.

To stop the token working everywhere, also delete or regenerate it in X's console.

## When you run from source

Development uses the same Settings as the installed app. There's no environment variable for the token: save it on the **X API (optional, paid)** card.

## Where it's stored

| Value | Storage |
| --- | --- |
| Bearer token | Secret `x_api_bearer_token`, encrypted |
| Daily cap and scan interval | Plain, `settings` table key `x_api` |
| Reads used today | Plain, `settings` table key `x_api_usage` |
| Each search's last run and newest post id | Plain, `settings` table keys starting with `x_api_state:` |
| The last search error, if the last search failed | Plain, `settings` table key `x_api_error` |

## Related

- [Finding conversations](/guides/finding-conversations#x-with-your-own-api-token)
- [Manual channels](/guides/manual-channels)
- [Settings](/reference/settings#x-api)
- [Privacy and security](/concepts/privacy-security)
