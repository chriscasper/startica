// End-to-end smoke test in a real browser (Playwright), against an isolated
// server: temporary data folder, port 58399, its own build folder. Never touches
// your real Startica data. Usage: yarn smoke
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startStandin } from "../../../packages/core/src/a11y/standin/server.mjs";
import { startTrackerStandin, STANDIN_TOKEN } from "../../../packages/core/src/trackers/standin.mjs";
import { startGoogleStandin, testServiceAccount } from "../../../packages/core/src/search/standin.mjs";
import { startUmamiStandin, UMAMI_STANDIN_KEY, UMAMI_STANDIN_SITE } from "../../../packages/core/src/metrics/umami-standin.mjs";
import { startSecurityStandin } from "../../../packages/core/src/security/standin.mjs";

const dataDir = mkdtempSync(join(tmpdir(), "startica-smoke-"));
process.env.STARTICA_NEXT_DIST = ".next-smoke";
// The Umami stand-in has no rate limit: a 90-day first sync takes seconds, not minutes.
process.env.STARTICA_UMAMI_GAP_MS = "0";
// Search Console calls go to a stand-in with a throwaway service account (ARCHITECTURE.md 10.2).
const googleAccount = testServiceAccount();
const googleApi = await startGoogleStandin(0, { publicKey: googleAccount.publicKey, clientEmail: googleAccount.key.client_email });
process.env.STARTICA_GOOGLE_API_BASE = googleApi.url;
// Exposure monitoring (security S2) talks to a stand-in for crt.sh, OSV, EPSS and KEV, never the real services.
const securityApi = await startSecurityStandin(0);
process.env.STARTICA_SECURITY_API_BASE = securityApi.url;
const { startServer } = await import("../server.mjs");
// Requests to a route the dev server hasn't compiled yet wait for the compile, which
// takes over 30 s (Playwright's default) on slow CI runners.
const FIRST_REQUEST = { timeout: 120_000 };

let failed = false;
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed = true;
};

const server = await startServer({ port: 58399, dataDir });
const standin = await startStandin(58395); // accessibility stand-in site (ARCHITECTURE.md 9.2)
const trackerApi = await startTrackerStandin(0); // stand-in GitHub / GitLab issue APIs
const umamiApi = await startUmamiStandin(0); // stand-in Umami API
const browser = await chromium.launch();
try {
  const blocked = await fetch(`${server.url}/today`, { redirect: "manual" });
  check(blocked.status === 401, `request without the session token is refused (${blocked.status})`);

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(FIRST_REQUEST.timeout); // page.goto to an uncompiled route waits the same way
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // A fresh install opens the welcome wizard.
  await page.goto(`${server.url}/?token=${server.token}`);
  await page.waitForURL(/\/welcome$/, { timeout: 120_000 });
  check(true, "token link opens the app, on the welcome wizard (nothing set up yet)");

  // Step 1: pick an AI provider and paste its key (skipped here: no real AI in a smoke run).
  await page.getByText("Connect AI", { exact: true }).waitFor();
  await page.getByRole("radio", { name: "OpenAI" }).check();
  check((await page.getByLabel("OpenAI API key").count()) === 1, "the key step offers Claude or OpenAI and asks for the chosen provider's key");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByLabel("Product name").fill("Smoke Test Co");
  await page.getByLabel("Website").fill("example.com");
  const buildIntel = page.getByRole("checkbox", { name: /Start building intel now/ });
  if (await buildIntel.isVisible().catch(() => false)) await buildIntel.uncheck(); // no real AI research in a smoke run
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("A few extras", { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByLabel(/Your Mastodon server/).fill("mastodon.social");
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL(/\/today$/, { timeout: 30_000 });
  await page.getByText("Getting started").waitFor({ timeout: 30_000 });
  check((await page.getByText("Smoke Test Co").count()) > 0, "the wizard adds the product and lands on Today's Getting started checklist");

  // Checklist: once intel is ready, the strongest suggestions come pre-ticked. (Seeded:
  // no real intel build here; the product has no brief, so the scan it queues reads nothing.)
  {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(dataDir, "startica.db"));
    const product = db.prepare("select id, workspace_id from products where name = ?").get("Smoke Test Co");
    db.prepare("update products set intel_status = 'ready' where id = ?").run(product.id);
    const now = Date.now();
    for (const [channel, name] of [["reddit", "smoketest"], ["reddit", "smoketest2"], ["hackernews", "Show HN"]]) {
      db.prepare("insert into communities (id, workspace_id, product_id, channel, name, why, promo_rules, status, source, created_at, updated_at) values (?, ?, ?, ?, ?, '', '', 'suggested', 'ai', ?, ?)").run(crypto.randomUUID(), product.workspace_id, product.id, channel, name, now, now);
    }
    db.close();
    await page.goto(`${server.url}/today`);
    await page.getByRole("button", { name: "Review suggestions" }).click();
    await page.getByRole("button", { name: "Watch 2 communities" }).click();
    await page.getByText("Watching them").first().waitFor({ timeout: 15_000 });
    const check2 = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
    const watching = check2.prepare("select name from communities where status = 'watching' order by name").all().map((r) => r.name);
    check2.close();
    check(JSON.stringify(watching) === JSON.stringify(["smoketest", "smoketest2"]), `checklist pre-ticks the readable suggestions and watches them (${watching.join(", ")})`);
  }

  // The wizard doesn't come back once finished.
  await page.goto(`${server.url}/settings?tab=channels`);
  await page.waitForURL(/\/settings/);
  check((await page.getByText("Mastodon server: mastodon.social").count()) > 0, "extras from the wizard are saved (Settings → Channels shows the Mastodon server)");

  await page.goto(`${server.url}/settings?tab=products`);
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByLabel("Name").fill("Second Co");
  await page.getByLabel("Website").fill("https://example.org");
  await page.getByRole("button", { name: "Add product" }).last().click();
  await page.getByText("Second Co").first().waitFor({ timeout: 30_000 });
  check(true, "a product can be added in Settings");

  // "Run setup again" (Settings → General) with products saved: the wizard never offers to add another.
  await page.goto(`${server.url}/settings`);
  await page.getByRole("button", { name: "Run setup again" }).click();
  await page.waitForURL(/\/welcome$/);
  await page.getByRole("button", { name: "Skip for now" }).click(); // no key saved, so the AI step comes first
  await page.getByText("A few extras", { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByText("Connect AI", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByText("A few extras", { exact: true }).waitFor();
  check((await page.getByLabel("Product name").count()) === 0, "Run setup again skips the product step when a product exists");
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL(/\/today$/);

  for (const route of ["/", "/dashboard", "/today", "/welcome", "/inbox", "/content", "/roadmap", "/intel", "/analytics", "/analytics?tab=traffic", "/analytics?tab=conversions", "/analytics?tab=revenue", "/analytics?tab=startica&range=90", "/accessibility", "/accessibility/issues", "/accessibility/pages", "/accessibility/content", "/accessibility/documents", "/seo", "/seo/health", "/seo/search", "/seo/ai", "/seo/opportunities", "/seo/agents", "/seo/offsite", "/ads", "/security", "/settings", "/settings?tab=products", "/settings?tab=channels", "/system"]) {
    const res = await page.goto(`${server.url}${route}`);
    await page.waitForLoadState("networkidle");
    const crashed = await page.getByText(/Application error|Unhandled Runtime Error/).count();
    check(res?.status() === 200 && crashed === 0, `${route} renders (${res?.status()})`);
  }

  // Ads: a planned campaign (seeded: the smoke has no AI key) shows its checks and downloads paused for import.
  {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(dataDir, "startica.db"));
    const product = db.prepare("select id, workspace_id from products where name = ?").get("Smoke Test Co");
    const now = Date.now();
    const [campaignId, groupId, adId] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    db.prepare("insert into ad_campaigns (id, workspace_id, product_id, platform, name, goal, landing_url, monthly_budget, test_budget, test_days, summary, status, utm_campaign, created_at, updated_at) values (?, ?, ?, 'google', 'Smoke search', 'Signups', 'https://example.com/', 300, 140, 14, 'A small search test.', 'draft', 'smoke-search', ?, ?)").run(campaignId, product.workspace_id, product.id, now, now);
    db.prepare("insert into ad_groups (id, workspace_id, campaign_id, name, angle, targeting, position, created_at, updated_at) values (?, ?, ?, 'Notes app', 'People looking for one', ?, 0, ?, ?)").run(groupId, product.workspace_id, campaignId, JSON.stringify({ keywords: [{ text: "notes app", match: "phrase" }] }), now, now);
    const copy = { headlines: ["Notes for teams", "This headline is much longer than thirty", "Try it free"], descriptions: ["One.", "Two."] };
    db.prepare("insert into ads (id, workspace_id, group_id, copy, source, status, created_at, updated_at) values (?, ?, ?, ?, 'ai', 'ready', ?, ?)").run(adId, product.workspace_id, groupId, JSON.stringify(copy), now, now);
    db.close();
    await page.goto(`${server.url}/ads/${campaignId}`);
    await page.getByText("40 characters: the limit is 30.").waitFor({ timeout: 15_000 });
    const blocked = (await page.getByText(/Fix 1 problem marked in red first/).count()) > 0;
    const res = await page.request.get(`${server.url}/ads/${campaignId}/export/google`, FIRST_REQUEST);
    const text = new TextDecoder("utf-16le").decode((await res.body()).subarray(2));
    check(
      blocked && res.ok() && /\tPaused\t/.test(text) && text.includes(`utm_content=${adId}`) && text.includes("notes app\tPhrase"),
      "Ads: a campaign shows copy over the limit and downloads a paused Google Ads Editor file with tagged links",
    );

    // AD2: upload a picture (no AI key here), render every Google size offscreen, download one.
    await page.goto(`${server.url}/ads/${campaignId}/creatives`);
    await page.getByRole("button", { name: "New creative" }).click();
    await page.getByLabel("Upload my own").check();
    const shot = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 800, height: 800 } });
    await page.getByLabel(/^Image/).setInputFiles({ name: "picture.png", mimeType: "image/png", buffer: shot });
    await page.getByLabel("Headline").fill("Notes for teams");
    await page.getByLabel("Button (optional)").fill("Try it free");
    await page.getByRole("button", { name: "Render" }).click();
    await page.getByText("Ready", { exact: true }).waitFor({ timeout: 60_000 });
    const downloads = await page.locator('a[download][href*="/ads/creatives/"]').count();
    const href = await page.locator('a[download][href*="/1.91x1."]').getAttribute("href");
    const png = Buffer.from(await (await page.request.get(`${server.url}${href}`, FIRST_REQUEST)).body());
    const size = png[0] === 0x89 ? `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}` : "not a PNG";
    check(downloads === 4 && size === "1200x628", `Ads AD2: an uploaded picture renders in Google's four sizes (${downloads}; 1.91:1 is ${size})`);

    // AD3: spend entered by hand shows on Results.
    await page.goto(`${server.url}/ads/${campaignId}/results`);
    await page.getByRole("button", { name: "Enter spend" }).click();
    await page.getByLabel("Amount spent").fill("42");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("Spend entered").waitFor();
    await page.getByRole("cell", { name: "42.00" }).first().waitFor({ timeout: 15_000 });
    check((await page.getByText(/Last 7 days: 42\.00 spent/).count()) > 0, "Ads AD3: spend entered by hand shows on Results and in the weekly read-out");
  }

  // Search Console: connect with a service account key, sync, and see queries with their flags.
  {
    await page.goto(`${server.url}/settings?tab=products`);
    const row = page.locator("div.rounded-lg.border").filter({ has: page.getByRole("heading", { name: "Google Search Console", exact: true }) });
    await row.getByRole("button", { name: "Connect" }).click();
    await page.getByLabel("Property", { exact: true }).fill("example.com");
    await page.getByLabel("Service account key").fill(googleAccount.json);
    await page.getByRole("button", { name: "Save and sync" }).click();
    await row.getByText("Connected", { exact: true }).waitFor({ timeout: 60_000 });
    await page.goto(`${server.url}/seo/search`);
    const query = page.getByRole("row", { name: /field notes app/ });
    await query.waitFor({ timeout: 15_000 });
    const queryText = await query.innerText();
    const sitemap = await page.getByText("https://example.com/sitemap.xml").count();
    await page.screenshot({ path: join(tmpdir(), "startica-smoke-search.png"), fullPage: true });
    check(/Striking distance/.test(queryText) && sitemap > 0, `Search: Search Console syncs through a service account and flags striking-distance queries (${queryText.replace(/\s+/g, " ").slice(0, 80)})`);
  }

  // AI visibility: questions are added by hand (no AI key in a smoke run, so Run stays off).
  {
    await page.goto(`${server.url}/seo/ai`);
    await page.getByRole("button", { name: "Add a question" }).first().click();
    await page.getByLabel("Question", { exact: true }).fill("What's a good app for taking field notes without signal?");
    await page.getByLabel("Topic (optional)").fill("offline notes");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const row = page.getByRole("row", { name: /field notes without signal/ });
    await row.waitFor({ timeout: 15_000 });
    const rowText = await row.innerText();
    const runDisabled = await page.getByRole("button", { name: "Run now" }).isDisabled();
    check(/Not asked yet/.test(rowText) && /offline notes/.test(rowText) && runDisabled, "AI visibility: a question can be added, and Run waits for an AI key");
  }

  // Umami: connect with an API key, sync, and the Analytics page reads it like GA4.
  {
    await page.goto(`${server.url}/settings?tab=products`);
    const row = page.locator("div.rounded-lg.border").filter({ has: page.getByRole("heading", { name: "Umami", exact: true }) });
    await row.getByRole("button", { name: "Connect" }).click();
    await page.getByLabel("Server", { exact: true }).fill(umamiApi.url);
    await page.getByLabel("Website ID", { exact: true }).fill(UMAMI_STANDIN_SITE);
    await page.getByLabel("API key", { exact: true }).fill(UMAMI_STANDIN_KEY);
    await page.getByRole("button", { name: "Save and sync" }).click();
    await row.getByText("Connected", { exact: true }).waitFor({ timeout: 120_000 });
    await page.goto(`${server.url}/analytics`);
    await page.getByText("All traffic, from Umami.").waitFor({ timeout: 15_000 });
    const sessions = await page.locator("[data-slot=card]").filter({ hasText: /^Visits \(30d\)/ }).innerText();
    check(/600/.test(sessions), `Umami: connects with an API key and fills Analytics like GA4 (${sessions.replace(/\s+/g, " ")})`);
    await page.getByRole("link", { name: "Traffic", exact: true }).click();
    const countries = await page.locator("[data-slot=card]").filter({ has: page.getByText("Countries", { exact: true }) }).innerText();
    check(/United States/.test(countries) && /330/.test(countries), `Umami: the Traffic tab splits visits by country (${countries.replace(/\s+/g, " ").slice(0, 80)})`);
  }

  // A scan under way shows in the header on every page and on the Scan button. Seeded
  // as a scheduled scan (covers every product) reading Reddit, its lease far ahead so the
  // runner leaves it alone. Started 4.5 minutes ago: exactly 4 would show "3 min" when the
  // page renders before the 4 minutes are up.
  {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(dataDir, "startica.db"));
    const { workspace_id } = db.prepare("select workspace_id from products limit 1").get();
    // The scan the checklist started may still be reading Reddit; take it off the queue so only the seeded one shows.
    db.prepare("delete from jobs where queue = 'listen_scan'").run();
    const now = Date.now();
    const jobId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const payload = JSON.stringify({ workspaceId: workspace_id });
    db.prepare("insert into jobs (id, workspace_id, queue, payload, status, attempts, run_after, locked_until, created_at, updated_at) values (?, ?, 'listen_scan', ?, 'running', 1, ?, ?, ?, ?)").run(jobId, workspace_id, payload, now, now + 3600_000, now, now);
    db.prepare("insert into job_runs (id, workspace_id, job_id, queue, attempt, status, payload, result, started_at, created_at, updated_at) values (?, ?, ?, 'listen_scan', 1, 'running', ?, ?, ?, ?, ?)").run(runId, workspace_id, jobId, payload, JSON.stringify({ progress: { channel: "reddit" } }), now - 4.5 * 60_000, now, now);
    await page.goto(`${server.url}/inbox`);
    // The header's status indicator: a pill while anything runs; hovering lists each task, why it runs, and Stop.
    // (The Inbox's own Searching control is a popover too.)
    const pill = page.locator('[data-slot="popover-trigger"]').filter({ hasNotText: /Search|All sources off/ });
    await pill.waitFor({ timeout: 15_000 }).catch(() => {});
    const scanButton = page.getByRole("button", { name: "Scanning…" });
    check((await pill.count()) === 1 && (await scanButton.isDisabled()), "a running scan shows the status indicator and disables Scan now");
    await pill.hover();
    const popover = page.locator('[data-slot="popover-content"]');
    const row = popover.locator("li").filter({ hasText: "Finding conversations on Reddit" });
    await row.waitFor({ timeout: 5_000 }).catch(() => {});
    const rowText = (await row.count()) ? await row.innerText() : "";
    check(/Running 4 min/.test(rowText) && /Scheduled: runs every hour/.test(rowText), `hovering the indicator shows what's running, for how long and why (${rowText.replace(/\s+/g, " ").slice(0, 120)})`);
    await page.screenshot({ path: join(tmpdir(), "startica-smoke-scanning.png") });
    await row.getByRole("button", { name: "Stop finding conversations on Reddit" }).click();
    await row.waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    const stopped = db.prepare("select count(*) as n from jobs where id = ?").get(jobId).n === 0;
    check(stopped && (await row.count()) === 0, "Stop in the indicator stops the job and takes it off the list");
    db.prepare("delete from job_runs where id = ?").run(runId);
    db.prepare("delete from jobs where id = ?").run(jobId);
    db.close();
    await page.goto(`${server.url}/inbox`);
    await page.getByRole("button", { name: "Scan now" }).waitFor({ timeout: 15_000 });
    check((await page.getByText(/Finding conversations/).count()) === 0, "the scan is gone from the indicator once it's done");
  }

  // Inbox → Scoring: the thresholds save.
  await page.goto(`${server.url}/inbox`);
  await page.getByRole("button", { name: "Scoring" }).click();
  await page.getByLabel("Relevance").fill("50");
  await page.getByText("Also nearby: your audience talking about a related problem.").waitFor({ timeout: 5_000 });
  await page.screenshot({ path: join(tmpdir(), "startica-smoke-scoring.png") });
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText(/^Saved\./).waitFor({ timeout: 15_000 });
  {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
    const saved = db.prepare("select count(*) n from products where relevance_threshold = 0.5").get();
    db.close();
    check(saved.n === 1, "Inbox → Scoring saves the relevance threshold");
  }

  // Inbox → Searching: pause the hourly search, turn Reddit off, resume.
  {
    await page.goto(`${server.url}/inbox`);
    await page.getByRole("button", { name: "Searching hourly" }).click();
    await page.getByRole("button", { name: "Until I resume" }).click();
    await page.getByText(/The hourly search for .* is paused until you resume it/).waitFor({ timeout: 15_000 });
    // The popover stays open after pausing; open it again only if it closed.
    await page.getByRole("button", { name: "Search paused" }).waitFor({ timeout: 15_000 });
    if (!(await page.getByRole("checkbox", { name: /^Reddit/ }).isVisible())) await page.getByRole("button", { name: "Search paused" }).click();
    await page.getByRole("checkbox", { name: /^Reddit/ }).uncheck();
    await page.getByText("Reddit is off").waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: "Resume" }).click();
    await page.getByRole("button", { name: "Searching, 1 off" }).waitFor({ timeout: 15_000 });
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(dataDir, "startica.db"), { readOnly: true });
    const saved = JSON.parse(db.prepare("select value from settings where key like 'listening:%'").get()?.value ?? "{}");
    db.close();
    check(saved.paused === false && saved.channels?.join() === "reddit", `Inbox → Searching pauses and resumes the hourly search and turns single sources off (${JSON.stringify(saved)})`);
    // Back on, for the rest of the run.
    await page.getByRole("checkbox", { name: /^Reddit/ }).check();
    await page.getByText("Reddit is searched again").waitFor({ timeout: 15_000 });
    await page.keyboard.press("Escape");
  }

  // Accessibility: add the stand-in site, scan it through the UI (Playwright backend in
  // browser mode) and find exactly its planted failures.
  {
    await page.goto(`${server.url}/accessibility`);
    await page.getByRole("button", { name: /Add the site/ }).click();
    await page.getByLabel("Name").fill("Stand-in site");
    await page.getByLabel("Start address").fill(standin.url);
    await page.getByLabel("I own this site or am allowed to test it").check();
    await page.getByRole("button", { name: "Add site" }).last().click();
    await page.getByRole("button", { name: "Scan now" }).click();
    // Done when the scans table shows it finished (about 10 seconds for 8 pages).
    await page.locator("table").last().getByText("done", { exact: true }).first().waitFor({ timeout: 120_000 });
    await page.reload();
    const openIssues = await page.getByText("Open issues", { exact: true }).locator("..").innerText();
    await page.getByText("Fix these first").waitFor({ timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: join(tmpdir(), "startica-smoke-accessibility.png"), fullPage: true });
    const ok = /Open issues\s*7\b/.test(openIssues);
    check(ok, `accessibility scan of the stand-in site finds its 7 planted issues (${openIssues.replace(/\s+/g, " ")})`);

    await page.getByRole("link", { name: "All issues" }).click();
    await page.waitForURL(/\/accessibility\/issues\?/);
    await page.getByRole("link", { name: /Images must have alternative text/ }).click();
    await page.getByText("probably part of a shared template").waitFor({ timeout: 15_000 });
    check((await page.getByText("/signup.html").count()) > 0, "an issue on 5 pages shows as one template issue, with each page");
    await page.getByRole("link", { name: "/signup.html" }).first().click();
    await page.getByText("Sign up: Fieldnote", { exact: true }).waitFor({ timeout: 15_000 });
    check((await page.getByText(/Form elements must have labels/).count()) > 0, "the page report lists the page's issues with their elements");

    // A2: the page report shows where each issue is; an issue can be ignored with a reason; the criterion view and CSV export work.
    await page.getByText("Where they are", { exact: true }).waitFor({ timeout: 15_000 });
    const shotSrc = await page.locator('img[alt^="Screenshot of /signup.html"]').getAttribute("src");
    const shotRes = await page.request.get(`${server.url}${shotSrc}`, FIRST_REQUEST);
    const shot = shotRes.ok() && shotRes.headers()["content-type"] === "image/jpeg" ? true : `${shotRes.status()} ${shotSrc}`;
    await page.goto(`${server.url}/accessibility/issues`);
    await page.getByRole("link", { name: /Elements must meet minimum color contrast/ }).click();
    await page.getByRole("button", { name: "Ignore" }).click();
    await page.getByRole("button", { name: "Ignore" }).last().click();
    await page.getByText(/^Ignored on \d{4}-\d{2}-\d{2}: False positive/).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: "Stop ignoring" }).click();
    await page.getByRole("button", { name: "Ignore" }).waitFor({ timeout: 15_000 });
    const exportHref = await page.locator("a", { hasText: "Export CSV" }).first().getAttribute("href");
    const csv = await page.request.get(`${server.url}${exportHref}`);
    const csvText = await csv.text();
    await page.goto(`${server.url}/accessibility/compliance`);
    const failing = await page.getByRole("row", { name: /1\.1\.1 Non-text Content/ }).innerText();
    check(
      shot === true && /Failing/.test(failing) && csv.ok() && csvText.includes('"Images must have alternative text"'),
      `A2: the page report boxes issues on a screenshot, an issue can be ignored and un-ignored, the criterion view shows 1.1.1 failing, and the CSV exports (screenshot ${shot}, csv ${csv.status()} ${csvText.slice(0, 60).replace(/\s+/g, " ")}, ${failing.replace(/\s+/g, " ")})`,
    );

    // A3 without an AI key: the scan listed the site's images, and the AI help waits for a key.
    await page.goto(`${server.url}/accessibility/images?show=all`);
    const logoListed = await page.getByText(/\/logo\.svg$/).count();
    const altOff = await page.getByRole("button", { name: /Review \d+ images?/ }).isDisabled();
    check(logoListed > 0 && altOff, `A3: the Images screen lists the stand-in's images (${logoListed}) and the alt text review waits for an AI key`);

    // A4: mark a criterion by hand, fill in the statement, open the printable report.
    await page.goto(`${server.url}/accessibility/checklist?show=all`);
    await page.getByRole("group", { name: "Manual result for 2.1.1" }).getByRole("button", { name: "Passes" }).click();
    await page.getByRole("group", { name: "Manual result for 2.1.1" }).getByRole("button", { name: "Passes", pressed: true }).waitFor({ timeout: 15_000 });
    await page.goto(`${server.url}/accessibility/reports`);
    await page.getByRole("button", { name: "Fill in the details" }).click();
    await page.getByLabel("How people can report problems (email or page address)").fill("accessibility@fieldnote.example");
    await page.getByRole("button", { name: "Save" }).last().click();
    await page.getByText("# Accessibility statement for Stand-in site").waitFor({ timeout: 15_000 });
    const supports = await page.getByRole("row", { name: /2\.1\.1 Keyboard/ }).innerText();
    const printable = await page.request.get(`${server.url}${await page.getByRole("link", { name: "Open" }).getAttribute("href")}`);
    const printed = await printable.text();
    check(
      /Supports/.test(supports) && printable.ok() && printed.includes("Accessibility report: Stand-in site") && !/\bcompliant\b/i.test(printed),
      `A4: a criterion checked by hand shows as Supports in the conformance draft, the statement is written, and the printable report opens (${supports.replace(/\s+/g, " ")})`,
    );

    // A5: the scan checked spelling and readability; the content check job then reads the linked PDF and checks the external link.
    await page.goto(`${server.url}/accessibility/content?tab=spelling`);
    const misspelled = await page.getByText("recieve", { exact: true }).count();
    let pdfChecked = false;
    for (let i = 0; i < 30 && !pdfChecked; i++) {
      await page.goto(`${server.url}/accessibility/documents`);
      pdfChecked = (await page.getByText("Not tagged").count()) > 0;
      if (!pdfChecked) await page.waitForTimeout(2000);
    }
    await page.goto(`${server.url}/accessibility/content?tab=links`);
    const goneLink = await page.getByText(/\/gone\.html$/).count();
    check(misspelled > 0 && pdfChecked && goneLink > 0, `A5: Content lists the planted misspelling (${misspelled}) and the broken external link (${goneLink}), and Documents shows the untagged PDF (${pdfChecked})`);

    // SEO & GEO: the same scan checked the pages for search and AI.
    await page.goto(`${server.url}/seo`);
    await page.getByText("AI crawlers", { exact: true }).waitFor({ timeout: 15_000 });
    const searchBot = await page.getByRole("row", { name: /OAI-SearchBot/ }).innerText();
    await page.goto(`${server.url}/seo/health`);
    await page.getByText("Broken internal link").first().waitFor({ timeout: 15_000 });
    await page.screenshot({ path: join(tmpdir(), "startica-smoke-seo-health.png"), fullPage: true });
    check(
      /Blocked/.test(searchBot) && (await page.getByText("Several pages share the same title").count()) > 0 && (await page.getByText("No llms.txt").count()) > 0,
      "SEO & GEO: the same scan finds the stand-in's planted search problems and its blocked AI search crawler",
    );

    // Opportunities: the same findings, ranked, with drafts (off without an AI key) and a link to the Roadmap.
    await page.goto(`${server.url}/seo/opportunities`);
    const llms = page.locator("[data-slot=card]").filter({ hasText: "No llms.txt" });
    await llms.waitFor({ timeout: 15_000 });
    const draftOff = await llms.getByRole("button", { name: "Draft llms.txt" }).isDisabled();
    await llms.getByRole("button", { name: "Roadmap" }).click();
    await llms.getByRole("button", { name: "On the Roadmap" }).waitFor({ timeout: 15_000 });
    check(draftOff, "Opportunities: Site health problems show ranked with a draft (waiting for an AI key) and go to the Roadmap");

    // Agent readiness: the check runs by itself after the scan and reads the stand-in like a simple agent would.
    await page.goto(`${server.url}/seo/agents`);
    await page.getByText(/^Checked /).waitFor({ timeout: 30_000 });
    const reach = await page.locator("[data-slot=card]").filter({ hasText: "Can agents reach it?" }).innerText();
    check(/Key pages open without signing in/.test(reach) && (await page.getByText("Not checked yet.").count()) < 3, "Agent readiness: checked after the scan, with results for the stand-in site");

    // GitHub issues: connect the (stand-in) repository, then open an issue from an accessibility issue.
    await page.goto(`${server.url}/settings?tab=products`);
    const trackerCard = page.locator("[data-slot=card]").filter({ hasText: "Issue tracker for" });
    await trackerCard.getByRole("button", { name: "Connect" }).click();
    await page.getByLabel("Repository", { exact: true }).fill("fieldnote/web");
    await page.getByLabel("Access token").fill(STANDIN_TOKEN);
    await page.getByLabel(/^Server/).fill(trackerApi.url);
    await page.getByRole("button", { name: "Save and check" }).click();
    await trackerCard.getByText("Connected", { exact: true }).waitFor({ timeout: 15_000 });
    await page.goto(`${server.url}/accessibility/issues`);
    await page.getByRole("link", { name: /Images must have alternative text/ }).click();
    await page.getByRole("button", { name: "Create GitHub issue" }).click();
    await page.getByRole("link", { name: /GitHub issue #\d+/ }).waitFor({ timeout: 15_000 });
    const opened = [...trackerApi.issues.values()];
    check(opened.length === 1 && opened[0].title.startsWith("Accessibility: Images must have alternative text"), `an accessibility issue opens a GitHub issue in the connected repository (${opened.length} opened)`);

    // Security: verify the (local) stand-in site, scan it, and find exactly its planted problems.
    await page.goto(`${server.url}/security`);
    await page.getByRole("button", { name: "Verify" }).click();
    await page.getByRole("button", { name: "Scan now" }).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: "Scan now" }).click();
    let gitFound = false;
    for (let i = 0; i < 60 && !gitFound; i++) {
      await page.waitForTimeout(2000);
      await page.goto(`${server.url}/security/findings`);
      gitFound = (await page.getByRole("link", { name: "The site's Git folder is public" }).count()) > 0;
    }
    await page.screenshot({ path: join(tmpdir(), "startica-smoke-security.png"), fullPage: true });
    const openTab = await page.getByRole("link", { name: /^Open \(\d+\)/ }).innerText();
    // 11 from the scan; the monitor (queued after the scan) may already have added the old jQuery on /about.html.
    check(gitFound && /Open \((11|12)\)/.test(openTab), `Security: after verifying, the scan finds the stand-in's 11 planted problems (${openTab})`);
    await page.getByRole("link", { name: "The site's Git folder is public" }).click();
    await page.getByRole("button", { name: "Create GitHub issue" }).click();
    await page.getByRole("button", { name: "Open the issue" }).click();
    await page.getByRole("link", { name: /Issue #\d+/ }).waitFor({ timeout: 15_000 });
    const securityIssue = [...trackerApi.issues.values()].find((i) => i.title.startsWith("Security: The site's Git folder is public"));
    await page.getByRole("button", { name: "Accept the risk" }).click();
    await page.getByLabel("Why").fill("Smoke test: the stand-in's Git folder is fake");
    await page.getByRole("button", { name: "Accept the risk" }).last().click();
    await page.getByText("Risk accepted", { exact: true }).first().waitFor({ timeout: 15_000 });
    await page.goto(`${server.url}/security/report`);
    await page.getByText("Security report: Stand-in site").waitFor({ timeout: 15_000 });
    check(Boolean(securityIssue) && (await page.getByText("Accepted risks and findings marked not a problem").count()) > 0, "Security: a finding opens a GitHub issue, its risk can be accepted, and the report lists it");

    // Security S4 without an AI key: the disclosure kit works, AI buttons wait for a key, and a reported problem becomes a finding.
    await page.goto(`${server.url}/security/disclosure`);
    await page.getByLabel("Contact (email or form address)").fill("security@fieldnote.example");
    await page.getByRole("button", { name: "Make security.txt" }).click();
    await page.getByText("Contact: mailto:security@fieldnote.example").waitFor({ timeout: 15_000 });
    await page.getByLabel("Where reports go").fill("security@fieldnote.example");
    await page.getByRole("button", { name: "Make the policy" }).click();
    await page.getByText("# Reporting a security problem in", { exact: false }).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: "Add a report" }).click();
    await page.getByLabel("What they sent").fill("The signup page sets a session cookie that scripts can read. Steps: open /signup.html and check document.cookie.");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: "Track as a finding" }).click();
    await page.getByRole("link", { name: "Tracked as a finding" }).waitFor({ timeout: 15_000 });
    await page.goto(`${server.url}/security/findings`);
    const importOff = await page.getByRole("button", { name: "Import a report" }).isDisabled();
    const reported = await page.getByText(/^Reported on \d{4}-\d{2}-\d{2}$/).count();
    check(importOff && reported > 0, `Security S4: security.txt and policy are made, a reported problem becomes a finding (${reported}), and AI import waits for a key`);

    // S2: monitoring (queued after the full scan) finds the old jQuery on /about.html through the OSV, EPSS and KEV stand-in.
    let monitored = false;
    for (let i = 0; i < 30 && !monitored; i++) {
      await page.goto(`${server.url}/security/monitoring`);
      monitored = (await page.getByRole("link", { name: /2 known/ }).count()) > 0;
      if (!monitored) await page.waitForTimeout(2000);
    }
    const exploited = await page.getByText("Exploited", { exact: true }).count();
    check(monitored && exploited > 0, "Security S2: monitoring finds the stand-in's jQuery 1.12.4 with 2 advisories, one known exploited (KEV)");

    // Stop: a second scan stopped right away ends as cancelled, keeping what it checked.
    await page.goto(`${server.url}/accessibility`);
    await page.getByRole("button", { name: "Scan now" }).click();
    await page.getByRole("button", { name: "Stop scan" }).click({ timeout: 15_000 });
    await page.locator("table").last().getByText("cancelled", { exact: true }).first().waitFor({ timeout: 60_000 });
    check(true, "a running accessibility scan can be stopped (ends as cancelled)");
  }

  // Dashboard: the start page sums up every module for the active product, with what needs the owner first.
  {
    await page.goto(`${server.url}/`);
    await page.waitForURL(/\/dashboard$/);
    await page.getByText("Needs you", { exact: true }).waitFor({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const card = (title) => page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: title }) }).first();
    const a11y = await card("Accessibility").innerText();
    const security = await card("Security").innerText();
    const needs = card("Needs you");
    const items = await needs.locator("li a").count();
    check(/Stand-in site/.test(a11y) && /\d+ \/ 100/.test(a11y) && /Open issues/.test(a11y), `the Dashboard shows the scanned site's accessibility score and issues (${a11y.replace(/\s+/g, " ").slice(0, 120)})`);
    check(/Stand-in site/.test(security) && /Open findings/.test(security), `the Dashboard shows the verified site's security (${security.replace(/\s+/g, " ").slice(0, 120)})`);
    const startsClosed = await needs.locator("details").evaluate((d) => !d.open);
    check(items > 0 && startsClosed && (await page.locator('[data-slot="sidebar"] a[href="/dashboard"]').count()) > 0, `the Dashboard lists what needs the owner (${items}, starts collapsed ${startsClosed}) and is in the sidebar`);
    await page.screenshot({ path: join(tmpdir(), "startica-smoke-dashboard.png"), fullPage: true });
  }

  // Sidebar: each module is a collapsible section, and the choice survives a reload.
  await page.goto(`${server.url}/accessibility`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: join(tmpdir(), "startica-smoke-sidebar.png") });
  const inboxLink = () => page.getByRole("link", { name: "Inbox" });
  await page.getByRole("button", { name: "Marketing" }).click();
  const hidden = await inboxLink().waitFor({ state: "hidden", timeout: 5_000 }).then(() => true, () => false);
  await page.reload();
  await page.waitForLoadState("networkidle");
  const stillHidden = await inboxLink().waitFor({ state: "hidden", timeout: 5_000 }).then(() => true, () => false);
  await page.getByRole("button", { name: "Marketing" }).click();
  await inboxLink().waitFor({ timeout: 5_000 });
  check(hidden && stillHidden && (await page.locator("a[href=\"/accessibility\"]").first().isVisible()), `sidebar sections (Marketing, Accessibility) collapse and stay collapsed after a reload (hidden ${hidden}, after reload ${stillHidden})`);

  // Intel: owner notes save through a server action.
  await page.goto(`${server.url}/intel`);
  await page.locator("textarea[name=owner_notes]").fill("Smoke test notes");
  await page.getByRole("button", { name: "Save notes" }).click();
  await page.getByText("Notes saved").waitFor({ timeout: 15_000 });
  check(true, "Intel notes save");

  // System: queue a ping and wait for the live-updating job table.
  await page.goto(`${server.url}/system`);
  await page.getByRole("button", { name: "Run test job" }).click();
  const row = page.locator("table").first().locator("tbody tr", { hasText: "ping" }).first();
  let status = "";
  for (let i = 0; i < 60 && !/succeeded|failed/.test(status); i++) {
    await page.waitForTimeout(500);
    status = (await row.innerText().catch(() => "")) ?? "";
  }
  check(
    /No Anthropic API key/.test(status), // no key in a smoke run: the job reaches the AI client, which says what's missing
    `ping job ran and the page updated live: ${status.replace(/\s+/g, " ").slice(0, 120)}`,
  );

  // Settings → AI: switching to OpenAI moves the tasks to OpenAI's models.
  await page.goto(`${server.url}/settings`);
  await page.getByRole("button", { name: "Add API key" }).click();
  await page.getByLabel("Use").selectOption("openai");
  await page.getByLabel(/^OpenAI API key/).fill("sk-proj-smoke-test");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Using OpenAI.").waitFor({ timeout: 15_000 });
  await page.screenshot({ path: join(tmpdir(), "startica-smoke-settings-general.png"), fullPage: true });
  await page.getByText("Advanced: the model for each task").click();
  check(await page.getByText("GPT-6 Luna", { exact: false }).first().isVisible(), "Settings → AI switches to OpenAI and its models (under Advanced)");

  // Settings → Products: the active product's connections and sites.
  await page.goto(`${server.url}/settings?tab=products`);
  await page.getByText(/^Sites for /).waitFor({ timeout: 15_000 });
  await page.screenshot({ path: join(tmpdir(), "startica-smoke-settings-products.png"), fullPage: true });
  const dbRow = await page.getByRole("heading", { name: "Product database", exact: true }).count();
  const siteListed = await page.getByRole("link", { name: "Stand-in site" }).count();
  check(dbRow > 0 && siteListed > 0, `Settings → Products shows the product's connections (${dbRow}) and its accessibility sites (${siteListed})`);
  // Product database: Startica writes the SQL for the owner to run; nothing signs in to their database.
  {
    const row = page.locator("div.rounded-lg.border").filter({ has: page.getByRole("heading", { name: "Product database", exact: true }) });
    await row.getByRole("button", { name: "Set up" }).click();
    await page.getByRole("button", { name: "Write the SQL" }).click();
    const sql = await page.locator("pre").filter({ hasText: "startica_reader" }).innerText({ timeout: 15_000 });
    await page.getByLabel("Connection string").fill("postgresql://postgres.abcdefghijklmnopqrst:[YOUR-PASSWORD]@127.0.0.1:9/postgres");
    await page.getByRole("button", { name: /test and save/ }).click();
    const refused = await page.getByText(/Paste the pooler connection string|Couldn't reach the database|Couldn't find/).first().waitFor({ timeout: 30_000 }).then(() => true, () => false);
    check(
      /create role startica_reader login password '[A-Za-z0-9]{32}'/.test(sql) && /grant select on startica\.daily_metrics to startica_reader/.test(sql) && refused,
      "Product database: Startica writes setup SQL with a read-only login for you to run, and tests the connection before saving",
    );
    await page.keyboard.press("Escape");
  }
  // GA4: the setup steps, and Choose file… loads the downloaded key into the form.
  await page.getByRole("button", { name: "Connect" }).first().click();
  await page.getByText("Connect Google Analytics 4").waitFor({ timeout: 10_000 });
  await page.locator('input[type="file"]').setInputFiles({
    name: "fieldnote-analytics.json",
    mimeType: "application/json",
    buffer: Buffer.from('{ "type": "service_account", "client_email": "startica@fieldnote.iam.gserviceaccount.com", "private_key": "-----BEGIN PRIVATE KEY-----\\n…" }'),
  });
  await page.getByText("Loaded fieldnote-analytics.json").waitFor({ timeout: 5_000 });
  await page.screenshot({ path: join(tmpdir(), "startica-smoke-ga4-dialog.png") });
  check((await page.getByLabel("Service account key").inputValue()).includes("service_account"), "GA4 dialog: numbered steps, and Choose file… loads the key");
  await page.keyboard.press("Escape");

  // Another product's connections and sites, without changing the active product.
  const other = (await page.getByText("Connections for Second Co").count()) > 0 ? "Smoke Test Co" : "Second Co";
  await page.getByRole("link", { name: other, exact: true }).click();
  await page.getByText(`Connections for ${other}`).waitFor({ timeout: 15_000 });
  check((await page.getByText("Showing below").count()) === 1, `Settings → Products shows any product's connections and sites (${other}) without switching the active product`);

  check(errors.length === 0, `no browser errors${errors.length ? `: ${errors[0]}` : ""}`);
} catch (error) {
  check(false, `smoke run crashed: ${error instanceof Error ? error.message : error}`);
} finally {
  await browser.close();
  await server.close();
  await standin.close();
  await trackerApi.close();
  await googleApi.close();
  await umamiApi.close();
  await securityApi.close();
  rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
