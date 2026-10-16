// Writes the notes for a release: a download table linking each installer, then the version's
// CHANGELOG.md entry. The release workflow runs it after every build job has uploaded its files.
// Usage: node apps/desktop/scripts/release-notes.mjs v0.0.2 > notes.md
//        node apps/desktop/scripts/release-notes.mjs v0.0.2 --title   (prints the release title)
//   Reads the release's files with `gh release view` (works on drafts).
//   MAC_SIGNED / WIN_SIGNED=true when those builds were signed.
//   GITHUB_REPOSITORY (owner/repo) defaults to chriscasper/startica.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { downloadUrl, findInstallers, formatSize, isBeta, unsignedMarker } from "./installers.mjs";

const tag = process.argv[2];
if (!/^v\d+\.\d+\.\d+/.test(tag ?? "")) {
  console.error("Usage: node release-notes.mjs v<version>");
  process.exit(1);
}
const version = tag.slice(1);
if (process.argv.includes("--title")) {
  console.log(`Startica ${version}${isBeta(version) ? " beta" : ""}`);
  process.exit(0);
}
const repo = process.env.GITHUB_REPOSITORY || "chriscasper/startica";
const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const { assets } = JSON.parse(execFileSync("gh", ["release", "view", tag, "--repo", repo, "--json", "assets"], { encoding: "utf8" }));
const installers = findInstallers(assets);
const missing = installers.filter((i) => !i.asset);
if (missing.length) {
  console.error(`The ${tag} release is missing: ${missing.map((i) => i.label).join("; ")}`);
  process.exit(1);
}

// The version's entry: from its heading to the next version heading or the link list.
const changelog = readFileSync(join(repoDir, "CHANGELOG.md"), "utf8");
const start = changelog.search(new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m"));
let changes = "";
if (start === -1) {
  console.error(`::warning::CHANGELOG.md has no entry for ${version}; the notes only list the downloads.`);
} else {
  const rest = changelog.slice(start).replace(/^.*\n/, "");
  const end = rest.search(/^(## \[|\[[^\]]+\]: )/m);
  changes = (end === -1 ? rest : rest.slice(0, end)).trim().replace(/^### /gm, "#### ");
}

const unsigned = [];
if (process.env.MAC_SIGNED !== "true") unsigned.push("macos");
if (process.env.WIN_SIGNED !== "true") unsigned.push("windows");

const lines = [unsignedMarker(unsigned)];
if (isBeta(version)) {
  lines.push(
    "> [!IMPORTANT]",
    "> **Beta.** Startica is new and still changing. Expect rough edges, and please report problems in [GitHub Discussions](https://github.com/" + repo + "/discussions) or [issues](https://github.com/" + repo + "/issues).",
    "",
  );
}
lines.push(
  "## Download",
  "",
  "| System | Installer | Size |",
  "| --- | --- | --- |",
  ...installers.map(({ label, asset }) => `| ${label} | [${asset.name}](${downloadUrl(repo, tag, asset.name)}) | ${formatSize(asset.size)} |`),
  "",
  "Not sure which Mac you have? Apple menu → **About This Mac**: \"Apple M…\" is Apple Silicon, \"Intel\" is Intel. Or download from https://mystartica.com/download.",
  "",
);
if (unsigned.includes("macos")) {
  lines.push(
    "> [!NOTE]",
    "> The macOS app isn't code-signed yet. The first time you open it, macOS blocks it: go to System Settings → **Privacy & Security** and click **Open Anyway**. If it says the app \"is damaged\", run `xattr -dr com.apple.quarantine /Applications/Startica.app` in Terminal. It can't install its own updates on macOS until it's signed, so download new versions from here.",
    "",
  );
}
if (unsigned.includes("windows")) {
  lines.push(
    "> [!NOTE]",
    "> The Windows installer isn't code-signed yet. If SmartScreen says \"Windows protected your PC\", click **More info**, then **Run anyway**.",
    "",
  );
}
lines.push("On Linux, make the AppImage executable (`chmod +x Startica-*.AppImage`) or install the .deb with `sudo apt install ./startica_*.deb`.", "");
if (changes) lines.push("## What's new", "", changes, "");
lines.push(`Full changelog: https://github.com/${repo}/blob/${tag}/CHANGELOG.md`);

process.stdout.write(`${lines.join("\n")}\n`);
