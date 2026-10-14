---
title: GitHub and GitLab
description: Create a GitHub or GitLab access token for one repository so Startica can open, close and reopen issues there for the accessibility problems and security findings it finds.
layout: doc
---

Startica can open an issue in your GitHub or GitLab repository for each accessibility problem and [security finding](/security/findings) its checks find, so the work lands where your team already tracks it. You connect one repository per product with an access token you create, limited to that repository.

This page covers creating the token on GitHub or GitLab, connecting it in Startica, what Startica sends, and how to remove it. How issues are opened and closed is in [Issues in GitHub or GitLab](/accessibility/issue-trackers).

## What the token needs

Startica checks that it can see the repository, opens issues, comments on them, and closes and reopens them. It never reads code, pull requests, other issues or anything else in the repository, and never changes anything but the issues it opened.

| Service | Token | Access |
| --- | --- | --- |
| GitHub (github.com or GitHub Enterprise) | A fine-grained personal access token | Only this repository; repository permission **Issues: Read and write** |
| GitLab (gitlab.com or self-hosted) | A project access token | Role **Reporter**, scope **api** |

## Create a GitHub token

1. Open [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new) (in GitHub: your picture → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**). The **Connect GitHub or GitLab** dialog in Startica links there too.
2. **Token name:** `Startica`. Pick an expiration that suits you; you'll need a new token when it expires.
3. **Resource owner:** the account or organization that owns the repository, for example `fieldnote`.
4. **Repository access:** **Only select repositories**, then pick the one repository, for example `fieldnote/web`.
5. Under **Repository permissions**, set **Issues** to **Read and write**. GitHub adds **Metadata: Read-only** by itself. Leave everything else at **No access**.
6. Click **Generate token** and copy it. It starts with `github_pat_`, and GitHub shows it only once.

> [!NOTE]
> Some organizations require an owner to approve fine-grained tokens before they work. If saving in Startica says "repository not found, or the token can't see it", check whether the token is still waiting for approval in the organization's settings.

On GitHub Enterprise Server, the steps are the same on your own server.

## Create a GitLab token

1. In GitLab, open the project, for example `fieldnote/web`.
2. Go to **Settings → Access tokens** and click **Add new token**.
3. **Token name:** `Startica`. Set an expiration date if you like; GitLab may require one.
4. **Role:** **Reporter**. That's enough to open, comment on, close and reopen issues.
5. **Scopes:** tick **api** only.
6. Click **Create project access token** and copy it. It starts with `glpat-`, and GitLab shows it only once.

> [!NOTE]
> Project access tokens aren't available on every GitLab plan. If your project doesn't offer them, a personal access token with the **api** scope also works, but it can reach every project you can, so prefer a project token where you have one.

## Connect in Startica

1. Open **Settings → Products**, and pick the product in the list if it isn't the one shown.
2. On the card **Issue tracker for _product_**, click **Connect**. The **Connect GitHub or GitLab** dialog opens.
3. Fill in the fields and click **Save and check**.

| Field | What to enter | Default |
| --- | --- | --- |
| **Service** | GitHub or GitLab | GitHub |
| **Repository** | `owner/name` on GitHub or `group/project` on GitLab (subgroups work: `group/subgroup/project`). You can paste the repository's web address instead; Startica keeps the path and drops a trailing `.git`. | (none) |
| **Access token** | The token you copied. "Stored encrypted on this computer and only sent to that service." When changing a saved tracker: "Leave empty to keep the saved token." | (none) |
| **Labels for new issues** | Comma-separated labels added to each issue Startica opens. Up to 10; extra ones are dropped. | `accessibility` |
| **Open issues automatically after each scan** | **No, only when I click Create issue**, or open issues for new findings at or above an impact: **For new critical issues**, **For new serious and critical issues**, **For new moderate, serious and critical issues** or **For every new issue**. See [Opening issues automatically](/accessibility/issue-trackers#opening-issues-automatically). | No |
| **Close the issue when Startica sees it fixed, and reopen it if it comes back** | A checkbox | Ticked |
| **Server (only for GitHub Enterprise or self-hosted GitLab)** | Leave empty for github.com and gitlab.com. For self-hosted GitLab, the server's address, for example `https://gitlab.example.com`. For GitHub Enterprise Server, its API address, for example `https://ghe.example.com/api/v3`. | `https://api.github.com` or `https://gitlab.com` |

"Startica checks the token can see the repository when you save." The card then shows the service and repository, for example "GitHub: fieldnote/web", with a **Connected** badge. If the check fails, the settings are still saved: the card shows **Error** and the reason in red, and the dialog shows the same message. Fix the problem and save again with **Change**.

The server address must start with `https://`. `http://` is accepted only for a server on this computer or your local network (`localhost`, `192.168.x.x`, `10.x.x.x` and similar).

### When the check fails

| Message | What to do |
| --- | --- |
| "Paste an access token" | Paste the token. It's required the first time. |
| "Enter the repository as owner/name (GitHub) or group/project (GitLab)" | Enter the path, not just the repository's name. |
| "Use an https:// address for the server" | Use the server's `https://` address. |
| "Reading the repository failed: the token is invalid or expired" (GitLab: "Reading the project failed: …") | The token was mistyped, revoked or has expired. Create a new one and save it with **Change**. |
| "… failed: the token isn't allowed to do this (check its permissions)" | GitHub: give the token **Issues: Read and write**. GitLab: role **Reporter** or higher and scope **api**. |
| "… failed: repository not found, or the token can't see it" | Check the repository path and, on GitHub, that the token has access to that repository (and isn't waiting for an organization's approval). On your own server, check the **Server** address: for GitHub Enterprise it must end in `/api/v3`. |
| "Issues are turned off for _repository_" | Turn on issues in the repository's settings (GitHub: **Settings → General → Features → Issues**; GitLab: **Settings → General → Visibility, project features, permissions → Issues**). |
| "Couldn't reach _host_ (…)" | The server didn't answer within 20 seconds, or the address is wrong. Check the **Server** address and your connection. |

Errors from later requests (opening, commenting, closing or reopening an issue) show on the card in the same way, for example "Opening the issue failed: the token is invalid or expired". The message clears after the next request that succeeds.

## What Startica sends

| Request | When | GitHub | GitLab |
| --- | --- | --- | --- |
| Read the repository | When you save | `GET /repos/{owner}/{name}` | `GET /api/v4/projects/{path}` |
| Open an issue | **Create issue**, or automatically after a scan | `POST …/issues` | `POST …/issues` |
| Comment | Before closing, and after reopening | `POST …/issues/{number}/comments` | `POST …/issues/{iid}/notes` |
| Close or reopen | After a scan, with **Close the issue when Startica sees it fixed** ticked | `PATCH …/issues/{number}` | `PUT …/issues/{iid}` |

The token goes only to the API address you configured (`api.github.com`, `gitlab.com`, or your own server), in the `Authorization` header on GitHub and `PRIVATE-TOKEN` on GitLab.

Each accessibility issue contains what Startica found: the rule, its impact and WCAG criteria, and up to 20 failing elements with their page addresses, CSS selectors and HTML snippets. Each security issue, titled "Security: …", contains the finding's severity and OWASP Top 10 category, what the check saw (such as a cookie's name, a header's value or a script's host), why it matters, how to fix it, and up to 20 page addresses. Security issues get your labels except `accessibility`, or `security` if that leaves none. So the issue makes those details visible to everyone who can see the repository, and a security issue shows where the weak spot is. If a page you scan shows private data, keep that in mind before connecting a public repository, and only open security issues in a private one. See [What an issue contains](/accessibility/issue-trackers#what-an-issue-contains) and [Security findings](/accessibility/issue-trackers#security-findings).

## Change the settings

Click **Change** on the card. Leave **Access token** empty to keep the saved token, adjust the other fields, and click **Save and check**. Startica checks the token again.

To move to another repository, click **Change** and enter the new one. Startica then forgets the issues it opened in the old repository (they stay there), so it never closes or comments on unrelated issues in the new one; **Create issue** opens fresh issues in the new repository.

## Disconnect or revoke

Click **Disconnect** on the card and confirm ("Disconnect the repository? Issues already opened stay in it."). Startica deletes the saved token and its record of which issues it opened. The issues themselves stay in the repository, open or closed as they were. If you connect again later, Startica no longer knows about those issues, and **Create issue** opens new ones.

To stop the token working everywhere, also revoke it on the service:

- **GitHub:** **Settings → Developer settings → Personal access tokens → Fine-grained tokens**, open the token and click **Delete**.
- **GitLab:** the project's **Settings → Access tokens**, then **Revoke** next to the token.

## Where it's stored

| Value | Storage |
| --- | --- |
| Access token | Secret `issue-tracker-<tracker id>`, encrypted. See [how credentials are stored](/credentials/#how-credentials-are-stored). |
| Service, server, repository, labels, automatic settings, status and last error | Plain, `issue_trackers` table (one row per product) |
| The issues Startica opened: number, address and whether it's open or closed | Plain, `tracker_issues` table |

There's no environment variable for the token, in development either.

## Related

- [Issues in GitHub or GitLab](/accessibility/issue-trackers)
- [Settings: Issue tracker](/reference/settings#issue-tracker)
- [Privacy and security](/concepts/privacy-security)
