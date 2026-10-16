import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where Startica keeps its data: Electron's app.getPath("userData") folder, which is "Startica"
 * for the installed app and "Startica Dev" for dev runs (apps/desktop/main.mjs). The desktop app
 * always passes it as STARTICA_DATA_DIR; this default is for browser mode and scripts, which
 * are dev runs, so they share the dev folder. STARTICA_DATA_DIR overrides it (tests, smoke runs).
 */
export function dataDir(): string {
  if (process.env.STARTICA_DATA_DIR) return process.env.STARTICA_DATA_DIR;
  const name = process.env.STARTICA_PACKAGED === "1" ? "Startica" : "Startica Dev";
  const home = homedir();
  if (process.platform === "darwin") return join(home, "Library", "Application Support", name);
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), name);
  return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), name);
}

export const databasePath = () => join(dataDir(), "startica.db");
