// The installers a release offers to people, matched by electron-builder's file names (the
// `build` field in ../package.json). Used by release-notes.mjs and by the website's download page
// (apps/web/scripts/release.mjs). The .zip, .blockmap and latest*.yml files are for auto-update.
export const INSTALLERS = [
  { id: "mac-arm64", os: "macos", label: "macOS, Apple Silicon", short: "Apple Silicon", match: (name) => /-arm64\.dmg$/.test(name) },
  { id: "mac-x64", os: "macos", label: "macOS, Intel", short: "Intel", match: (name) => /\.dmg$/.test(name) && !/-arm64\.dmg$/.test(name) },
  { id: "win-x64", os: "windows", label: "Windows, 64-bit", short: "Installer (.exe)", match: (name) => /Setup.*\.exe$/.test(name) },
  { id: "linux-appimage", os: "linux", label: "Linux, AppImage", short: "AppImage", match: (name) => /\.AppImage$/.test(name) },
  { id: "linux-deb", os: "linux", label: "Linux, Debian and Ubuntu (.deb)", short: "Debian, Ubuntu (.deb)", match: (name) => /\.deb$/.test(name) },
];

/** Pairs each installer with its asset ({ name, size, ... }); `asset` is undefined when the release lacks it. */
export function findInstallers(assets) {
  return INSTALLERS.map((installer) => ({ ...installer, asset: assets.find((a) => installer.match(a.name)) }));
}

/** The link a published release serves the file at. Drafts use a temporary tag, so build it from the real one. */
export function downloadUrl(repo, tag, name) {
  return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;
}

export function formatSize(bytes) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/** Every 0.x version is a beta: named so on the release and the download page. */
export function isBeta(version) {
  return /^v?0\./.test(version);
}

// Release notes record which systems' builds are unsigned, so the download page can say so
// without guessing: <!-- startica:unsigned=macos,windows -->
export function unsignedMarker(systems) {
  return `<!-- startica:unsigned=${systems.join(",")} -->`;
}

/** The systems a release's notes mark unsigned; null when the notes carry no marker. */
export function readUnsigned(body) {
  const match = /<!-- startica:unsigned=([a-z,]*) -->/.exec(body ?? "");
  return match ? match[1].split(",").filter(Boolean) : null;
}
