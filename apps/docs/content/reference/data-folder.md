---
title: Data folder
description: Where Startica keeps its database and secrets on each OS, and how to back up, restore, reset or move your data.
layout: doc
---

Everything Startica knows lives in one folder on your computer: products, intel, conversations, drafts, roadmap, metrics, job history and encrypted credentials, plus the posting window's sign-ins. Nothing is stored on a Startica server. This page covers where the folder is, what is in it, and how to back it up, restore it, start over or move it.

## Location

| OS | Default folder |
| --- | --- |
| macOS | `~/Library/Application Support/Startica` |
| Windows | `%APPDATA%\Startica` (usually `C:\Users\<you>\AppData\Roaming\Startica`) |
| Linux | `$XDG_CONFIG_HOME/Startica`, or `~/.config/Startica` when `XDG_CONFIG_HOME` is unset |

Running from source (`yarn dev:desktop`, `yarn dev:desktop-web`, `yarn seed:demo` and other scripts) uses a separate **Startica Dev** folder next to it, for example `~/Library/Application Support/Startica Dev`, with its own keychain entry. Development never touches the installed app's data or keys, and the two can run at the same time.

### Overriding it

Set `STARTICA_DATA_DIR` to use another folder. The folder is created if it doesn't exist.

```bash
STARTICA_DATA_DIR="$HOME/startica-test" yarn dev:desktop
```

The smoke tests and `yarn eval` always use a fresh temporary folder, so they never touch your real data. See [Environment variables](/reference/environment).

## What's inside

| File | What it is |
| --- | --- |
| `startica.db` | The SQLite database. Everything Startica stores, including encrypted secrets. |
| `startica.db-wal` | SQLite write-ahead log (the database runs in WAL mode). Holds recent writes not yet merged into `startica.db`. Part of the database while the app runs. |
| `startica.db-shm` | SQLite shared-memory index for the WAL. Recreated as needed. |
| `dev-secret.key` | Only created when the server runs outside the desktop app (`yarn dev:desktop-web`). A random AES-256 key (file mode 0600) that encrypts secrets in that mode. |
| `startica-mode.json` | Only created once you open the [demo](/guides/demo-mode). Says whether Startica starts in demo mode: `{"demo":true}` or `{"demo":false}`. See [Demo mode](#demo-mode). |
| `updates.json` | Only created once you change **Check for Updates Automatically** in the tray menu. `{"auto":false}` turns automatic update checks off; a missing file means on. See [Updating](/getting-started/updating#automatic-updates). |
| `ads/` | Only created once you make an [ad creative](/ads/creatives) or upload a logo. Ad pictures, rendered ad images and product logos. See [Ad images](#ad-images). |
| `demo/` | Only created once you open the demo. The demo's own data folder, with its own `startica.db`, holding the Fieldnote sample product. |
| `Partitions/posting` | The posting window's own browser profile: your sign-ins to X, Hacker News, Reddit, LinkedIn, Bluesky, your Mastodon server and any Discourse forums for [Posting with Startica](/guides/assisted-posting). Deleting it signs you out of them. See [Posting sign-ins](#posting-sign-ins). |
| Other files and folders | Electron's own browser-profile data for the app window (cookies, caches, preferences). Safe to lose. |

The database schema is upgraded automatically when the app starts (migrations run on every launch).

Downloaded updates aren't kept in the data folder but in your user cache folder, under `@starticadesktop-updater`: `~/Library/Caches` on macOS, `%LOCALAPPDATA%` on Windows, `~/.cache` (or `$XDG_CACHE_HOME`) on Linux. Deleting it only means the next update downloads again.

### Ad images

[Ad creatives](/ads/creatives) keep their images as files, not in the database:

| Path | What it is |
| --- | --- |
| `ads/creatives/<creative id>/picture.png` (or `.jpg`, `.webp`) | The creative's picture: drawn by the AI (PNG) or the file you uploaded, as uploaded. At most one per creative. |
| `ads/creatives/<creative id>/1x1.png`, `4x5.png`, `9x16.png`, `1.91x1.png` | The rendered ad in each size the platform takes. A size is `.jpg` instead when the PNG was over the platform's file limit. |
| `ads/logos/<product id>.png` (or `.jpg`, `.webp`) | The product's logo for templates, one per product. |

The database keeps each creative's settings, the prompt its picture was drawn from, and the list of rendered sizes. Deleting a creative deletes its folder; deleting a campaign deletes the folders of all its creatives. **Remove** next to the logo deletes the logo file.

### How secrets are encrypted

Secrets are the AI API keys (Anthropic and OpenAI), the X API token, GitHub and GitLab tokens, pasted connection credentials and the product database's read-only connection URL. They are stored in the `secrets` table, encrypted. Everything else in `startica.db` is plain text.

| Mode | Cipher | Where the key lives |
| --- | --- | --- |
| Desktop app (`yarn dev:desktop` or installed) | Electron `safeStorage` | The OS keychain: macOS Keychain, Windows DPAPI (tied to your Windows user), Linux libsecret. |
| Browser dev mode (`yarn dev:desktop-web`) | AES-256-GCM | `dev-secret.key` in the data folder. |

> [!WARNING]
> On Linux without a keyring (no libsecret service running), Electron falls back to a basic text backend and Startica logs "No system keyring found; secrets are only lightly protected on this computer."

> [!NOTE]
> `yarn dev:desktop` and `yarn dev:desktop-web` share the Startica Dev folder but encrypt differently. When the desktop app starts, it moves secrets saved in browser mode into the keychain; browser mode can't read keychain secrets ("Unreadable secret"), so re-enter them there if you need them, or give browser mode its own folder with `STARTICA_DATA_DIR`.

## Posting sign-ins

When you sign in to a site in the [posting window](/guides/assisted-posting) (X, Hacker News, Reddit, LinkedIn, Bluesky, your Mastodon server or a Discourse forum), the site's cookies are kept in a separate browser profile, Electron's persistent partition `persist:posting`. It's separate from your normal browser and from the app's main window, and it holds only what the sites themselves store (cookies, local storage, cache). Startica never stores your passwords.

The partition is always in Electron's own profile folder, which is the default data folder above (`Startica Dev` when running from source), even if you set `STARTICA_DATA_DIR`:

| OS | Posting sign-ins |
| --- | --- |
| macOS | `~/Library/Application Support/Startica/Partitions/posting` |
| Windows | `%APPDATA%\Startica\Partitions\posting` |
| Linux | `~/.config/Startica/Partitions/posting` (or under `$XDG_CONFIG_HOME`) |

`yarn dev:desktop` has its own partition in the Startica Dev folder, so sign-ins in the installed app and in dev are separate. The desktop smoke test doesn't: it runs the posting window in a throwaway in-memory session, so it never touches your sign-ins.

### Sign out of a site

- **One site:** open a **Post…** window for that site and sign out on the site's own page, as you would in a browser.
- **All sites:** quit Startica (**Quit Startica** in the tray menu), then delete the `Partitions/posting` folder. The next **Post…** asks you to sign in again.

## Back up

A backup is a copy of the database. Pick one of two ways.

**Quit, then copy.** Choose **Quit Startica** from the tray (menu-bar) icon; closing the window is not enough, the app keeps running in the tray. Then copy `startica.db` (and `startica.db-wal` and `startica.db-shm` if they still exist) or the whole folder.

**While running, with the sqlite3 CLI.** SQLite's online backup gives a consistent single-file copy without quitting:

```bash
sqlite3 "$HOME/Library/Application Support/Startica/startica.db" ".backup '$HOME/startica-backup.db'"
```

> [!WARNING]
> Don't copy only `startica.db` while the app is running: recent changes may still be in `startica.db-wal`, and the copy can be incomplete.

To keep your ad images, also copy the `ads` folder. Without it, a restored creative keeps its settings and prompt but shows no images: upload or draw the picture again, then render it.

A backup includes the encrypted secrets, but they only decrypt on the same computer and user account (see [Moving to another computer](#moving-to-another-computer)).

## Restore

1. Quit Startica (**Quit Startica** in the tray menu).
2. In the data folder, delete `startica.db-wal` and `startica.db-shm` if present.
3. Replace `startica.db` with your backup, keeping the name `startica.db`.
4. Open Startica. Migrations bring an older backup up to the current schema.

Restore into the same or a newer version of Startica. Restoring a backup made by a newer version into an older one is untested.

## Start fresh

Quit Startica, then delete or rename the data folder (renaming keeps it as a backup). The next launch creates an empty database, a new workspace and the default AI model routing, and opens the welcome wizard, as on a first launch. See [First run](/getting-started/first-run).

To reset only a test setup, point `STARTICA_DATA_DIR` at an empty folder instead.

The keychain entry from the old install is left behind. It is harmless; Startica reuses it.

## Demo mode

In the desktop app, **Look around with a sample product first** on the welcome page restarts Startica in demo mode. See [Try the demo](/guides/demo-mode).

- The demo uses `demo/` inside the data folder (inside `STARTICA_DATA_DIR` if you set it) as its own data folder. On its first start it's filled with the Fieldnote sample product. Your own `startica.db` isn't opened.
- `startica-mode.json` in the data folder remembers the mode, so Startica starts in the demo again until you click **Leave demo**.
- No background jobs run in the demo, and **Post…** is hidden.

To start the demo over, quit Startica and delete the `demo` folder. To get out of the demo without the app (for example if it won't start), quit Startica and delete `startica-mode.json`, or change it to `{"demo":false}`.

Backups and moves only need your own `startica.db`; the `demo` folder and the mode file can be left out.

## Demo data

To load the fictional demo product, Fieldnote, into a separate folder without the desktop app (for example for a browser run), use the seed script. It makes no AI calls.

```bash
STARTICA_DATA_DIR=/tmp/startica-demo yarn seed:demo
STARTICA_DATA_DIR=/tmp/startica-demo yarn dev:desktop-web
```

`STARTICA_DATA_DIR` is required, so the demo never lands in your real data folder by accident; use an absolute path. The script refuses to run if the database already has a product. With `--force` it first deletes every product and its data (plus conversations, job and AI history), keeping settings, secrets and AI model routing.

## Moving to another computer

1. On the old computer, make a backup as above.
2. Install Startica on the new computer and open it once, then quit it.
3. Restore the backup into the new computer's data folder, with the `ads` folder if you copied it.
4. Re-enter every secret, because the old keychain key is not on the new computer:

| Secret | Where to re-enter |
| --- | --- |
| AI API keys (Anthropic, OpenAI) | Settings → General → AI → **Change keys or budget** |
| Stripe key, GA4 and Search Console service-account keys, Umami and Bing API keys | Settings → Products → Connections → **Replace key** or **Change** (Search Console, Umami) |
| Product database | Remove the **Product database** connection with its trash icon, then **Set up** again: write the SQL, run it (it sets a new password for the read-only login) and paste the connection string. See [Product database](/credentials/supabase). A view and login of your own: **Use a URL instead**. |

Until a secret is re-entered, the jobs that need it fail and the error is shown on the connection or on the System page. Everything that isn't a secret (products, intel, inbox, drafts, roadmap, content, metrics history) moves over as is. See [Settings](/reference/settings).

## Related

- [Privacy and security](/concepts/privacy-security): what leaves your computer and when.
- [Background jobs](/reference/jobs): queued jobs are stored in the database too and resume on the next launch.
