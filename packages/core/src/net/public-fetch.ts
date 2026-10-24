import { isPrivateHost, resolvesPublic as resolvesPublicName } from "./address.ts";

/**
 * GET for URLs Startica didn't type itself (pages AI answers cite, a competitor's blog feed):
 * public http(s) on the standard ports only, no credentials in the URL, no private or reserved
 * names, every name resolved and refused if any address is private, and redirects followed by
 * hand so each hop is checked the same way before it's requested. Used by Off-site and the
 * competitor watch.
 */

const RESERVED = /\.(example|test|invalid|localhost)$/i;
const MAX_REDIRECTS = 5;

// Tests read from a server on 127.0.0.1, and only from it; never in the installed app.
const g = globalThis as { __starticaPublicFetchLocal?: boolean };
export function allowLocalPublicFetch(on: boolean): void {
  g.__starticaPublicFetchLocal = on;
}
const localOnly = () => g.__starticaPublicFetchLocal === true && process.env.STARTICA_PACKAGED !== "1";

/** Whether Startica may request this URL at all: public http(s), standard port, a real name. */
export function allowedPublicUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  // Test mode reads only the local test server: tests never reach the internet.
  if (localOnly()) return u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  if (u.username || u.password) return false;
  return !isPrivateHost(u.hostname) && !RESERVED.test(u.hostname) && u.hostname.includes(".");
}

/** Every address the name resolves to is public (in test mode: only the local test server). */
export async function resolvesPublicHost(hostname: string): Promise<boolean> {
  if (localOnly()) return hostname === "127.0.0.1";
  return resolvesPublicName(hostname);
}

export type PublicResponse = { status: number; text: string; url: string; contentType: string };

/** The response (status, text up to `maxBytes`, the final URL), or null when a hop isn't allowed or the request failed. */
export async function publicGet(url: string, opts: { userAgent: string; accept: string; maxBytes?: number; signal?: AbortSignal }): Promise<PublicResponse | null> {
  const timeout = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  let current = url;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!allowedPublicUrl(current) || !(await resolvesPublicHost(new URL(current).hostname))) return null;
      const res = await fetch(current, { headers: { "user-agent": opts.userAgent, accept: opts.accept }, redirect: "manual", signal: timeout });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        current = new URL(location, current).toString();
        continue;
      }
      const buf = await res.arrayBuffer();
      return { status: res.status, text: new TextDecoder().decode(buf.slice(0, opts.maxBytes ?? 1_000_000)), url: current, contentType: res.headers.get("content-type") ?? "" };
    }
    return null; // too many redirects
  } catch {
    if (opts.signal?.aborted) throw opts.signal.reason;
    return null;
  }
}
