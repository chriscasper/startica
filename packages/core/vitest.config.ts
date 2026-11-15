import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

// Most test files open their own database, run every migration and seed the demo in a
// beforeAll, and a few start a real browser. With one worker per logical CPU (Vitest's
// default) those setups compete, pass Vitest's 10 s hook limit on a busy machine and fail
// files that pass on their own. So: half the CPUs, and limits with room for a slow start.
export default defineConfig({
  test: {
    maxWorkers: Math.max(2, Math.floor(availableParallelism() / 2)),
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
