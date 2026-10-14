import type { AiTask, ModelConfig } from "./models.ts";
import type { TokenUsage } from "./pricing.ts";

/** An image for a vision task (A3): base64 data, JPEG, PNG, GIF or WebP. */
export type AiImage = { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string };
export type AiPart = { type: "text"; text: string } | AiImage;

/** A turn in a conversation with the model: plain text, or text and images (vision tasks). */
export type AiMessage = { role: "user" | "assistant"; content: string | AiPart[] };

/** What the client hands a provider adapter. */
export type CallRequest = { task: AiTask; config: ModelConfig; system: string; messages: AiMessage[]; signal?: AbortSignal };
export type ResearchOptions = { maxSearches?: number; maxFetches?: number };
/** An answer written with web search, with what it cited and the searches behind it. */
export type Answer = { text: string; citations: { url: string; title: string }[]; searches: string[] };
export type CallResult<T> = { value: T; model: string; usage: TokenUsage };

type Meta = { model?: string; usage?: TokenUsage };

export class AiError extends Error {
  readonly model?: string;
  readonly usage?: TokenUsage;

  constructor(
    message: string,
    readonly kind: "blocked" | "refused" | "truncated" | "invalid_output" | "config" | "api",
    meta: Meta = {},
  ) {
    super(message);
    this.name = "AiError";
    this.model = meta.model;
    this.usage = meta.usage;
  }

  /** Keeps an AiError as is; wraps anything else (network, HTTP errors) as an API error. */
  static wrap(error: unknown, meta: Meta = {}): AiError {
    if (error instanceof AiError) return error;
    return new AiError(error instanceof Error ? error.message : String(error), "api", meta);
  }
}
