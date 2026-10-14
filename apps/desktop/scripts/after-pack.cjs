// electron-builder hook: copies the assembled server (build/server, including its
// node_modules) into the app's resources. Done here rather than via
// extraResources because electron-builder always strips node_modules from those.
const { cpSync } = require("node:fs");
const { join } = require("node:path");

exports.default = async function afterPack(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : join(context.appOutDir, "resources");
  cpSync(join(__dirname, "..", "build", "server"), join(resources, "server"), { recursive: true, dereference: true });
};
