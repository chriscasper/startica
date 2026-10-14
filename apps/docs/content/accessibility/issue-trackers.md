---
title: Issues in GitHub or GitLab
description: Open a GitHub or GitLab issue for an accessibility problem with one click, or let Startica open, close and reopen them after each scan.
layout: doc
---

If your team tracks work in GitHub or GitLab, Startica can put accessibility problems there: one repository issue per problem, with where it fails and how to fix it. You can open issues by hand from an issue's page, or have Startica open them after each scan and close them when a scan finds the problem fixed.

This page covers connecting a repository, **Create issue**, what an issue contains, and the automatic mode. Creating the token is covered in [GitHub and GitLab](/credentials/github-gitlab).

## Connect a repository

Each product can connect one repository, on GitHub (or GitHub Enterprise) or GitLab (gitlab.com or self-hosted):

1. Create an access token limited to that repository. See [GitHub and GitLab](/credentials/github-gitlab).
2. Open **Settings → Products** and click **Connect** on the card **Issue tracker for _product_**.
3. Choose the service, enter the repository (for example `fieldnote/web`) and the token, and pick whether Startica opens issues automatically.
4. Click **Save and check**. The card shows "GitHub: fieldnote/web" with **Connected** once the token works.

The card also says what Startica does with the repository, for example "Opens issues automatically after each scan for new serious and critical issues (at most 10 a scan); closes them when fixed. 3 opened so far.", or "Opens issues when you click Create issue" without the automatic mode.

## Create an issue by hand

1. Open **Accessibility → Issues** and click an issue.
2. Click **Create GitHub issue** (or **Create GitLab issue**) next to **Recheck N pages**. The button shows only on open issues.
3. Startica opens the issue in the repository and shows "Issue opened." with **View**, which opens it in your browser.

From then on, the issue's page shows a link such as "GitHub issue #12 (open)" instead of the button. Each Startica issue has at most one repository issue, so it never opens a duplicate, even if the issue is also picked up by the automatic mode.

Without a connected repository, the issue's page shows a **Connect GitHub or GitLab** link, which opens **Settings → Products**.

> [!NOTE]
> The "(open)" or "(closed)" after the link is what Startica last did with the issue. Startica doesn't read the repository, so it doesn't notice when someone closes or reopens the issue there.

## What an issue contains

The title is "Accessibility: " followed by the check's description, with the number of pages when it fails on more than one: for example "Accessibility: Images must have alternative text (5 pages)".

The body has:

- the impact, the WCAG criteria and level, and the rule id (for example `image-alt`);
- the rule's description and a **How to fix** link to its documentation;
- when it fails on several pages, a note that it's probably in a shared template or component, so fixing it there fixes every page;
- **Where it fails (N pages, M elements)**: up to 20 failing elements, each with its page address, CSS selector, HTML snippet (in a code block) and what the check found. When there are more, "…and K more elements, listed in Startica.";
- a closing line: "Found by Startica's automated accessibility checks on _date_. Automated checks cover only part of WCAG; please also check this by hand."

The body ends with a hidden HTML comment that marks the issue as Startica's. The labels from **Labels for new issues** (default `accessibility`) are added to every issue.

> [!WARNING]
> The page addresses and HTML snippets in an issue are visible to everyone who can see the repository. If a scanned page shows private data, check what the snippets contain before connecting a public repository.

## Opening issues automatically

With **Open issues automatically after each scan** set to an impact, Startica opens issues by itself after every full scan, page check and issue recheck (including a scan you stopped):

| Setting | Opens issues for |
| --- | --- |
| **No, only when I click Create issue** (the default) | Nothing automatically |
| **For new critical issues** | Critical |
| **For new serious and critical issues** | Serious and critical |
| **For new moderate, serious and critical issues** | Moderate and above |
| **For every new issue** | Every impact, including minor |

"New" means an open issue that doesn't have a repository issue yet. So when you first turn this on, Startica also opens issues for problems found by earlier scans.

To keep a first scan of a big site from flooding the repository, Startica opens **at most 10 issues per run**, most important first: impact times the number of pages, the same ranking as **Fix these first**. The rest are opened after the next scans, 10 at a time. Items that only need review are never opened as issues.

## Security findings

**Open issues automatically for security findings** opens one repository issue for each open [security finding](/security/findings) at or above the severity you pick, from the scans and monitoring (never imported or reported ones), within the same 10 a run. They're labeled `security` and closed and reopened like accessibility issues. A security finding tells everyone who can read the repository where the weak spot is: use it only with a private repository.

## Closing fixed issues

With **Close the issue when Startica sees it fixed, and reopen it if it comes back** ticked (the default), Startica keeps the repository issues it opened in step with its results after each scan or check. This applies to issues opened by hand too.

| When | Startica |
| --- | --- |
| A problem is [fixed](/accessibility/results#open-and-fixed): not found on any page in the latest results | Comments "Startica's latest scan no longer finds this problem on any page, so it's closing this issue. It will reopen it if the problem comes back." and closes the issue (on GitHub, as completed). |
| A fixed problem is found again | Reopens the issue and comments "Startica's latest scan found this problem again, on N pages." |

Untick the box if you'd rather close issues yourself. Startica then only opens issues.

## What Startica never does

- It doesn't read or change anything else in the repository: no code, pull requests, other issues or settings.
- It doesn't edit an issue after opening it. New pages or elements found later don't update the issue; the issue's page in Startica always has the current list.
- It doesn't notice issues that people close, reopen or delete in the repository.

## When it runs

The automatic work runs as the background job `tracker_sync`, queued when a scan or check finishes, and only if the product's tracker opens or closes issues automatically. It makes no AI calls. If it fails (for example the token expired), it's tried once more, and the error shows in red on the **Issue tracker** card in **Settings → Products**. See [Background jobs](/reference/jobs).

**Create issue** runs right away, not as a job. An error, such as "Opening the issue failed: the token is invalid or expired", shows as a message and on the card.

## Disconnect

**Disconnect** on the card removes the repository and its token from Startica. Issues already opened stay in the repository. See [Disconnect or revoke](/credentials/github-gitlab#disconnect-or-revoke).

## Related

- [GitHub and GitLab](/credentials/github-gitlab): creating the token
- [Reading the results](/accessibility/results)
- [Settings: Issue tracker](/reference/settings#issue-tracker)
- [Privacy and security](/concepts/privacy-security)
