---
title: Running in the background
description: How Startica keeps running in the tray or menu bar, what runs on a schedule, launching at login, and how to quit.
layout: doc
---

Startica's scheduled work only happens while the app is running. Closing the window doesn't stop it. Startica stays in your system tray (the menu bar on macOS) and keeps scanning, checking engagement and syncing metrics until you quit.

## The tray icon

Startica adds an icon to the system tray on Windows and Linux, and to the menu bar on macOS. Its menu has:

| Menu item | What it does |
| --- | --- |
| **Open Startica** | Shows the window, reopening it if you closed it. |
| **Dashboard** | Opens the [Dashboard](/guides/dashboard). |
| **Today** | Opens the Today page. |
| **Inbox** | Opens the Inbox. |
| **Content Studio** | Opens Content Studio. |
| **Roadmap** | Opens the Roadmap. |
| **Launch at Login** | Turns starting at login on or off. |
| **Check for Updates…** | Installed app only. Checks GitHub for a newer release now, or installs one that's already downloaded. See [Updating](/getting-started/updating#automatic-updates). |
| **Check for Updates Automatically** | Installed app only. On by default: checks 30 seconds after start and every 6 hours, and downloads updates in the background. |
| **Quit Startica** | Stops the app and all background work. |

On Windows and Linux, clicking the icon opens the window. On macOS, clicking it shows the menu.

If the window is already open, **Open Startica** brings it to the front without reloading, so unsaved edits stay put. The page items always load that page.

## Closing the window

Closing the window does not quit Startica. The server and the job runner keep going in the background. Use the tray icon to bring the window back.

Opening Startica again while it's running (from the Dock, Start menu or a launcher) also brings the existing window to the front. Only one copy runs at a time.

## What runs on a schedule

The schedules use your computer's local time:

| Job | Schedule | What it does |
| --- | --- | --- |
| Listening scan | Every hour, at 7 minutes past | Scans Reddit, Hacker News, Bluesky, Mastodon, Discourse forums and (with an X API token) X for new conversations. See [Finding conversations](/guides/finding-conversations). |
| Engagement check | Every 6 hours, at 17 minutes past (00:17, 06:17, 12:17, 18:17) | Checks replies under the things you posted in the last 14 days. See [Drafting replies](/guides/drafting-replies). |
| Metrics sync | Daily at 08:15 | Pulls numbers from GA4, Umami, Stripe and your product database, and search data from Google Search Console and Bing. See [Analytics](/guides/analytics) and [Search performance](/seo/search). |
| Roadmap replan | Weekly, Monday at 07:00 | Reviews the roadmap against the latest results. See [Growth roadmap](/guides/roadmap). |
| Security monitoring | Daily at 06:47 | Checks every verified site for exposed libraries, new subdomains and certificates, look-alike domains and changed third-party scripts. See [Monitoring](/security/monitoring). |
| Scheduled site scans | Every hour, at 37 minutes past | Starts a full scan of each site whose last one is older than its **Scan again automatically** interval. See [Scheduled scans](/accessibility/scanning#scheduled-scans). |
| AI visibility | Weekly, Monday at 09:30 | Asks the AI visibility questions again, only for products with **Run every week** on. It costs money. See [Weekly runs](/seo/ai-visibility#weekly-runs). |

> [!WARNING]
> Nothing runs while Startica is quit or the computer is asleep. Missed runs are not made up when the app starts again. They simply happen at the next scheduled time. If you want hourly scans, keep Startica running in the tray.

Work that a scheduled job queues up, like scoring and drafting new conversations, runs right away as long as the app is open. You can see every job run on the **System** page. See [Jobs](/reference/jobs) for the full list.

## Launch at Login

Turn on **Launch at Login** in the tray menu (or the matching checkbox in **Settings → General → App**) to start Startica when you log in to your computer. When it starts this way, it opens hidden: just the tray icon, no window. On macOS it also stays out of the Dock until you open the window.

| Platform | How it's set up |
| --- | --- |
| macOS | The system's login items |
| Windows | The system's login items |
| Linux | An autostart entry at `~/.config/autostart/startica.desktop` (under `$XDG_CONFIG_HOME` if set) |

**Launch at Login** works only in the installed app. It's grayed out when you run Startica from source with `yarn dev:desktop`, because it would register the development Electron binary instead of Startica. Settings shows "Launch at login: available in the installed app." instead of the checkbox.

On Linux, if you run Startica as an AppImage, the autostart entry points to the AppImage file. If you move or rename that file, turn **Launch at Login** off and on again.

## Quitting

To stop Startica completely, choose **Quit Startica** from the tray menu. On macOS you can also use **Quit** from the app menu or press `Cmd+Q` while the window is focused.

Quitting stops the local server and every scheduled job. A job that was running when you quit is retried after you start Startica again, once its time limit has passed. For a listening scan that is up to 40 minutes after it started.

## Platform support

Startica is built for macOS, Windows and Linux.

> [!NOTE]
> So far only macOS has been run and tested. The tray icon, closing to the tray and **Launch at Login** follow the standard behavior on Windows and Linux, but they are untested there. If something doesn't work, please report it. See [Contributing](/contributing).
