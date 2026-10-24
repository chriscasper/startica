import "server-only";
import { join } from "node:path";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { migrateDatabase, openDatabase } from "@startica/db/client";
import { databasePath, dataDir } from "@startica/db/paths";
import { adoptFileKeySecrets, fileKeyCipher, ipcCipher, setCipher } from "@startica/db/secrets";
import { startRunner, type Runner } from "@startica/core/jobs/runner";
import { productCount, seedDemo } from "@startica/core/demo/seed";
import { setSetupFlags } from "@startica/core/setup/status";
import { recordPostingResult } from "@startica/core/posting/record";
import { setNotifier } from "@startica/core/content/calendar";
import type { PostingTarget } from "@startica/core/posting/requests";
import { startScanner } from "./scanner";

/**
 * Runs once per server process (instrumentation.ts): open and migrate the
 * database, set up secret encryption, create the workspace on first launch and
 * start the job runner.
 */
const STARTED = Symbol.for("startica.started");
const g = globalThis as unknown as { [STARTED]?: Promise<Runner | null> };

export function start(): Promise<Runner | null> {
  g[STARTED] ??= (async () => {
    openDatabase(databasePath());
    await migrateDatabase(process.env.STARTICA_MIGRATIONS_DIR ?? join(process.cwd(), "../../packages/db/migrations"));
    // In the desktop app the OS keychain (via the Electron process) encrypts secrets.
    setCipher(process.env.STARTICA_ELECTRON ? ipcCipher() : fileKeyCipher(join(dataDir(), "dev-secret.key")));
    if (process.env.STARTICA_ELECTRON) {
      // Secrets saved in browser dev mode (the key file) move to the keychain, so the same data folder works in the app.
      const moved = await adoptFileKeySecrets(join(dataDir(), "dev-secret.key"));
      if (moved) console.log(`[startica] moved ${moved} secret(s) from the dev key file to the OS keychain`);
    }
    const workspace = await ensureWorkspace();
    if (process.env.STARTICA_ELECTRON) {
      listenForPostingResults();
      // Content calendar reminders show as desktop notifications; clicking one opens `href` (main.mjs).
      setNotifier((n) => process.send?.({ type: "notify", title: n.title, body: n.body, href: n.href }));
    }
    await startScanner();
    // Demo mode (its own data folder): fill it with the sample product once; nothing
    // reaches out from the demo, so no scans, AI or other jobs run there.
    if (process.env.STARTICA_DEMO === "1") {
      if ((await productCount()) === 0) {
        await seedDemo();
        await setSetupFlags({ welcomeDone: true, checklistDismissed: true }); // the demo is already set up
      }
      return null;
    }
    if (process.env.STARTICA_DISABLE_JOBS === "1") return null;
    return startRunner({ workspaceId: workspace.id });
  })();
  return g[STARTED]!;
}

type PostingResult = { type: "posting-result"; requestId: string; target: PostingTarget; url: string | null; text?: string | null };

/** The posting window (Electron process) reports a post the user submitted; record it and confirm. */
function listenForPostingResults() {
  process.on("message", (message: PostingResult) => {
    if (message?.type !== "posting-result") return;
    recordPostingResult(message.target, message.url, message.text ?? null).then(
      () => process.send?.({ type: "posting-recorded", requestId: message.requestId, ok: true }),
      (error: unknown) => {
        console.error("[startica] couldn't record a post:", error);
        process.send?.({ type: "posting-recorded", requestId: message.requestId, ok: false, error: error instanceof Error ? error.message : String(error) });
      },
    );
  });
}
