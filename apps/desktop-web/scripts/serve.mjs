// Runs Startica in a browser instead of the desktop app (debugging, smoke tests).
// Prints a one-time link that logs this browser in.
//   node scripts/serve.mjs            → uses the normal data folder
//   STARTICA_DATA_DIR=/tmp/x node …   → isolated data (tests)
import { startServer } from "../server.mjs";

const { url, token } = await startServer({ dev: process.env.NODE_ENV !== "production" });
// Started by the desktop app: hand it the address and token instead of printing them.
if (process.send) process.send({ type: "ready", url, token });
else console.log(`\nStartica is running. Open:\n  ${url}/?token=${token}\n`);
if (process.env.STARTICA_TOKEN_FILE) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.STARTICA_TOKEN_FILE, JSON.stringify({ url, token }));
}
