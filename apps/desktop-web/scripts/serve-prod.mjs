// Production entry for the desktop app: runs inside Next's standalone build
// (copied next to its server.js by apps/desktop/scripts/build.mjs). Sets the
// same environment server.mjs sets in development, then starts Next's own
// standalone server and tells the Electron app when it's ready.
import { randomBytes } from "node:crypto";
import { get } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 58300);
const hostname = "127.0.0.1";
const token = randomBytes(32).toString("base64url");

Object.assign(process.env, {
  NODE_ENV: "production",
  PORT: String(port),
  HOSTNAME: hostname,
  STARTICA_SESSION_TOKEN: token,
});
process.env.STARTICA_MIGRATIONS_DIR ??= join(here, "migrations");

await import("./server.js");

// Next's standalone server doesn't report readiness; wait until it answers.
// (node:http, not fetch: Next patches the global fetch inside its server.)
const url = `http://${hostname}:${port}`;
const answers = () =>
  new Promise((resolve) => {
    const req = get(`${url}/api/events`, (res) => {
      res.resume();
      resolve(true);
    });
    req.setTimeout(1000, () => req.destroy());
    req.on("error", () => resolve(false));
  });
for (let i = 0; i < 300 && !(await answers()); i++) await new Promise((r) => setTimeout(r, 200));
if (process.send) process.send({ type: "ready", url, token });
else console.log(`\nStartica is running. Open:\n  ${url}/?token=${token}\n`);
