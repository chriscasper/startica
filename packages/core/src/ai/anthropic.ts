import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessage, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { AiError, type AiMessage, type Answer, type CallRequest, type CallResult, type ResearchOptions } from "./errors.ts";
import { addUsage, emptyUsage, type TokenUsage } from "./pricing.ts";

// Server-side refusal fallbacks exist for Opus/Sonnet/Fable, not Haiku.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const supportsFallbacks = (model: string) => !model.startsWith("claude-haiku");
const MAX_CONTINUATIONS = 5;

let client: { key: string; anthropic: Anthropic } | undefined;
function getClient(key: string): Anthropic {
  if (client?.key !== key) client = { key, anthropic: new Anthropic({ apiKey: key }) };
  return client.anthropic;
}

function usageOf(message: BetaMessage): TokenUsage {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    webSearchRequests: message.usage.server_tool_use?.web_search_requests ?? 0,
  };
}

function common(req: CallRequest) {
  const { config } = req;
  return {
    model: config.model,
    max_tokens: config.maxTokens,
    // Stable instructions are marked for prompt caching.
    system: [{ type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } }],
    ...(supportsFallbacks(config.model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
  };
}

/** Startica's messages in the Messages API's shape: text blocks and base64 image blocks. */
function anthropicMessages(messages: AiMessage[]): BetaMessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((p) => (p.type === "text" ? { type: "text" as const, text: p.text } : { type: "image" as const, source: { type: "base64" as const, media_type: p.mediaType, data: p.data } })),
  }));
}

/** Throws if the final message was refused or cut off. */
function checkStop(message: BetaMessage, req: CallRequest, usage: TokenUsage): void {
  const meta = { model: message.model, usage };
  if (message.stop_reason === "refusal") {
    throw new AiError(`Claude declined the request (${message.stop_details?.category ?? "no category"})`, "refused", meta);
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiError(`Output hit max_tokens (${req.config.maxTokens}) for task ${req.task}`, "truncated", meta);
  }
}

export async function anthropicStructured<S extends z.ZodType>(key: string, req: CallRequest & { schema: S }): Promise<CallResult<z.infer<S>>> {
  const response = await getClient(key).beta.messages.parse(
    {
      ...common(req),
      messages: anthropicMessages(req.messages),
      output_config: {
        format: betaZodOutputFormat(req.schema),
        ...(req.config.effort ? { effort: req.config.effort } : {}),
      },
    },
    { signal: req.signal },
  );
  const usage = usageOf(response);
  checkStop(response, req, usage);
  if (response.parsed_output == null) {
    throw new AiError("Response did not match the expected schema", "invalid_output", { model: response.model, usage });
  }
  return { value: response.parsed_output as z.infer<S>, model: response.model, usage };
}

/** Streams to avoid request timeouts and resumes server-side `pause_turn` stops. */
export async function anthropicResearch(key: string, req: CallRequest & ResearchOptions): Promise<CallResult<string>> {
  const { final, usage } = await searchLoop(key, req, [
    { type: "web_search_20260209", name: "web_search", max_uses: req.maxSearches ?? 8 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: req.maxFetches ?? 8 },
  ]);
  return { value: textOf(final), model: final.model, usage };
}

/** An answer with web search only, as an assistant would give it: its text, the pages it cited and its searches. */
export async function anthropicAnswer(key: string, req: CallRequest & { maxSearches?: number }): Promise<CallResult<Answer>> {
  const { final, usage } = await searchLoop(key, req, [{ type: "web_search_20260209", name: "web_search", max_uses: req.maxSearches ?? 3 }]);
  const citations = new Map<string, string>();
  const searches: string[] = [];
  for (const block of final.content as unknown as { type: string; citations?: { type: string; url?: string; title?: string }[] | null; name?: string; input?: { query?: string } }[]) {
    if (block.type === "text") for (const c of block.citations ?? []) if (c.type === "web_search_result_location" && c.url && !citations.has(c.url)) citations.set(c.url, c.title ?? "");
    if (block.type === "server_tool_use" && block.name === "web_search" && block.input?.query) searches.push(block.input.query);
  }
  return { value: { text: textOf(final), citations: [...citations].map(([url, title]) => ({ url, title })), searches }, model: final.model, usage };
}

const textOf = (message: BetaMessage) =>
  message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();

/** Runs a message with server tools, sending paused turns back until the model finishes. */
async function searchLoop(key: string, req: CallRequest, tools: unknown[]): Promise<{ final: BetaMessage; usage: TokenUsage }> {
  const messages = anthropicMessages(req.messages);
  let usage = emptyUsage();
  let final: BetaMessage | undefined;
  try {
    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      final = await getClient(key)
        .beta.messages.stream(
          {
            ...common(req),
            messages,
            tools: tools as never,
            ...(req.config.effort ? { output_config: { effort: req.config.effort } } : {}),
          },
          { signal: req.signal },
        )
        .finalMessage();
      usage = addUsage(usage, usageOf(final));
      if (final.stop_reason !== "pause_turn") break;
      // The server hit its tool-loop limit; send the turn back and it resumes.
      messages.push({ role: "assistant", content: final.content });
    }
  } catch (error) {
    throw AiError.wrap(error, { model: req.config.model, usage });
  }
  if (final!.stop_reason === "pause_turn") {
    throw new AiError(`Research still paused after ${MAX_CONTINUATIONS} continuations`, "truncated", { model: final!.model, usage });
  }
  checkStop(final!, req, usage);
  return { final: final!, usage };
}
