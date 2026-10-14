// Builds the desktop app:
//  1. Next.js standalone server (apps/desktop-web, own build folder and tsconfig)
//  2. assembles it with static files, the production entry and DB migrations
//     into build/server
//  3. packages with electron-builder (installers in dist/)
// Usage: yarn workspace @startica/desktop build [--no-package] [electron-builder args, e.g. --mac --win --linux]
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(desktopDir, "..", "desktop-web");
const repoDir = join(desktopDir, "..", "..");
const distName = ".next-desktop";
const out = join(desktopDir, "build", "server");

// Startica sends no telemetry; keep Next.js's own usage reporting off during the build too.
process.env.NEXT_TELEMETRY_DISABLED ??= "1";

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// 1. Standalone build. Its tsconfig skips .next/ so a running dev server can't break it.
writeFileSync(join(webDir, "tsconfig.test.json"), JSON.stringify({ extends: "./tsconfig.json", exclude: ["node_modules", ".next"] }, null, 2));
rmSync(join(webDir, distName), { recursive: true, force: true });
run("yarn", ["build"], {
  cwd: webDir,
  env: { ...process.env, STARTICA_STANDALONE: "1", STARTICA_NEXT_DIST: distName, NODE_ENV: "production" },
});

// 2. Assemble: standalone server + static assets + entry + migrations.
const standalone = join(webDir, distName, "standalone");
const appDir = join(out, "apps", "desktop-web");
rmSync(out, { recursive: true, force: true });
cpSync(standalone, out, { recursive: true, verbatimSymlinks: false, dereference: true });
// Next ships sharp for image optimization, which the app turns off (images.unoptimized). Its native
// files match the build machine only, so one Mac would put its own architecture's copy in both Mac apps.
for (const dir of ["sharp", "@img"]) rmSync(join(out, "node_modules", dir), { recursive: true, force: true });
cpSync(join(webDir, distName, "static"), join(appDir, distName, "static"), { recursive: true });
if (existsSync(join(webDir, "public"))) cpSync(join(webDir, "public"), join(appDir, "public"), { recursive: true });
cpSync(join(webDir, "scripts", "serve-prod.mjs"), join(appDir, "serve-prod.mjs"));
cpSync(join(repoDir, "packages", "db", "migrations"), join(appDir, "migrations"), { recursive: true });
console.log(`Server assembled in ${out}`);

// 3. Package.
if (process.argv.includes("--no-package")) process.exit(0);
const builderArgs = process.argv.slice(2).filter((a) => a !== "--no-package");
run("yarn", ["electron-builder", ...builderArgs], { cwd: desktopDir });
