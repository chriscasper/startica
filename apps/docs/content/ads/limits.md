---
title: Limits and checks
description: Every ad field Startica writes for Google Ads, Meta and Reddit, with its limit and recommended length, the calls to action, and every check with its level.
layout: doc
---

This page lists what Startica knows about each ad platform: the fields it writes, their character limits and recommended lengths, the calls to action, and every check it runs on an ad. For how the checks show up on a campaign, see [Checks](/ads#checks).

The limits were last checked against the platforms' help pages on **2026-10-10**. The campaign page's **Hand off** card shows the same date. Platforms change their limits; their own ad managers have the last word.

## Fields and limits

The **limit** is a hard limit: the platform rejects longer text, and Startica flags it as an error. The **recommended** length is where text starts to get cut off in some placements; Startica flags longer text as a warning. Lengths count characters.

### Google Ads

A Search campaign with responsive search ads.

| Field | Limit | How many | Required |
| --- | --- | --- | --- |
| Headlines | 30 characters each | 3 to 15 | Yes |
| Descriptions | 90 characters each | 2 to 4 | Yes |
| Path 1 | 15 characters | 1 | No |
| Path 2 | 15 characters | 1 | No |

The paths are the display path after the domain, such as `fieldnote.example/field-notes/app`. Google ads have no call to action field.

The plan asks for 10 to 15 headlines and 4 descriptions, more than the minimum, because Google mixes them and tries combinations.

### Meta

A single-image ad (Facebook and Instagram).

| Field | Limit | Recommended | Required |
| --- | --- | --- | --- |
| Primary text | 2,200 characters | about 125 | Yes |
| Headline | 255 characters | about 40 | Yes |
| Description | 255 characters | about 30 | No |
| Call to action | One from the list below | | |

About 125 characters of primary text show before "See more".

### Reddit

A promoted post, image or text.

| Field | Limit | Recommended | Required |
| --- | --- | --- | --- |
| Headline (the post title) | 300 characters | about 100 | Yes |
| Body text | 500 characters | | No |
| Call to action | One from the list below | | |

### Character counts on the page

Each line on the campaign page has a count next to it. For Google headlines, descriptions and paths it's out of the limit, for example `27/30`. For fields with a recommended length (Meta's primary text, headline and description, Reddit's headline) it's out of the recommended length, for example `118/125`, and turns amber when you go over it (a warning), or red past the hard limit. Reddit's body is out of 500.

## Calls to action

The **Edit ad** dialog offers these. The plan picks from the same list.

| Meta | Reddit |
| --- | --- |
| Learn more (`LEARN_MORE`) | Learn More |
| Sign up (`SIGN_UP`) | Sign Up |
| Get started (`GET_STARTED`) | Get Started |
| Download (`DOWNLOAD`) | Download |
| Subscribe (`SUBSCRIBE`) | Install |
| Contact us (`CONTACT_US`) | Shop Now |
| Apply now (`APPLY_NOW`) | View More |
| Get offer (`GET_OFFER`) | Contact Us |
| Shop now (`SHOP_NOW`) | Apply Now |
| Book now (`BOOK_NOW`) | See Menu |

Meta's values in brackets are what the [Meta bulk import file](/ads/hand-off#meta) carries. When an ad has no call to action yet, **Edit ad** starts on the first one in the list.

## Checks

Every ad is checked each time its campaign page loads. **Errors** are things the platform rejects. **Warnings** are advice: common reasons ads are disapproved or perform badly. Neither blocks the download in Startica.

### Limits and required fields

| Check | Level | Platforms | Flagged when |
| --- | --- | --- | --- |
| "_Field_ is required." | error | All | A required single field (Meta primary text or headline, Reddit headline) is empty. |
| "At least _n_ _field_ needed (_m_ now)." | error | Google | Fewer than 3 headlines or 2 descriptions. |
| "At most _n_ _field_ (_m_ now)." | error | Google | More than 15 headlines or 4 descriptions. |
| "_n_ characters: the limit is _limit_." | error | All | A line is over its limit. |
| "_n_ characters: over about _n_, it's cut off in some placements." | warning | Meta, Reddit | A line is within its limit but over its recommended length. |

### Google rules

| Check | Level | Flagged when |
| --- | --- | --- |
| "Google doesn't allow exclamation marks in headlines." | error | A headline contains `!`. |
| "Two headlines are the same; Google needs each to be different." | error | Two headlines match, ignoring upper and lower case and spaces at the ends. |
| "Google allows one exclamation mark per description." | warning | A description has two or more `!`. |
| "Google disapproves excessive capitals (ALL CAPS words)." | warning | A line has a word of 4 or more capital letters that isn't a common abbreviation (SEO, GEO, API, CSV, PDF, GDPR, HIPAA, SAAS, GPS, HTML, JSON, USA). |

### Wording, on every platform

These run on every line of every text field. The call to action isn't checked.

| Check | Level | Flagged when the line contains |
| --- | --- | --- |
| "Superlatives (best, #1…) need proof on the landing page, or the ad may be disapproved." | warning | best, #1, number one, top rated (or top-rated), cheapest, or leading |
| "Guarantees and risk-free claims are often rejected; say what's true instead." | warning | guarantee, guaranteed, guarantees, risk free (or risk-free), 100% free, 100% safe, 100% effective, or instant result or instantly result (singular or plural) |
| "Clickbait phrasing lowers quality and is often rejected." | warning | click here, you won't believe (or wont), or shocking |
| "Mentions _name_: competitor names in ads can be restricted by trademark rules." | warning | the name of a competitor in the product's [Intel](/getting-started/first-run), as a whole word, ignoring case. Names of 2 characters or fewer are skipped. |

### Meta rule

| Check | Level | Flagged when the line contains |
| --- | --- | --- |
| "Meta rejects ads that assert or imply personal attributes; talk about the product, not the reader's situation." | warning | "are you" followed by struggling, depressed, overweight, in debt, single or divorced; or "your" followed by debt, diagnosis, condition, disability, religion or sexual |

Words are matched as whole words, ignoring case.

### What isn't checked

The checks are pattern rules over the text. They don't check:

- whether a claim is true, or proven on the landing page;
- the landing page itself;
- images, or the platforms' rules for them (the [creatives](/ads/creatives) only keep to each platform's sizes and file limits);
- prohibited or restricted product categories;
- every way an ad can imply personal attributes, or name a competitor not in Intel;
- the targeting: keywords, communities, interests and locations.

The platforms review every ad before it runs, and their decision is final.

## Related

- [Ads](/ads)
- [Hand-off](/ads/hand-off)
