import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where Startica keeps its data: the same folder Electron's app.getPath("userData")
 * uses for an app named "Startica", so the desktop app and dev runs share one
 * database. STARTICA_DATA_DIR overrides it (tests, smoke runs).
 */
export function dataDir(): string {
  if (process.env.STARTICA_DATA_DIR) return process.env.STARTICA_DATA_DIR;
  const home = homedir();
  if (process.platform === "darwin") return join(home, "Library", "Application Support", "Startica");
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Startica");
  return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "Startica");
}

export const databasePath = () => join(dataDir(), "startica.db");
