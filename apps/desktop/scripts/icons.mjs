// Renders the app and tray icons from assets/*.svg (run after editing them):
//   resources/icon.png        1024px app icon; electron-builder makes .icns/.ico from it
//   assets/icon.png           512px window icon (Windows/Linux taskbar)
//   assets/trayTemplate*.png  macOS menu-bar icon (black + alpha; macOS tints it)
//   assets/tray*.png          Windows/Linux tray icon (white mark on the dark tile)
// Usage: yarn workspace @startica/desktop icons
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(desktopDir, "..", "desktop-web", "package.json"));
const { chromium } = require("playwright");

const icon = readFileSync(join(desktopDir, "assets", "icon.svg"), "utf8");
const tray = readFileSync(join(desktopDir, "assets", "tray.svg"), "utf8");
// The full-bleed tile reads better than the padded macOS shape at tray sizes.
const trayColor = icon.replace('x="100" y="100" width="824" height="824" rx="185"', 'x="0" y="0" width="1024" height="1024" rx="220"');

const outputs = [
  { svg: icon, size: 1024, path: "resources/icon.png" },
  { svg: icon, size: 512, path: "assets/icon.png" },
  { svg: tray, size: 16, path: "assets/trayTemplate.png" },
  { svg: tray, size: 32, path: "assets/trayTemplate@2x.png" },
  { svg: trayColor, size: 16, path: "assets/tray.png" },
  { svg: trayColor, size: 32, path: "assets/tray@2x.png" },
];

const browser = await chromium.launch();
try {
  for (const { svg, size, path } of outputs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const sized = svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${sized}`);
    await page.screenshot({ path: join(desktopDir, path), omitBackground: true });
    await page.close();
    console.log(`${path} (${size}px)`);
  }
} finally {
  await browser.close();
}
