import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Next adds each build folder's types to the tsconfig it uses; test and desktop builds
// (STARTICA_NEXT_DIST) get their own git-ignored file so tsconfig.json stays clean. Created
// here so a fresh checkout (CI) has it; without it the build has no "@/" paths.
const testTsconfig = path.join(__dirname, "tsconfig.test.json");
if (process.env.STARTICA_NEXT_DIST && !existsSync(testTsconfig)) {
  writeFileSync(testTsconfig, JSON.stringify({ extends: "./tsconfig.json", exclude: ["node_modules", ".next"] }, null, 2));
}

// Shown under the logo in the sidebar. Releases bump this package's version with the app's.
const { version } = JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf8")) as { version: string };

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_STARTICA_VERSION: version },
  // Desktop builds bundle a minimal standalone server (apps/desktop/scripts/build.mjs).
  ...(process.env.STARTICA_STANDALONE
    ? {
        output: "standalone" as const,
        outputFileTracingRoot: path.resolve(__dirname, "../.."),
        // Read from disk by the accessibility scanner, so tracing can't see it.
        outputFileTracingIncludes: {
          "/**": [
            "../../node_modules/axe-core/axe.min.js",
            "../../node_modules/axe-core/package.json",
            // Accessibility A5: the spelling dictionary's files and pdf.js's worker are read at run time.
            "../../node_modules/dictionary-en/**",
            "../../node_modules/pdfjs-dist/legacy/build/**",
            "../../node_modules/pdfjs-dist/package.json",
          ],
        },
      }
    : {}),
  // A local app has nothing to gain from resizing images; apps/desktop/scripts/build.mjs leaves sharp out.
  images: { unoptimized: true },
  // Separate build folders let a test server run next to the app (two dev servers can't share one).
  distDir: process.env.STARTICA_NEXT_DIST ?? ".next",
  typescript: { tsconfigPath: process.env.STARTICA_NEXT_DIST ? "tsconfig.test.json" : "tsconfig.json" },
  cacheComponents: true,
  // Ad pictures and logos are uploaded through server actions (Ads AD2).
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  partialPrefetching: true,
  transpilePackages: ["@startica/brand", "@startica/core", "@startica/db"],
  // Loaded from node_modules at run time: axe-core's script is read from disk and run in
  // scanned pages; Playwright is the dev-only scanner backend (never in the installed app).
  // pdf.js, nspell and its dictionary (accessibility A5) load their own files at run time.
  serverExternalPackages: ["axe-core", "playwright", "playwright-core", "pdfjs-dist", "nspell", "dictionary-en"],
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
  // Keep the dev badge clear of the sidebar footer links.
  // Next's dev server prints every server action's arguments, and some carry passwords.
  logging: { serverFunctions: false },
  devIndicators: { position: "bottom-right" },
  turbopack: {
    root: path.resolve(__dirname, "../.."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
