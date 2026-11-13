---
title: Signed-in checks and safety
description: Run Security's passive checks on pages behind your sign-in, with a session you sign in to by hand, and keep scans away from busy hours with no-scan windows.
layout: doc
---

Most of a product lives behind its sign-in: the account page, settings, the app itself. **Signed-in checks** run Security's passive [page checks](/security/checks) on the pages you list there. You sign in yourself, in a window Startica opens. Startica never types a password, fills in a form or presses a button on your site.

The same card has the safety controls for the whole site: **no-scan windows** and the **extra hosts** your sign-in passes through.

Signed-in checks work on [verified sites](/security#verify-your-site) in the desktop app.

## Find it

**Security**, on the Overview, the card **Signed-in checks and safety**.

## Set it up

1. Click **Settings** on the card and fill in:

   | Field | What to enter |
   | --- | --- |
   | **Pages to check after sign-in** | Up to 20 addresses on this site, one per line, for example `/account` and `/settings`. Pages on other sites are refused. |
   | **Sign-in page** | Where the sign-in window opens, for example `/login`. The site's start page when empty. |
   | **Extra hosts the sign-in may pass through** | Up to 5 host names, when signing in goes through another domain, for example `login.example.com` or your identity provider. The sign-in window and the checks may load pages there; links anywhere else open in your browser. |
   | **No-scan windows** | See [No-scan windows](#no-scan-windows). |

2. Click **Sign in…**. A window opens on the sign-in page, titled "Sign in to _your site_: close this window when you're signed in". Sign in as you normally would, then close the window.
3. Click **Check now**, or wait: the signed-in pages are checked after each full scan.

Each page then shows **Checked**, **Signed out** or **Couldn't check**. "Signed out" means the page sent Startica elsewhere (usually back to the sign-in page) or answered 401 or 403: the session ended. Click **Sign in…** and sign in again.

Use an account that can't do much: a test or read-only account is best. Startica only loads the pages you list, the same way your browser would, but the session is a real one.

## What's checked

The same page checks as the rest of the site: security headers, versions in headers, mixed content, forms, scripts from other sites. What they find joins the site's findings, and a finding's page lists the signed-in pages under **After sign-in**.

Cookies are checked from the session itself, because a session cookie is usually set when you sign in, not on the page. Each cookie's **Secure**, **HttpOnly** and **SameSite** flags are checked like a cookie set by a page (see [Cookies](/security/checks#cookies)). Startica reads only the cookies' names and flags. Their values stay in the sign-in window's own browser storage, and are never saved in Startica's data.

**Recheck** on a finding seen after sign-in runs the signed-in check again.

## Forget the sign-in

**Forget sign-in** clears the site's sign-in session (its cookies and storage) and removes the results from signed-in pages. Findings only those pages had are marked fixed. Sign in again to check them again.

In the desktop app, the session lasts as long as the site keeps it. Quitting Startica ends session cookies that don't have an expiry date, as quitting a browser does; signed-in checks then show "Signed out" until you sign in again.

## No-scan windows

Times when Startica doesn't scan the site, in your computer's local time, one per line: the days, then a time range.

| Example | Means |
| --- | --- |
| `Mon-Fri 09:00-17:00` | Weekdays, office hours |
| `Sat,Sun 00:00-23:59` | All weekend |
| `daily 22:00-06:00` | Every night; a window that ends before it starts runs past midnight |

Days can be `Mon` to `Sun`, a range like `Fri-Mon`, a list like `Sat,Sun`, or `daily`, `weekdays` and `weekends`. You can have up to 7 windows.

Inside a window:

- **Scan now** and page checks say why they can't run.
- Scheduled scans wait for the next hourly check after the window ends.
- A scan that's running stops before its next page, keeping what it checked, with the note "Stopped: a no-scan window for this site began".
- [Monitoring](/security/monitoring) and signed-in checks skip the site until the next time they run.

The card says when a window is on now. **Stop**, in the header's activity list, stops any scan at any time.
