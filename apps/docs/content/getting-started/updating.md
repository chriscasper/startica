---
title: Updating
description: "How Startica updates: the installed app downloads new releases by itself, and a copy built from source is updated by pulling and rebuilding. Your data folder stays untouched."
layout: doc
---

How you update depends on how you got Startica. An installed copy from a published release checks for updates and installs them itself. A copy you run from source, or built yourself, you update by pulling the latest code and rebuilding. Either way, your data stays where it is.

> [!NOTE]
> No release has been published yet, and the app can only read releases once the repository is public. Until then, everyone installs and updates [from source](#update-from-source).

## Automatic updates

The installed app looks for a newer release on GitHub 30 seconds after it starts, then every 6 hours while it runs. When it finds one, it downloads it in the background; you can keep working. When the download is done, Startica asks:

```text
Startica 0.2.0 is ready
Restart to update now, or it updates the next time you quit Startica.
```

- **Restart Now** quits, installs the update and opens Startica again.
- **Later** keeps you on the current version. The update installs the next time you choose **Quit Startica**.

Only published releases count. Drafts and pre-releases are never offered. Database migrations run on the first start after the update, as always (see [Database migrations](#database-migrations)).

### The tray menu

Two items in the tray (menu-bar) icon's menu control updates:

| Menu item | What it does |
| --- | --- |
| **Check for Updates…** | Checks now. If you're on the latest version, it says "Startica is up to date". If the check fails (for example, you're offline), it says "Couldn't check for updates" with the reason. While a check or download runs, the item reads **Checking for Updates…** or **Downloading 0.2.0…**. Once an update is downloaded, it reads **Restart to Update to 0.2.0**, which installs it right away. |
| **Check for Updates Automatically** | On by default. Untick it to stop the checks at start and every 6 hours. **Check for Updates…** still works. |

The setting is saved in `updates.json` in the [data folder](/reference/data-folder). It's per computer, not per product, and it's the same in [demo mode](/guides/demo-mode).

### What the check sends

The only request is to GitHub, for the release files of the [Startica repository](https://github.com/chriscasper/startica/releases): its releases feed, a small `latest*.yml` file describing the newest release, and, when there's an update, the installer itself. No account, ID or usage data is sent. GitHub sees your IP address, as with any download. See [Privacy and security](/concepts/privacy-security#what-goes-over-the-network).

### When an update is not installed

- **Dev mode** (`yarn dev:desktop`) never checks. **Check for Updates…** says "Updates work in the installed app".
- **macOS needs a signed release.** macOS only installs an update signed by the same developer as the app you're running. Releases aren't signed yet, so on macOS the update downloads but doesn't install. Update from source instead.
- **A copy you built yourself** checks the same releases. Once releases are published, it offers a newer official release, which replaces your build (on Windows and Linux; on macOS, see above). If you'd rather stay on your own build, untick **Check for Updates Automatically**.

## Update from source

If you run Startica in dev mode or from an installer you built, you update by pulling the latest code and rebuilding.

### Back up first

Your products, conversations, drafts and settings live in one data folder. Updates don't touch it, but a backup costs nothing.

1. Quit Startica: choose **Quit Startica** from the menu bar or tray icon. Closing the window isn't enough, because the app keeps running in the background.
2. Copy the whole data folder somewhere safe.

| OS | Data folder |
|---|---|
| macOS | `~/Library/Application Support/Startica` |
| Windows | `%APPDATA%\Startica` |
| Linux | `~/.config/Startica` |

Copy the folder, not just `startica.db`. The database uses SQLite's write-ahead log, so recent changes may still be in `startica.db-wal` next to it.

> [!NOTE]
> Saved secrets (your API key, sign-in tokens, connection credentials) are encrypted with this computer's OS keychain. A backup restored on another computer has your data, but you'll need to enter the secrets again in Settings.

### Update the code

From the folder where you cloned Startica:

```bash
git pull
yarn
```

Always run `yarn` after pulling. Dependencies change between versions.

### Restart or rebuild

#### If you use dev mode

Stop the running app (quit it from the tray icon, or press Ctrl+C in its terminal), then start it again:

```bash
yarn dev:desktop
```

#### If you use a built installer

Rebuild for your OS, then install the new build over the old one:

```bash
yarn build:desktop --mac
```

Use `--win` or `--linux` on those systems. The new installer is in `apps/desktop/dist/`. See [Install from source](/getting-started/install) for the per-OS steps.

On macOS, rebuilt unsigned apps may trigger a Keychain prompt again the first time they read your secrets. Click **Always Allow**.

## Database migrations

You don't run migrations yourself. Each time Startica starts, it applies any new migrations to your database before opening the window. Migrations only move forward. If you go back to an older version of the code after a newer one migrated your database, the older version may not work with it. Restore your backup in that case.

## If something breaks

- Make sure your Node version still meets the [requirements](/getting-started/requirements).
- Run `yarn` again. A half-finished install is the most common cause.
- See [Troubleshooting](/troubleshooting).
