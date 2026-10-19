import OpenAI from "openai";
import { zodResponsesFunction, zodTextFormat } from "openai/helpers/zod";
import type { Response } from "openai/resources/responses/responses";
import type { z } from "zod";
import { AiError, type AiMessage, type Answer, type CallRequest, type CallResult, type ChatOptions, type ChatReply, type ResearchOptions } from "./errors.ts";
import type { TokenUsage } from "./pricing.ts";

/**
 * OpenAI through the Responses API: structured outputs from a Zod schema, the
 * built-in web search tool for research, reasoning effort from the task's
 * config. Prompt caching is automatic; `prompt_cache_key` groups calls per task so
 * the shared system prompt keeps hitting the cache.
 */

let client: { key: string; openai: OpenAI } | undefined;
function getClient(key: string): OpenAI {
  if (client?.key !== key) client = { key, openai: new OpenAI({ apiKey: key }) };
  return client.openai;
}

export function usageOf(response: Pick<Response, "usage" | "output">): TokenUsage {
  const cached = response.usage?.input_tokens_details?.cached_tokens ?? 0;
  const written = response.usage?.input_tokens_details?.cache_write_tokens ?? 0;
  return {
    // OpenAI counts cache reads and writes inside input_tokens; Startica prices them separately.
    inputTokens: (response.usage?.input_tokens ?? 0) - cached - written,
    outputTokens: response.usage?.output_tokens ?? 0, // includes reasoning tokens
    cacheReadTokens: cached,
    cacheWriteTokens: written,
    webSearchRequests: response.output.filter((item) => item.type === "web_search_call").length,
  };
}

/** Startica's message parts in the Responses API's shape: input_text and input_image (a data URL). */
function openaiContent(content: AiMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((p) => (p.type === "text" ? { type: "input_text" as const, text: p.text } : { type: "input_image" as const, image_url: `data:${p.mediaType};base64,${p.data}`, detail: "auto" as const }));
}

function common(req: CallRequest) {
  return {
    model: req.config.model,
    instructions: req.system,
    input: req.messages.map((m) => ({ role: m.role, content: openaiContent(m.content) })),
    max_output_tokens: req.config.maxTokens,
    ...(req.config.effort ? { reasoning: { effort: req.config.effort } } : {}),
    prompt_cache_key: `startica-${req.task}`,
    store: false, // nothing kept on OpenAI's side beyond what the API requires
  };
}

/** Throws if the response was refused or cut off. */
export function checkResponse(response: Pick<Response, "status" | "incomplete_details" | "output" | "model">, req: CallRequest, usage: TokenUsage): void {
  const meta = { model: response.model, usage };
  const refusal = response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .find((part) => part.type === "refusal");
  if (refusal || response.incomplete_details?.reason === "content_filter") {
    throw new AiError(`OpenAI declined the request${refusal && "refusal" in refusal ? ` (${refusal.refusal})` : ""}`, "refused", meta);
  }
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason ?? "unknown";
    throw new AiError(
      reason === "max_output_tokens" ? `Output hit max_tokens (${req.config.maxTokens}) for task ${req.task}` : `Response incomplete (${reason})`,
      "truncated",
      meta,
    );
  }
}

export async function openaiStructured<S extends z.ZodType>(key: string, req: CallRequest & { schema: S }): Promise<CallResult<z.infer<S>>> {
  const response = await getClient(key).responses.parse(
    {
      ...common(req),
      text: { format: zodTextFormat(req.schema, "output") },
    },
    { signal: req.signal },
  );
  const usage = usageOf(response);
  checkResponse(response, req, usage);
  if (response.output_parsed == null) {
    throw new AiError("Response did not match the expected schema", "invalid_output", { model: response.model, usage });
  }
  return { value: response.output_parsed as z.infer<S>, model: response.model, usage };
}

/** Research with OpenAI's web search tool (it opens pages itself, so there's no separate fetch tool). Streamed to avoid timeouts. */
export async function openaiResearch(key: string, req: CallRequest & ResearchOptions): Promise<CallResult<string>> {
  let response: Response;
  try {
    response = await getClient(key)
      .responses.stream(
        {
          ...common(req),
          tools: [{ type: "web_search" }],
          max_tool_calls: (req.maxSearches ?? 8) + (req.maxFetches ?? 8),
        },
        { signal: req.signal },
      )
      .finalResponse();
  } catch (error) {
    throw AiError.wrap(error, { model: req.config.model });
  }
  const usage = usageOf(response);
  checkResponse(response, req, usage);
  return { value: response.output_text.trim(), model: response.model, usage };
}

/** An answer with web search, as an assistant would give it: its text, the pages it cited and its searches. */
export async function openaiAnswer(key: string, req: CallRequest & { maxSearches?: number }): Promise<CallResult<Answer>> {
  let response: Response;
  try {
    response = await getClient(key)
      .responses.stream({ ...common(req), tools: [{ type: "web_search" }], max_tool_calls: req.maxSearches ?? 3 }, { signal: req.signal })
      .finalResponse();
  } catch (error) {
    throw AiError.wrap(error, { model: req.config.model });
  }
  const usage = usageOf(response);
  checkResponse(response, req, usage);
  return { value: { text: response.output_text.trim(), ...sourcesOf(response) }, model: response.model, usage };
}

/**
 * A chat turn, streamed: `onText` gets the text so far as it's written. With web search the
 * model may look things up first; with a tool (a strict function) it may hand back structured data.
 */
export async function openaiChat(key: string, req: CallRequest & ChatOptions): Promise<CallResult<ChatReply>> {
  const tools: unknown[] = [];
  if (req.webSearch) tools.push({ type: "web_search" });
  if (req.tool) tools.push(zodResponsesFunction({ name: req.tool.name, description: req.tool.description, parameters: req.tool.schema }));
  let text = "";
  let response: Response;
  try {
    const stream = getClient(key).responses.stream(
      { ...common(req), ...(tools.length ? { tools: tools as never, max_tool_calls: (req.webSearch ? (req.maxSearches ?? 3) : 0) + (req.tool ? 1 : 0) } : {}) },
      { signal: req.signal },
    );
    stream.on("response.output_text.delta", (event) => {
      text += event.delta;
      req.onText?.(text);
    });
    response = await stream.finalResponse();
  } catch (error) {
    throw AiError.wrap(error, { model: req.config.model });
  }
  const usage = usageOf(response);
  checkResponse(response, req, usage);
  const call = response.output.find((item) => item.type === "function_call" && item.name === req.tool?.name);
  let toolInput: unknown = null;
  if (call?.type === "function_call") {
    try {
      toolInput = JSON.parse(call.arguments);
    } catch {
      toolInput = null;
    }
  }
  return { value: { text: response.output_text.trim(), toolInput, ...sourcesOf(response), model: response.model }, model: response.model, usage };
}

/** The pages a response cited and the searches behind it. */
function sourcesOf(response: Response): Pick<Answer, "citations" | "searches"> {
  const citations = new Map<string, string>();
  const searches: string[] = [];
  for (const item of response.output as unknown as { type: string; action?: { query?: string }; content?: { type: string; annotations?: { type: string; url?: string; title?: string }[] }[] }[]) {
    if (item.type === "web_search_call" && item.action?.query) searches.push(item.action.query);
    if (item.type === "message")
      for (const part of item.content ?? []) for (const a of part.annotations ?? []) if (a.type === "url_citation" && a.url && !citations.has(a.url)) citations.set(a.url, a.title ?? "");
  }
  return { citations: [...citations].map(([url, title]) => ({ url, title })), searches };
}

/**
 * A picture from OpenAI's image model (Ads AD2). The system text and the message are one
 * prompt; the task's effort is the image quality. A moderation block comes back as a refusal.
 */
export async function openaiImage(key: string, req: CallRequest & { size: string }): Promise<CallResult<Buffer>> {
  const text = req.messages.map((m) => (typeof m.content === "string" ? m.content : m.content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n"))).join("\n\n");
  let response: Awaited<ReturnType<OpenAI["images"]["generate"]>>;
  try {
    response = await getClient(key).images.generate(
      { model: req.config.model, prompt: `${req.system}\n\n${text}`, size: req.size, quality: req.config.effort ?? "medium", n: 1, output_format: "png" },
      { signal: req.signal },
    );
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e?.code === "moderation_blocked" || e?.code === "content_policy_violation") throw new AiError(`OpenAI declined to draw this (${e.message ?? e.code})`, "refused", { model: req.config.model });
    throw AiError.wrap(error, { model: req.config.model });
  }
  const usage: TokenUsage = { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new AiError("OpenAI returned no image", "invalid_output", { model: req.config.model, usage });
  return { value: Buffer.from(b64, "base64"), model: req.config.model, usage };
}
