import { z } from "zod";
import { runStructured, type AiContext } from "../ai/client.ts";

export const pingPayload = z.object({
  workspaceId: z.guid(),
  message: z.string().max(500).default("Say hello to Startica."),
});

const pingOutput = z.object({
  reply: z.string().describe("One short, friendly sentence."),
});

// Proves the whole path works: app -> queue -> worker -> Claude -> ai_runs.
export async function runPing(ctx: AiContext, payload: z.infer<typeof pingPayload>) {
  return runStructured(ctx, {
    task: "ping",
    promptVersion: "ping@1",
    system: "You are the health check for Startica, a local marketing tool. Reply in one short sentence.",
    messages: [{ role: "user", content: payload.message }],
    schema: pingOutput,
  });
}
