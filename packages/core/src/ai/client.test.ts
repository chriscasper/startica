import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { aiModels, aiRuns, secrets, settings } from "@startica/db/schema";
import { fileKeyCipher, putSecret, setCipher } from "@startica/db/secrets";
import { AiError } from "./errors.ts";

const calls: { provider: string; key: string; model: string }[] = [];
vi.mock("./openai.ts", () => ({
  openaiStructured: vi.fn(async (key: string, req: { config: { model: string } }) => {
    calls.push({ provider: "openai", key, model: req.config.model });
    return { value: { ok: true }, model: `${req.config.model}-2026-09-01`, usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };
  }),
  openaiResearch: vi.fn(),
}));
vi.mock("./anthropic.ts", () => ({
  anthropicStructured: vi.fn(async (key: string, req: { config: { model: string } }) => {
    calls.push({ provider: "anthropic", key, model: req.config.model });
    throw new AiError("Claude declined the request (cyber)", "refused", { model: req.config.model });
  }),
  anthropicResearch: vi.fn(),
}));

const { activeProvider, hasAiKey, OPENAI_KEY_SECRET, ANTHROPIC_KEY_SECRET, runStructured, setActiveProvider } = await import("./client.ts");

let workspaceId = "";
const ask = (task: "score" | "draft") => runStructured({ workspaceId }, { task, promptVersion: "t1", system: "s", messages: [{ role: "user", content: "hi" }], schema: z.object({ ok: z.boolean() }) });
const modelFor = async (task: string) => (await getDb().select().from(aiModels).where(eq(aiModels.task, task)))[0]!;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-ai-"));
  openDatabase(join(dir, "test.db"));
  setCipher(fileKeyCipher(join(dir, "key")));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
});
beforeEach(async () => {
  calls.length = 0;
  await getDb().delete(secrets);
  await getDb().delete(aiRuns);
  await getDb().delete(settings);
  await setActiveProvider(workspaceId, "anthropic");
  await getDb().delete(settings);
});
afterAll(() => closeDatabase());

describe("AI providers", () => {
  it("defaults to the provider that has a key, Claude first", async () => {
    expect(await activeProvider()).toBe("anthropic");
    expect(await hasAiKey()).toBe(false);
    await putSecret(OPENAI_KEY_SECRET, "sk-proj-test");
    expect(await activeProvider()).toBe("openai");
    expect(await hasAiKey()).toBe(true);
    await putSecret(ANTHROPIC_KEY_SECRET, "sk-ant-test");
    expect(await activeProvider()).toBe("anthropic");
  });

  it("switching provider moves only the tasks on the other provider to its defaults", async () => {
    await setActiveProvider(workspaceId, "openai");
    expect((await modelFor("score")).model).toBe("gpt-6-luna");
    await getDb().update(aiModels).set({ model: "gpt-6-astra" }).where(eq(aiModels.task, "strategy"));
    await setActiveProvider(workspaceId, "openai");
    expect((await modelFor("strategy")).model).toBe("gpt-6-astra"); // the user's choice survives
    await setActiveProvider(workspaceId, "anthropic");
    expect((await modelFor("strategy")).model).toBe("claude-opus-5-5");
    expect(await activeProvider()).toBe("anthropic");
  });

  it("routes each task by its model's provider, with that provider's key, and prices dated snapshots", async () => {
    await putSecret(OPENAI_KEY_SECRET, "sk-proj-test");
    await getDb().update(aiModels).set({ model: "gpt-6-luna" }).where(eq(aiModels.task, "score"));
    expect(await ask("score")).toEqual({ ok: true });
    expect(calls).toEqual([{ provider: "openai", key: "sk-proj-test", model: "gpt-6-luna" }]);
    const [run] = await getDb().select().from(aiRuns);
    expect(run!.status).toBe("ok");
    expect(run!.costUsd).toBeCloseTo(0.1); // 1M input tokens at $0.10
  });

  it("doesn't start a call once the job was stopped", async () => {
    await putSecret(OPENAI_KEY_SECRET, "sk-proj-test");
    await getDb().update(aiModels).set({ model: "gpt-6-luna" }).where(eq(aiModels.task, "score"));
    const controller = new AbortController();
    controller.abort(new Error("Stopped by you"));
    await expect(
      runStructured({ workspaceId, signal: controller.signal }, { task: "score", promptVersion: "t1", system: "s", messages: [{ role: "user", content: "hi" }], schema: z.object({ ok: z.boolean() }) }),
    ).rejects.toThrow(/Stopped by you/);
    expect(calls).toEqual([]);
  });

  it("says which key is missing, and logs refusals as refused", async () => {
    await getDb().update(aiModels).set({ model: "claude-sonnet-5-5" }).where(eq(aiModels.task, "draft"));
    await expect(ask("draft")).rejects.toThrow(/No Anthropic API key/);
    await putSecret(ANTHROPIC_KEY_SECRET, "sk-ant-test");
    await expect(ask("draft")).rejects.toThrow(/declined/);
    const runs = await getDb().select({ status: aiRuns.status }).from(aiRuns);
    expect(runs.map((r) => r.status).sort()).toEqual(["error", "refused"]);
  });
});
