// Starts the desktop app in development. Clears ELECTRON_RUN_AS_NODE, which
// editors like VS Code/Cursor set for their own processes and which would make
// Electron start as plain Node instead of as an app.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const electronBinary = createRequire(import.meta.url)("electron");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, ["."], { cwd: new URL("..", import.meta.url), env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
