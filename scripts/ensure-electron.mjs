// Electron downloads its binary in a post-install step that doesn't always run
// under Yarn; fetch it if it's missing. Runs on `yarn install`.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const dir = "node_modules/electron";
if (existsSync(`${dir}/install.js`) && !existsSync(`${dir}/path.txt`)) {
  console.log("Downloading the Electron binary…");
  spawnSync(process.execPath, [`${dir}/install.js`], { stdio: "inherit" });
}
