// Screenshots of the Dashboard and each module's main page, for the website and docs.
// Seeds the Fieldnote demo into a temporary data folder and runs its own server (port
// 58397, build folder .next-screenshots), so it never touches your real data or a
// running app. Takes each screen in the light and the dark theme (<name>.png and
// <name>-dark.png; the sites show the one for their theme). Writes the same PNGs to apps/web/public/images/app/ and
// apps/docs/public/images/app/. Usage: yarn screenshots
// To look at the app without replacing those: STARTICA_SCREENSHOT_DIR=<folder>, with
// STARTICA_SCREENSHOT_PATHS=/inbox,/settings for other screens (named after the path).
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const root = join(import.meta.dirname, "../../..");
// STARTICA_SCREENSHOT_DIR=<folder> writes there instead: a look at the app without touching the sites' images.
const outDirs = process.env.STARTICA_SCREENSHOT_DIR ? [process.env.STARTICA_SCREENSHOT_DIR] : [join(root, "apps/web/public/images/app"), join(root, "apps/docs/public/images/app")];
const shots = [
  { name: "dashboard", path: "/dashboard" },
  { name: "marketing", path: "/today" },
  { name: "accessibility", path: "/accessibility" },
  { name: "seo", path: "/seo" },
  { name: "security", path: "/security" },
];
const extra = (process.env.STARTICA_SCREENSHOT_PATHS ?? "").split(",").filter(Boolean);
if (extra.length > 0 && !process.env.STARTICA_SCREENSHOT_DIR) {
  console.error("STARTICA_SCREENSHOT_PATHS needs STARTICA_SCREENSHOT_DIR: the sites' images are the five screens above.");
  process.exit(1);
}
if (extra.length > 0) shots.splice(0, shots.length, ...extra.map((path) => ({ name: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""), path, extra: true })));

const dataDir = mkdtempSync(join(tmpdir(), "startica-screenshots-"));
const seeded = spawnSync("yarn", ["workspace", "@startica/core", "seed:demo"], { cwd: root, env: { ...process.env, STARTICA_DATA_DIR: dataDir }, stdio: "inherit" });
if (seeded.status !== 0) process.exit(seeded.status ?? 1);
// A placeholder AI key, so the pages look set up and Today's checklist is done. No AI runs: jobs are off.
const placeholderKey = `
  import { join } from "node:path";
  import { openDatabase, closeDatabase } from "@startica/db/client";
  import { databasePath } from "@startica/db/paths";
  import { fileKeyCipher, putSecret, setCipher } from "@startica/db/secrets";
  openDatabase(databasePath());
  setCipher(fileKeyCipher(join(process.env.STARTICA_DATA_DIR, "dev-secret.key")));
  await putSecret("anthropic_api_key", "sk-ant-screenshots-placeholder");
  closeDatabase();
`;
const keyed = spawnSync("yarn", ["workspace", "@startica/core", "exec", "tsx", "--input-type=module", "--eval", placeholderKey], { cwd: root, env: { ...process.env, STARTICA_DATA_DIR: dataDir }, stdio: "inherit" });
if (keyed.status !== 0) process.exit(keyed.status ?? 1);

process.env.STARTICA_NEXT_DIST = ".next-screenshots";
const { startServer } = await import("../server.mjs");
// No background jobs: the pages show the seeded data as it is.
const server = await startServer({ port: 58397, dataDir, jobs: false });
const browser = await chromium.launch();
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
  await page.goto(`${server.url}/?token=${server.token}`);
  await page.waitForURL(/\/dashboard$/, { timeout: 120_000 });
  // The Next.js dev badge isn't part of the app.
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => document.head.append(Object.assign(document.createElement("style"), { textContent: "nextjs-portal { display: none !important; }" }))));
  for (const outDir of outDirs) mkdirSync(outDir, { recursive: true });
  for (const shot of shots) {
    await page.goto(`${server.url}${shot.path}`);
    await page.waitForLoadState("networkidle");
    await page.locator(shot.extra ? "h1" : '[data-slot="card"]').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800); // charts animate in
    // The app follows the system theme, so the same loaded page gives both.
    for (const [scheme, name] of [["light", `${shot.name}.png`], ["dark", `${shot.name}-dark.png`]]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(300);
      const file = join(outDirs[0], name);
      await page.screenshot({ path: file });
      for (const outDir of outDirs.slice(1)) copyFileSync(file, join(outDir, name));
      console.log(`✓ ${name} (${shot.path})`);
    }
    await page.emulateMedia({ colorScheme: "light" });
  }
} catch (error) {
  console.error(error);
  failed = true;
} finally {
  await browser.close();
  await server.close?.();
  rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
