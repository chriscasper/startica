// Starts Startica's server: Next.js plus (via instrumentation.ts) the database,
// migrations and job runner, all in this process. Used by the desktop app
// (apps/desktop/main.mjs) and by scripts/serve.mjs for browser/test runs.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

const webDir = dirname(fileURLToPath(import.meta.url));

// Startica sends no telemetry; keep Next.js's own usage reporting off too (dev, smoke and the installed app).
process.env.NEXT_TELEMETRY_DISABLED ??= "1";

// Dev and browser mode: 58301, next to an installed Startica on 58300 (serve-prod.mjs).
export const DEFAULT_PORT = 58301;

/**
 * @param {{ dev?: boolean; port?: number; dataDir?: string; electron?: boolean; jobs?: boolean }} [opts]
 * @returns {Promise<{ url: string; token: string; close: () => Promise<void> }>}
 */
export async function startServer(opts = {}) {
  const port = opts.port ?? Number(process.env.PORT ?? DEFAULT_PORT);
  const hostname = "127.0.0.1"; // loopback only: never reachable from the network
  const token = randomBytes(32).toString("base64url");

  // Read by proxy.ts and instrumentation (startup.ts; the scanner blocks requests to this port).
  process.env.STARTICA_SESSION_TOKEN = token;
  process.env.PORT = String(port);
  process.env.STARTICA_MIGRATIONS_DIR ??= join(webDir, "../../packages/db/migrations");
  if (opts.dataDir) process.env.STARTICA_DATA_DIR = opts.dataDir;
  if (opts.electron) process.env.STARTICA_ELECTRON = "1";
  if (opts.jobs === false) process.env.STARTICA_DISABLE_JOBS = "1";

  const dev = opts.dev ?? process.env.NODE_ENV !== "production";
  const app = next({ dev, dir: webDir, hostname, port, turbopack: dev });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => handle(req, res));
  await new Promise((resolve, reject) => {
    server.once("error", (error) =>
      reject(error.code === "EADDRINUSE" ? new Error(`Port ${port} is already in use. Is Startica already running?`) : error),
    );
    server.listen(port, hostname, () => resolve(undefined));
  });

  return {
    url: `http://${hostname}:${port}`,
    token,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}
