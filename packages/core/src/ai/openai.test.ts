import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import type { Response } from "openai/resources/responses/responses";
import { checkResponse, openaiImage, usageOf } from "./openai.ts";

const req = { task: "draft" as const, config: { model: "gpt-6.1-sol", effort: "medium" as const, maxTokens: 8000 }, system: "s", messages: [] };
const response = (over: Partial<Response>) =>
  ({ model: "gpt-6.1-sol", status: "completed", incomplete_details: null, output: [], usage: null, ...over }) as unknown as Response;
const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

describe("OpenAI responses", () => {
  it("separates cache reads and writes from fresh input and counts web searches", () => {
    const r = response({
      usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 800, cache_write_tokens: 100 }, output_tokens: 50, output_tokens_details: { reasoning_tokens: 20 }, total_tokens: 1050 },
      output: [{ type: "web_search_call" }, { type: "web_search_call" }, { type: "message", content: [] }] as unknown as Response["output"],
    });
    expect(usageOf(r)).toEqual({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 800, cacheWriteTokens: 100, webSearchRequests: 2 });
  });

  it("treats a refusal or a content filter stop as refused, and a token-limit stop as truncated", () => {
    const refused = response({ output: [{ type: "message", content: [{ type: "refusal", refusal: "can't help" }] }] as unknown as Response["output"] });
    expect(() => checkResponse(refused, req, usage)).toThrow(expect.objectContaining({ kind: "refused" }));
    const filtered = response({ status: "incomplete", incomplete_details: { reason: "content_filter" } });
    expect(() => checkResponse(filtered, req, usage)).toThrow(expect.objectContaining({ kind: "refused" }));
    const cut = response({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
    expect(() => checkResponse(cut, req, usage)).toThrow(/max_tokens \(8000\)/);
    expect(() => checkResponse(response({}), req, usage)).not.toThrow();
  });
});

describe("OpenAI images", () => {
  it("asks for one PNG at the size and quality, and reads the picture and its tokens", async () => {
    let body: Record<string, unknown> = {};
    let reply: { status: number; json: unknown } = { status: 200, json: { data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }], usage: { input_tokens: 120, output_tokens: 1756 } } };
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        body = JSON.parse(raw);
        res.writeHead(reply.status, { "content-type": "application/json" }).end(JSON.stringify(reply.json));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const previous = process.env.OPENAI_BASE_URL;
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    try {
      const image = { task: "image" as const, config: { model: "gpt-image-2.5-flare", effort: "medium" as const, maxTokens: 4096 }, system: "Rules.", messages: [{ role: "user" as const, content: "A notebook." }] };
      const out = await openaiImage("sk-test-image", { ...image, size: "2048x2048" });
      expect(body).toMatchObject({ model: "gpt-image-2.5-flare", prompt: "Rules.\n\nA notebook.", size: "2048x2048", quality: "medium", n: 1, output_format: "png" });
      expect(out.value.toString()).toBe("png-bytes");
      expect(out.usage).toMatchObject({ inputTokens: 120, outputTokens: 1756 });
      reply = { status: 400, json: { error: { message: "Your request was rejected by the safety system.", type: "image_generation_user_error", code: "moderation_blocked" } } };
      await expect(openaiImage("sk-test-image", { ...image, size: "2048x2048" })).rejects.toMatchObject({ kind: "refused" });
    } finally {
      if (previous === undefined) delete process.env.OPENAI_BASE_URL;
      else process.env.OPENAI_BASE_URL = previous;
      await new Promise((r) => server.close(r));
    }
  });
});
