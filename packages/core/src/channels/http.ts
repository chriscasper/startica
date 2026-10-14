import { USER_AGENT } from "../intel/crawl.ts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}

/** GET a public JSON API with Startica's user agent and a timeout. */
export async function getJson<T>(url: string, opts: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...opts.headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as T;
}

/** Appends the first few replies so the drafter knows what's already been said (same shape as Reddit/HN). */
export function withTopReplies(body: string, replies: { author: string | null; text: string }[]): string {
  const lines = replies
    .filter((r) => r.text)
    .slice(0, 5)
    .map((r) => `- ${r.author ?? "someone"}: ${r.text.slice(0, 500)}`);
  return lines.length ? `${body}\n\nTop replies so far:\n${lines.join("\n")}` : body;
}
