---
title: Hand-off
description: The files Startica makes for Google Ads Editor, Meta Ads Manager and Reddit Ads, what's in them, and the steps to import, review and launch a campaign yourself.
layout: doc
---

Startica doesn't touch your ad account. When a plan is ready, the campaign page shows a **Hand off** card with the steps for the platform and the files to download. You import or paste them into the platform's own tool, review them there, and launch when you're ready to spend. This page covers each platform's files and steps, and how the daily budget in the files is worked out.

To plan a campaign first, see [Ads](/ads).

## The Hand off card

The card appears at the bottom of the campaign page once the campaign has at least one ad group and isn't being planned. It has:

- a count of problems found by the [checks](/ads#checks), if any: errors to fix first, or warnings worth a look;
- the numbered steps for the platform (below);
- the downloads and **Copy the brief**;
- a note on the [tracking links](/ads#tracking-links) and the date the platforms' limits were last checked.

| Platform | Files |
| --- | --- |
| Google Ads | **Google Ads Editor file** and **Campaign brief (Markdown)** |
| Meta | **Meta bulk import file** and **Campaign brief (Markdown)** |
| Reddit | **Campaign brief (Markdown)** only: Reddit Ads has no import |

File names start with the campaign's current name in lowercase with dashes, for example `search-offline-field-notes-google-ads-editor.csv`, `search-offline-field-notes-meta-import.csv` and `search-offline-field-notes-brief.md`.

> [!WARNING]
> Google and Meta files import everything **paused**, so importing alone never spends money. Spending starts when you enable or publish the campaign in the platform. Reddit has no file: nothing exists in Reddit Ads until you create it, and it spends once you launch it.

Fix any errors before you download. Startica doesn't stop you, but the platform will reject those ads.

## Google Ads

### Steps

1. Install Google Ads Editor and sign in to your Google Ads account.
2. Account → Import → From file, and choose the downloaded file. Review the changes, then Keep.
3. Check the campaign's settings, set up conversion tracking for your goal if it isn't already, and post the changes.
4. The campaign imports paused. Enable it in Google Ads when you're ready to spend.

### The Google Ads Editor file

The file is in the format Google Ads Editor documents for imports: **tab-separated** values, encoded as **UTF-16** (little-endian, with a byte order mark), which is what Excel calls "Unicode Text". It has a `.csv` extension, but it isn't comma-separated, so a text editor or spreadsheet app may show it oddly. Import it into Editor as it is; don't open and re-save it.

It has one row per item:

| Row | What it sets |
| --- | --- |
| The campaign | **Campaign** (the campaign's name), **Campaign Type** `Search`, **Networks** `Google search`, **Budget** (the [daily budget](#daily-budget)), **Budget type** `Daily`, **Bid Strategy Type** and **Campaign Status** `Paused` |
| One per location | **Location**, from all the groups' locations, set on the campaign |
| One per ad group | **Ad Group** and **Ad Group Status** `Paused` |
| One per keyword | **Keyword** and **Criterion Type** `Broad`, `Phrase` or `Exact` |
| One per negative keyword | **Keyword** and **Criterion Type** `Negative Broad`, on the ad group |
| One per ad | **Ad type** `Responsive search ad`, **Headline 1** to **Headline 15**, **Description 1** to **Description 4**, **Path 1**, **Path 2**, **Final URL** (the tagged link) and **Status** `Paused` |

**Bid Strategy Type** is `Maximize conversions` when the plan's bidding text mentions conversions, and `Maximize clicks` otherwise. Check it in Editor against the plan's **Bidding**. A max CPC limit, if the plan suggests one, isn't in the file; set it in Editor.

Editor matches column headers ignoring upper and lower case and spaces.

> [!NOTE]
> The responsive search ad columns (**Headline 1** to **Headline 15**, **Description 1** to **Description 4**) aren't in Google's published column reference. If Editor reports a problem with one of them, export a responsive search ad from Editor and compare its column names with the file's.

## Meta

### Steps

1. In Ads Manager, open the menu next to Create and choose Import ads in bulk (or Export & import → Import).
2. Choose the CSV and review the campaigns, ad sets and ads it creates.
3. Add an image to each ad: download them from the campaign's Creatives page (4:5 for the feed, 9:16 for Stories and Reels).
4. Everything imports paused. Publish it in Ads Manager when you're ready to spend.

For step 3, download the images from the campaign's [Creatives](/ads/creatives) tab: the 4:5 or 1:1 size for the feed, and the 9:16 for Stories and Reels.

### The Meta bulk import file

A comma-separated file in UTF-8, in the columns of Ads Manager's bulk import, with one row per ad. Each row carries its campaign and ad set:

| Column | Value |
| --- | --- |
| **Campaign Name** | The campaign's name |
| **Campaign Status** | `PAUSED` |
| **Campaign Objective** | From the goal: `Outcome Sales` if it mentions a sale, purchase or buying; `Outcome Leads` if it mentions leads, signups, a trial or registering; otherwise `Outcome Traffic` |
| **Buying Type** | `AUCTION` |
| **Ad Set Name** | The ad group's name |
| **Ad Set Run Status** | `PAUSED` |
| **Ad Set Daily Budget** | The [daily budget](#daily-budget) divided evenly between the ad groups |
| **Countries** | The group's locations, comma-separated |
| **Ad Name** | The group's name and the ad's number, for example "Field researchers 2" |
| **Ad Status** | `PAUSED` |
| **Title** | The ad's headline |
| **Body** | The primary text |
| **Link Description** | The description |
| **Link** | The tagged link |
| **Call to Action** | The call to action, such as `LEARN_MORE` or `SIGN_UP` |

The file has no images. Add one to each ad in Ads Manager after the import, or the ads can't run.

The audience, interests and placements aren't in the file either. Set them on each ad set in Ads Manager, from the brief. Check the countries too: Locations are written as you entered them, and Ads Manager may want them in its own form.

## Reddit

Reddit Ads has no bulk import, so there's no file. Use the **Campaign brief** instead: download it or click **Copy the brief**, and paste from it.

### Steps

1. In Reddit Ads Manager, create a campaign with the objective that matches your goal.
2. Create one ad group per group below: set the communities, interests, locations and budget.
3. Create the ads: paste each headline, body and call to action, with its link (already tagged for analytics).
4. Review, then launch when you're ready to spend.

Reddit's promoted posts can carry an image; add it in Reddit Ads Manager. The 4:5 and 1:1 sizes from the [Creatives](/ads/creatives) tab fit Reddit's feed.

## The campaign brief

The brief is a Markdown file with every value you need to set the campaign up by hand, on any platform:

- the campaign's name, platform and format, goal and landing page;
- bidding, the daily budget (and the test it comes from), the success metric and the plan's summary;
- for each ad group: its name, angle and targeting (audience, keywords in `[exact]` / `"phrase"` / broad notation, negative keywords, communities as `r/name`, interests, placements, locations);
- for each ad: every headline, description, display path, body, primary text and call to action, and its tagged link.

**Copy the brief** puts the same text on the clipboard. For Google and Meta, it's a useful checklist next to the import, and it's the place to find what the import files don't carry.

## Daily budget

The files and the brief give a daily budget, worked out from the plan:

- **With a test budget and test days:** test budget ÷ test days. A 210 test over 21 days is 10.00 a day.
- **Without a test yet:** monthly budget ÷ 30.4. A monthly budget of 300 is 9.87 a day.

It's rounded to the cent and is never less than 1. The campaign page shows the same figure under **Test** ("About 10.00 a day"). In the Meta file it's split evenly across the ad sets: with two groups, 5.00 each.

Budgets are in your ad account's currency. Startica doesn't convert currencies.

## After you launch

Set the campaign's status in Startica to **Handed off** once it's in the ad manager, and **Running** once it's live, so the list shows where each one is. See [Statuses](/ads#statuses). Only campaigns with those statuses put suggestions on [Today](/ads/results#on-today-and-the-roadmap).

Then enter spend from the ad manager on the campaign's [Results](/ads/results) tab, weekly is plenty, to see what each ad costs per result and which to scale, keep, rewrite or stop. If you change ads in the ad manager, Startica doesn't see it; edit them in Startica too if you want the two to match.

## Related

- [Ads](/ads)
- [Creatives](/ads/creatives)
- [Results and what to do next](/ads/results)
- [Limits and checks](/ads/limits)
- [Analytics](/guides/analytics)
