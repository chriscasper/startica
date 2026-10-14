/**
 * Runs an eval set against the current prompt and model routing (ARCHITECTURE.md section 5),
 * in a throwaway database so the app's data and AI spend history stay untouched.
 * Takes the provider's key from your shell (ANTHROPIC_API_KEY or OPENAI_API_KEY);
 * it's only stored in the throwaway database.
 *
 *   ANTHROPIC_API_KEY=sk-ant-… yarn eval score [--model claude-…] [--product Fieldnote]
 *   OPENAI_API_KEY=sk-… yarn eval score --model gpt-6-luna
 *   ANTHROPIC_API_KEY=sk-ant-… yarn eval a11y [--model claude-…]   (fix suggestions, checked with axe in Chromium)
 *   ANTHROPIC_API_KEY=sk-ant-… yarn eval security [--model claude-…]   (Security's explain, import and triage)
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { eq, sum } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { aiModels, aiRuns } from "@startica/db/schema";
import { fileKeyCipher, putSecret, setCipher } from "@startica/db/secrets";
import { MODELS, PROVIDERS, providerOf } from "../src/ai/models.ts";
import { runStructured } from "../src/ai/client.ts";
import { evalDir, readEvalFile, type ScoreCase } from "../src/ai/evals/score/cases.ts";
import { conversationText } from "../src/distribution/jobs.ts";
import { SCORE_PROMPT_VERSION, scoreOutput, scoreSystem } from "../src/distribution/prompts.ts";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { model: { type: "string" }, product: { type: "string" } } });
if (positionals[0] !== "score" && positionals[0] !== "security" && positionals[0] !== "a11y") {
  console.error("Usage: yarn eval score|security|a11y [--model <id>] [--product <name>]");
  process.exit(1);
}
const provider = values.model ? providerOf(values.model) : "anthropic";
if (!provider) {
  console.error(`Unknown model ${values.model}. Known: ${MODELS.map((m) => m.id).join(", ")}`);
  process.exit(1);
}
const envKey = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
const apiKey = process.env[envKey];
if (!apiKey) {
  console.error(`Set ${envKey} in your shell first, e.g. ${envKey}=… yarn eval score${values.model ? ` --model ${values.model}` : ""}`);
  process.exit(1);
}

if (positionals[0] === "a11y") {
  // Accessibility fix suggestions, checked with axe in a real browser.
  const { runA11yEvals } = await import("./eval-a11y.ts");
  process.exit((await runA11yEvals(provider, apiKey, values.model)) ? 1 : 0);
}
if (positionals[0] === "security") {
  // Security's AI help (explain, import, triage) runs on the draft task: its own runner.
  const { runSecurityEvals } = await import("./eval-security.ts");
  process.exit((await runSecurityEvals(provider, apiKey, values.model)) ? 1 : 0);
}

const dir = mkdtempSync(join(tmpdir(), "startica-eval-"));
openDatabase(join(dir, "eval.db"));
setCipher(fileKeyCipher(join(dir, "key")));
await migrateDatabase(join(import.meta.dirname, "../../db/migrations"));
const workspaceId = (await ensureWorkspace()).id;
await putSecret(PROVIDERS[provider].secret, apiKey);
if (values.model) await getDb().update(aiModels).set({ model: values.model }).where(eq(aiModels.task, "score"));
const [routing] = await getDb().select().from(aiModels).where(eq(aiModels.task, "score"));

const files = readdirSync(evalDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => readEvalFile(join(evalDir, f))!)
  .filter((f) => !values.product || f.product.toLowerCase() === values.product.toLowerCase());
if (files.length === 0) {
  console.error("No eval files found. Run `yarn eval:export score` first.");
  process.exit(1);
}

type Result = { c: ScoreCase; relevance: number; intent: number; got: "reply" | "skip"; reasoning: string } | { c: ScoreCase; error: string };
const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

console.log(`Prompt ${SCORE_PROMPT_VERSION}, model ${routing?.model} (effort ${routing?.effort ?? "default"})\n`);
let failures = 0;

for (const file of files) {
  const system = scoreSystem(file.productContext);
  const results: Result[] = [];
  // A few at a time: the first call writes the prompt cache, the rest read it.
  const queue = [...file.cases];
  const first = queue.shift();
  const runOne = async (c: ScoreCase): Promise<Result> => {
    try {
      const s = await runStructured({ workspaceId }, {
        task: "score",
        promptVersion: SCORE_PROMPT_VERSION,
        system,
        messages: [{ role: "user", content: conversationText({ ...c.conversation, author: null }) }],
        schema: scoreOutput,
      });
      const got = s.relevance >= file.thresholds.relevance && s.intent >= file.thresholds.intent ? "reply" : "skip";
      return { c, relevance: s.relevance, intent: s.intent, got, reasoning: s.reasoning };
    } catch (error) {
      return { c, error: error instanceof Error ? error.message : String(error) };
    }
  };
  if (first) results.push(await runOne(first));
  while (queue.length) results.push(...(await Promise.all(queue.splice(0, 4).map(runOne))));

  console.log(`${file.product}: ${file.cases.length} cases (thresholds: relevance ≥ ${file.thresholds.relevance}, intent ≥ ${file.thresholds.intent})`);
  for (const r of results) {
    if ("error" in r) {
      console.log(`  ✗ ${pad(r.c.id, 22)} error: ${r.error}`);
      continue;
    }
    const ok = r.got === r.c.expect;
    console.log(`  ${ok ? "✓" : "✗"} ${pad(r.c.id, 22)} expect ${r.c.expect.padEnd(5)} got ${r.got.padEnd(5)} rel ${r.relevance.toFixed(2)} int ${r.intent.toFixed(2)}  ${pad(r.c.conversation.title ?? r.c.conversation.threadTitle ?? r.c.conversation.body, 50)}`);
    if (!ok) console.log(`      ${r.c.note} Scorer: ${r.reasoning}`);
  }

  const scored = results.filter((r): r is Extract<Result, { got: string }> => !("error" in r));
  const tp = scored.filter((r) => r.c.expect === "reply" && r.got === "reply").length;
  const fp = scored.filter((r) => r.c.expect === "skip" && r.got === "reply").length;
  const fn = scored.filter((r) => r.c.expect === "reply" && r.got === "skip").length;
  const correct = scored.filter((r) => r.got === r.c.expect).length;
  failures += results.length - correct;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
  console.log(
    `  Accuracy ${correct}/${results.length} (${pct(correct, results.length)}); "reply" precision ${pct(tp, tp + fp)}, recall ${pct(tp, tp + fn)}; owner cases ${file.cases.filter((c) => c.source === "owner").length}\n`,
  );
}

const [cost] = await getDb().select({ total: sum(aiRuns.costUsd) }).from(aiRuns);
console.log(`Cost: $${Number(cost?.total ?? 0).toFixed(4)}`);
closeDatabase();
rmSync(dir, { recursive: true, force: true });
process.exitCode = failures ? 1 : 0;
