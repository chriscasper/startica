// Screenshots of the Dashboard and each module's main page, for the website and docs.
// Seeds the Fieldnote demo into a temporary data folder and runs its own server (port
// 58397, build folder .next-screenshots), so it never touches your real data or a
// running app. Writes the same PNGs to apps/web/public/images/app/ and
// apps/docs/public/images/app/. Usage: yarn screenshots
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const root = join(import.meta.dirname, "../../..");
const outDirs = [join(root, "apps/web/public/images/app"), join(root, "apps/docs/public/images/app")];
const shots = [
  { name: "dashboard", path: "/dashboard" },
  { name: "marketing", path: "/today" },
  { name: "accessibility", path: "/accessibility" },
  { name: "seo", path: "/seo" },
  { name: "security", path: "/security" },
];

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
    await page.locator('[data-slot="card"]').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800); // charts animate in
    const file = join(outDirs[0], `${shot.name}.png`);
    await page.screenshot({ path: file });
    for (const outDir of outDirs.slice(1)) copyFileSync(file, join(outDir, `${shot.name}.png`));
    console.log(`✓ ${shot.name}.png (${shot.path})`);
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
