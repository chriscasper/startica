// Launches the real desktop app (isolated data folder, port and build folder),
// checks it loads, saves a secret through the OS keychain, and screenshots it.
// Usage: yarn workspace @startica/desktop smoke [screenshot-dir] [--packaged]
//   --packaged tests the built app in dist/ instead of the dev setup.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { startStandins } from "./posting-standins.mjs";
import { startStandin } from "../../../packages/core/src/a11y/standin/server.mjs";
import { startSecurityStandin } from "../../../packages/core/src/security/standin.mjs";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../../desktop-web/package.json"));
const { _electron: electron } = require("playwright");
const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const packaged = process.argv.includes("--packaged");
const outDir = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? tmpdir();
const executables = {
  darwin: "dist/mac/Startica.app/Contents/MacOS/Startica",
  win32: "dist/win-unpacked/Startica.exe",
  linux: "dist/linux-unpacked/startica",
};
const dataDir = mkdtempSync(join(tmpdir(), "startica-desktop-smoke-"));

let failed = false;
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed = true;
};

const env = { ...process.env, PORT: "58398", STARTICA_DATA_DIR: dataDir, STARTICA_NEXT_DIST: ".next-desktop-smoke" };
delete env.ELECTRON_RUN_AS_NODE; // set by editors; would start Electron as plain Node
// Exposure monitoring (security S2) talks to a stand-in, never crt.sh, OSV, EPSS or KEV.
const securityApi = await startSecurityStandin(0);
env.STARTICA_SECURITY_API_BASE = securityApi.url;
// Assisted posting goes to local stand-ins for HN, Reddit and X (dev builds only).
const standins = packaged ? null : await startStandins(58396);
if (standins) {
  env.STARTICA_POSTING_TEST_BASE = standins.base;
  env.STARTICA_POSTING_PARTITION = `posting-smoke-${Date.now()}`; // in-memory: not your real sign-ins
}
const app = await electron.launch({
  ...(packaged ? { executablePath: join(desktopDir, executables[process.platform]), args: [] } : { args: [desktopDir] }),
  env,
  timeout: 60_000,
});
try {
  const window = await app.firstWindow();
  // A fresh install opens the welcome wizard; the desktop app also offers the demo.
  await window.waitForURL(/\/welcome$/, { timeout: 240_000 });
  check(true, `app window loaded the welcome wizard ${window.url()}`);
  check((await window.title()).includes("Startica"), `window title: ${await window.title()}`);
  const offersDemo = await window
    .getByRole("button", { name: "Look around with a sample product first" })
    .waitFor({ timeout: 30_000 })
    .then(() => true, () => false);
  check(offersDemo, "the desktop app offers the demo");
  await window.getByRole("button", { name: "Skip setup" }).click();
  await window.waitForURL(/\/today$/, { timeout: 30_000 });
  check(true, "Skip setup goes to Today");

  await window.goto(window.url().replace("/today", "/settings"));
  // Saving an AI key encrypts it via the OS keychain; "saved" only shows once the server
  // decrypts it again. (A fake key: nothing in this run calls the AI.)
  await window.getByRole("button", { name: "Add API key" }).click();
  await window.getByLabel(/^Anthropic API key/).fill("sk-ant-smoke-test");
  await window.getByRole("button", { name: "Save" }).click();
  await window.getByText(/Anthropic API key: saved/).waitFor({ timeout: 20_000 });
  check(true, "secret saved and read back through the OS keychain");

  await window.screenshot({ path: join(outDir, "desktop-settings.png") });
  await window.goto(window.url().replace(/\/settings.*$/, "/today"));
  await window.waitForLoadState("networkidle");
  await window.screenshot({ path: join(outDir, "desktop-today.png") });

  if (standins) await assistedPosting(window);
  await accessibility(window);

  // Closing the window keeps the app (and its scheduled jobs) running in the tray;
  // reopening it (dock click / tray) brings the window back.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.close()));
  await new Promise((r) => setTimeout(r, 1500));
  check((await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 0, "window closed, app still running in the tray");
  const reopened = app.waitForEvent("window");
  await app.evaluate(({ app: electronApp }) => electronApp.emit("activate"));
  const again = await reopened;
  await again.waitForURL(/\/dashboard$/, { timeout: 30_000 });
  check(true, "window reopened on the Dashboard");
} catch (error) {
  check(false, `desktop smoke crashed: ${error instanceof Error ? error.message : error}`);
} finally {
  standins?.close();
  await securityApi.close();
  await app.close();
}

// Demo mode: the same app, restarted with the mode file set, opens the sample product
// from its own folder (<data>/demo), with the banner, and posting off.
if (!packaged) {
  writeFileSync(join(dataDir, "startica-mode.json"), JSON.stringify({ demo: true }));
  const demo = await electron.launch({ args: [desktopDir], env: { ...env, PORT: "58397" }, timeout: 60_000 });
  try {
    // Not firstWindow(): seeding the demo renders its ad creative in a hidden window that opens (and closes) first.
    let window = null;
    for (const deadline = Date.now() + 240_000; !window && Date.now() < deadline; await new Promise((r) => setTimeout(r, 500)))
      window = demo.windows().find((w) => /^http:\/\/[^/]+\/dashboard$/.test(w.url())) ?? null;
    if (!window) throw new Error(`the demo's window never reached the Dashboard (windows: ${demo.windows().map((w) => w.url()).join(", ") || "none"})`);
    await window.getByText("you're looking at Fieldnote").waitFor({ timeout: 30_000 });
    check(true, "demo mode opens the sample product with the demo banner");
    // The Dashboard (the start page) sums up every module for the demo product.
    await window.getByText("Needs you", { exact: true }).waitFor({ timeout: 30_000 });
    const titles = await window.locator('[data-slot="card-title"]').allInnerTexts();
    check(["Marketing", "Accessibility", "SEO & GEO", "Security", "System"].every((t) => titles.includes(t)), `the demo opens on the Dashboard with every module (${titles.join(", ")})`);
    await window.screenshot({ path: join(outDir, "desktop-dashboard.png"), fullPage: true });
    await window.goto(window.url().replace("/dashboard", "/today"));
    await window.waitForLoadState("networkidle");
    check((await window.getByText("Getting started", { exact: true }).count()) === 0, "the demo's Today has no Getting started checklist");
    await window.goto(window.url().replace("/today", "/inbox"));
    await window.waitForLoadState("networkidle");
    check((await window.getByRole("button", { name: "Post…" }).count()) === 0, "posting is off in demo mode");
    await window.goto(window.url().replace(/\/[^/]*(\?.*)?$/, "/accessibility"));
    await window.getByText("Fix these first").waitFor({ timeout: 30_000 });
    check(
      (await window.getByText(/Scans are off in the demo/).count()) > 0 && (await window.getByRole("button", { name: "Scan now" }).isDisabled()),
      "the demo shows sample accessibility results, with scanning off",
    );
    const { existsSync, readFileSync } = await import("node:fs");
    check(existsSync(join(dataDir, "demo", "startica.db")), "the demo has its own data folder");
    // Ads AD2–AD4: the demo's creative was rendered by the Electron renderer (hidden window,
    // exact pixel sizes), and its running campaign has results with stop and scale suggestions.
    {
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(join(dataDir, "demo", "startica.db"), { readOnly: true });
      const creative = db.prepare("select id, campaign_id, status, error, renders from ad_creatives where status = 'ready'").get();
      db.close();
      const renders = creative ? JSON.parse(creative.renders) : [];
      const sizes = renders.map((r) => {
        const data = readFileSync(join(dataDir, "demo", "ads", "creatives", creative.id, r.file));
        return data[0] === 0x89 ? `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}` : `jpeg:${r.width}x${r.height}`;
      });
      check(sizes.join(",") === "1080x1350,1080x1080", `ads: the Electron renderer drew the demo creative at Reddit's sizes (${sizes.join(", ") || "none"})`);
      if (creative) {
        await window.goto(window.url().replace(/\/[^/]*(\?.*)?$/, `/ads/${creative.campaign_id}/results`));
        const title = window.locator('[data-slot="card-title"]', { hasText: "What to do next" });
        await title.waitFor({ timeout: 30_000 });
        const next = await title.locator("xpath=ancestor::*[@data-slot='card'][1]").innerText();
        check(/Scale/.test(next) && /Stop/.test(next), `ads: the demo's results suggest scaling one ad and stopping the other (${next.replace(/\s+/g, " ").slice(0, 120)})`);
      }
    }
  } catch (error) {
    check(false, `demo smoke crashed: ${error instanceof Error ? error.message : error}`);
  } finally {
    await demo.close();
  }
}
rmSync(dataDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

// --- Assisted posting (ARCHITECTURE.md 8.4) ----------------------------------------------------
// Seeds a drafted reply per site, clicks Post… in the Inbox, checks the posting window
// filled it in and sent nothing, then plays the user pressing the site's button and
// checks the post was recorded with its link.

/**
 * Accessibility (ARCHITECTURE.md section 9): the Electron scanner checks the stand-in site (known
 * failures per page) in its hidden scan windows; works in dev and in the packaged app,
 * which proves axe-core ships with the server.
 */
async function accessibility(window) {
  const site = await startStandin(58395);
  const problems = [];
  window.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  window.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  try {
    const base = window.url().replace(/\/[^/]*$/, "");
    await window.goto(`${base}/settings?tab=products`);
    await window.getByRole("button", { name: "Add product" }).click();
    await window.getByLabel("Name").fill("Stand-in Co");
    await window.getByLabel("Website").fill(site.url);
    await window.getByRole("button", { name: "Add product" }).last().click();
    await window.getByText("Stand-in Co").first().waitFor({ timeout: 30_000 }); // saved, and now the active product
    await window.goto(`${base}/accessibility`);
    await window.waitForLoadState("networkidle");
    await window.getByRole("button", { name: /Add the site/ }).click();
    await window.getByLabel("Start address").fill(site.url);
    await window.getByLabel("I own this site or am allowed to test it").check();
    await window.getByRole("button", { name: "Add site" }).last().click();
    await window.getByRole("button", { name: "Scan now" }).click();
    await window.locator("table").last().getByText(/^(done|failed)$/).first().waitFor({ timeout: 180_000 });
    await window.reload();
    const card = await window.getByText("Open issues", { exact: true }).locator("..").innerText();
    await window.getByText("Fix these first").waitFor({ timeout: 15_000 });
    await window.screenshot({ path: join(outDir, "desktop-accessibility.png"), fullPage: true });
    if (!/Open issues\s*7\b/.test(card)) {
      const db = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
      console.log("accessibility pages:", db.prepare("select url, state, error from site_pages").all(), db.prepare("select status, error from site_scans").all());
      db.close();
    }
    check(/Open issues\s*7\b/.test(card), `accessibility: the Electron scanner finds the stand-in site's 7 planted issues (${card.replace(/\s+/g, " ")})`);
    {
      // A2: the Electron scanner takes screenshots of pages with issues (Chromium's own command, beyond the visible area).
      const shotDb = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
      const shots = shotDb.prepare("select url, screenshot, screenshot_size as size from site_pages where screenshot is not null").all();
      const boxes = shotDb.prepare("select count(*) as n from a11y_occurrences where box is not null").get().n;
      shotDb.close();
      check(shots.length >= 4 && boxes > 0, `accessibility: the Electron scanner saves screenshots of pages with issues (${shots.length}) and element positions (${boxes})`);
    }
    {
      // A5: the Electron scanner returns each page's main text, so spelling and readability are checked.
      const contentDb = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
      const words = contentDb.prepare("select key from site_findings where kind = 'spelling'").all().map((r) => r.key);
      const graded = contentDb.prepare("select count(*) as n from site_pages where readability is not null").get().n;
      contentDb.close();
      check(words.includes("recieve") && graded > 0, `accessibility: the Electron scanner's page text reaches the spelling and readability checks (${words.join(", ")}; ${graded} graded)`);
    }
    {
      // A4: the printable report renders on the app's own session (the launch cookie) and prints to PDF, as Save as PDF does.
      const reportDb = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
      const siteRow = reportDb.prepare("select id from sites limit 1").get();
      reportDb.close();
      const bytes = await app.evaluate(async ({ BrowserWindow, session }, url) => {
        const win = new BrowserWindow({ show: false, webPreferences: { session: session.defaultSession } });
        try {
          await win.loadURL(url);
          const title = await win.webContents.executeJavaScript("document.title");
          const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: "A4" });
          return title.startsWith("Accessibility report") ? pdf.length : -1;
        } finally {
          win.destroy();
        }
      }, `${base}/accessibility/report/print?site=${siteRow.id}`);
      check(bytes > 1000, `accessibility: the printable report renders on the app's session and prints to PDF (${bytes} bytes)`);
    }
    const hidden = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isVisible()).length);
    check(hidden <= 2, `accessibility: at most two hidden scan windows (${hidden})`);

    // Security: the Electron scanner passes the pages' response headers through, so a
    // verified rescan finds the stand-in's planted problems (the same 11 as the browser smoke).
    await window.goto(`${base}/security`);
    await window.getByRole("button", { name: "Verify" }).click();
    await window.getByRole("button", { name: "Scan now" }).click({ timeout: 15_000 });
    const db = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
    let open = 0;
    for (let i = 0; i < 90 && open < 11; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      open = db.prepare("select count(*) as n from security_findings where status = 'open' and source = 'scan'").get().n;
    }
    const keys = db.prepare("select group_key from security_findings where status = 'open' and source = 'scan' order by group_key").all().map((r) => r.group_key);
    db.close();
    check(open === 11 && keys.includes("server-version:x-powered-by:standin/1.2") && keys.includes("exposed-git"), `security: the Electron scanner's headers reach the checks (${open} open: ${keys.join(", ")})`);
  } catch (error) {
    await window.screenshot({ path: join(outDir, "desktop-accessibility-failed.png"), fullPage: true }).catch(() => {});
    console.log("accessibility problems:", problems, await window.locator("[data-sonner-toast]").allInnerTexts().catch(() => []));
    const db = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
    console.log("products:", db.prepare("select name, url from products").all(), "sites:", db.prepare("select name, start_url from sites").all(), "url:", window.url());
    db.close();
    throw error;
  } finally {
    await site.close();
  }
}

async function poll(fn, { tries = 60, ms = 500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const value = await fn();
    if (value != null && value !== false) return value;
    await new Promise((r) => setTimeout(r, ms));
  }
  return null;
}

function seedPostingCases() {
  const db = new DatabaseSync(join(dataDir, "startica.db"));
  const workspaceId = db.prepare("select id from workspaces").get().id;
  const now = Date.now();
  const insert = (table, row) => {
    const values = { id: crypto.randomUUID(), workspace_id: workspaceId, created_at: now, updated_at: now, ...row };
    db.prepare(`insert into ${table} (${Object.keys(values).join(",")}) values (${Object.keys(values).map(() => "?").join(",")})`).run(...Object.values(values));
    return values.id;
  };
  const productId = insert("products", { name: "Fieldnote", url: "https://fieldnote.example", goal_ladder: "[]" });
  const cases = [
    { site: "hackernews", title: "Ask HN: smoke test thread", url: "https://news.ycombinator.com/item?id=4242", externalId: "4242", kind: "post", box: 'form[action="comment"] textarea[name="text"]', press: 'form[action="comment"] input[type="submit"]', expect: "https://news.ycombinator.com/item?id=9001" },
    { site: "reddit", title: "Reddit smoke thread", url: "https://www.reddit.com/r/test/comments/abc123/hello/c0mm3nt/", externalId: "t1_c0mm3nt", kind: "comment", box: ".thing.id-t1_c0mm3nt > .child textarea", press: ".child .save", expect: "https://www.reddit.com/r/test/comments/abc123/hello/newc0m/" },
    { site: "x", title: "X smoke post", url: "https://x.com/someone/status/1844", externalId: "1844", kind: "post", box: "#composer", press: "#post", expect: "https://x.com/i/status/1844999" },
    { site: "linkedin", title: "LinkedIn smoke post", url: "https://www.linkedin.com/feed/update/urn:li:activity:7000/", externalId: "urn:li:activity:7000", kind: "post", box: "[role=textbox]", press: "#comment", expect: `https://www.linkedin.com/feed/update/urn:li:activity:7000/?commentUrn=${encodeURIComponent("urn:li:comment:(activity:7000,7123)")}` },
    { site: "bluesky", title: "Bluesky smoke post", url: "https://bsky.app/profile/a.test/post/3abc", externalId: "at://did:plc:a/app.bsky.feed.post/3abc", kind: "post", box: "[data-testid=composePostView] [contenteditable]", press: "[data-testid=composerPublishBtn]", expect: "https://bsky.app/profile/did:plc:me/post/3new" },
    { site: "mastodon", title: "Mastodon smoke post", url: "https://mastodon.social/@a@mastodon.world/999", externalId: "https://mastodon.world/users/a/statuses/117", kind: "post", box: ".compose-form textarea", press: ".compose-form__submit button", expect: "https://mastodon.example/@me/777", prefix: "@a@mastodon.world " },
    { site: "discourse", title: "Discourse smoke topic", url: "https://forum.example.com/t/a-topic/12", externalId: "forum.example.com/:p1", kind: "post", box: ".d-editor-input", press: "#send", expect: `${standins.base}/t/a-topic/12/2` },
  ];
  // Mastodon posts from the user's own server.
  db.prepare("insert into settings (key, value, updated_at) values (?, ?, ?)").run("posting", JSON.stringify({ mastodonServer: "mastodon.example" }), now);
  for (const c of cases) {
    const conversationId = insert("conversations", { channel: c.site, external_id: c.externalId, url: c.url, kind: c.kind, title: c.title, body: "A question worth answering.", origin: "manual" });
    c.opportunityId = insert("opportunities", { product_id: productId, conversation_id: conversationId, status: "drafted" });
    c.body = `Smoke-test reply for ${c.site}: "quotes" & <brackets> stay intact.`;
    insert("drafts", { opportunity_id: c.opportunityId, version: 1, body: c.body, mentions_product: 0, source: "ai" });
  }
  // A Content Studio piece: a new Hacker News text post.
  const piece = {
    id: insert("content_pieces", { product_id: productId, channel: "hackernews", format: "post", topic: "Smoke-test piece", title: "Show HN: Smoke test", body: "A text post from Content Studio.", status: "draft" }),
    expect: "https://news.ycombinator.com/item?id=9002",
  };
  // New posts on sites where the composer is a rich editor, and a forum that holds new topics for a moderator.
  insert("communities", { product_id: productId, channel: "discourse", name: "Fieldnote Forum", url: "https://forum.example.com", status: "watching" });
  const newPosts = [
    { topic: "Smoke-test Bluesky piece", channel: "bluesky", title: null, body: "A short post from Content Studio.", box: "[data-testid=composePostView] [contenteditable]", press: "[data-testid=composerPublishBtn]", expect: "https://bsky.app/profile/did:plc:me/post/3new" },
    { topic: "Smoke-test Discourse piece", channel: "discourse", title: "A new topic", body: "A forum topic from Content Studio.", box: ".d-editor-input", press: "#create", expect: null },
  ].map((p) => ({ ...p, id: insert("content_pieces", { product_id: productId, channel: p.channel, format: "post", topic: p.topic, title: p.title, body: p.body, status: "draft" }) }));
  db.close();
  return { cases, piece, newPosts };
}

/** Runs code in the posting window's site page (null while there's none or it's loading). */
function inPostingWindow(code) {
  return app.evaluate(async (_electron, js) => {
    const wc = globalThis.__starticaPosting?.siteContents();
    if (!wc || wc.isLoading()) return null;
    try {
      return await wc.executeJavaScript(js);
    } catch {
      return null;
    }
  }, code);
}

async function assistedPosting(window) {
  const { cases, piece, newPosts } = seedPostingCases();
  const appUrl = new URL(window.url()).origin;
  for (const c of cases) {
    await window.goto(`${appUrl}/inbox`);
    const card = window.locator('[data-slot="card"]').filter({ hasText: c.title });
    await card.getByRole("button", { name: "Post…" }).click();
    // Text boxes have a value; rich editors (LinkedIn, Bluesky, Discourse) have text content.
    const read = `((el) => (el ? (el.isContentEditable ? el.innerText.trim() : el.value) : null) || null)(document.querySelector(${JSON.stringify(c.box)}))`;
    const filled = await poll(() => inPostingWindow(read));
    check(filled === `${c.prefix ?? ""}${c.body}`, `${c.site}: posting window filled in the reply`);
    check(standins.posts[c.site] === 0, `${c.site}: nothing was sent before the user pressed the button`);
    if (c.site === "hackernews") {
      // What the user sees: the Startica bar above the site, before pressing the button.
      await new Promise((r) => setTimeout(r, 500));
      const shots = await app.evaluate(async () => {
        const p = globalThis.__starticaPosting;
        const [bar, site] = await Promise.all([p.barContents().capturePage(), p.siteContents().capturePage()]);
        return { bar: bar.toPNG().toString("base64"), site: site.toPNG().toString("base64") };
      });
      writeFileSync(join(outDir, "desktop-posting-bar.png"), Buffer.from(shots.bar, "base64"));
      writeFileSync(join(outDir, "desktop-posting-site.png"), Buffer.from(shots.site, "base64"));
    }

    // The user edits it a little on the page and presses the site's own button.
    const edited = `${c.body} (edited on the page)`;
    await inPostingWindow(`(() => { const el = document.querySelector(${JSON.stringify(c.box)}); if (el.isContentEditable) el.textContent = ${JSON.stringify(edited)}; else el.value = ${JSON.stringify(edited)}; document.querySelector(${JSON.stringify(c.press)}).click(); return true; })()`);
    const row = await poll(() => {
      const db = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
      const found = db.prepare("select url, body from publications where opportunity_id = ?").get(c.opportunityId);
      db.close();
      return found ?? null;
    });
    check(row?.url === c.expect, `${c.site}: post recorded with its link (${row?.url})`);
    check(row?.body === edited, `${c.site}: the text actually posted was recorded`);
  }
  // Content Studio: a new post, with the title and text filled in.
  const sentBefore = standins.posts.hackernews;
  await window.goto(`${appUrl}/content?tab=library`);
  await window.locator('[data-slot="card"]').filter({ hasText: "Smoke-test piece" }).getByRole("button", { name: "Post…" }).click();
  const fields = await poll(() => inPostingWindow(`(() => { const f = document.querySelector('form[action="/r"]'); return f && f.title.value ? [f.title.value, f.text.value].join("|") : null; })()`));
  check(fields === "Show HN: Smoke test|A text post from Content Studio.", "content piece: title and text filled in");
  check(standins.posts.hackernews === sentBefore, "content piece: nothing was sent before the user pressed the button");
  await inPostingWindow(`document.querySelector('form[action="/r"] input[type="submit"]').click(), true`);
  const pieceUrl = await poll(() => {
    const db = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
    const row = db.prepare("select status, posted_url from content_pieces where id = ?").get(piece.id);
    db.close();
    return row?.status === "posted" ? row.posted_url : null;
  });
  check(pieceUrl === piece.expect, `content piece: marked posted with its link (${pieceUrl})`);

  for (const p of newPosts) {
    await window.goto(`${appUrl}/content?tab=library`);
    await window.locator('[data-slot="card"]').filter({ hasText: p.topic }).getByRole("button", { name: "Post…" }).click();
    const read = `((el) => (el ? (el.isContentEditable ? el.innerText.trim() : el.value) : null) || null)(document.querySelector(${JSON.stringify(p.box)}))`;
    check((await poll(() => inPostingWindow(read))) === p.body, `${p.channel} new post: filled in`);
    await inPostingWindow(`document.querySelector(${JSON.stringify(p.press)}).click(), true`);
    const row = await poll(() => {
      const db = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
      const found = db.prepare("select status, posted_url from content_pieces where id = ?").get(p.id);
      db.close();
      return found?.status === "posted" ? found : null;
    });
    check(row?.posted_url === p.expect, p.expect ? `${p.channel} new post: marked posted with its link (${row?.posted_url})` : `${p.channel} new post held for a moderator: marked posted without a link`);
  }

  await window.goto(`${appUrl}/inbox?tab=posted`);
  await window.waitForLoadState("networkidle");
  await window.screenshot({ path: join(outDir, "desktop-inbox-posted.png") });
}
