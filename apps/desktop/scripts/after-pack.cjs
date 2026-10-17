// electron-builder hook: copies the assembled server (build/server, including its
// node_modules) into the app's resources. Done here rather than via
// extraResources because electron-builder always strips node_modules from those.
const { cpSync } = require("node:fs");
const { join } = require("node:path");
const { checkLinks } = require("./links.cjs");

exports.default = async function afterPack(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : join(context.appOutDir, "resources");
  // verbatimSymlinks keeps the server's relative links relative (see build.mjs).
  cpSync(join(__dirname, "..", "build", "server"), join(resources, "server"), { recursive: true, verbatimSymlinks: true });
  checkLinks(join(resources, "server"));
};
