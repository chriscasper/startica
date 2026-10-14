import { createSign } from "node:crypto";
import { z } from "zod";

/**
 * Google APIs with a service-account key (ARCHITECTURE.md section 10.2): a signed JWT is traded
 * for an hour-long access token. No Google SDK, no OAuth sign-in: the key the user pasted
 * is all it needs, and it only sees what the service account was added to.
 */

const serviceAccount = z.object({ type: z.literal("service_account"), client_email: z.string(), private_key: z.string() });
export type ServiceAccount = z.infer<typeof serviceAccount>;

export const SEARCH_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

// Tests and the smoke test point these at a stand-in (search/standin.mjs).
const g = globalThis as { __starticaGoogleBase?: string };
export function setGoogleApiBase(base: string | null): void {
  g.__starticaGoogleBase = base ?? undefined;
}
function apiBase(): string | undefined {
  // Never in the installed app: the key and its tokens only ever go to Google.
  const env = process.env.STARTICA_PACKAGED === "1" ? undefined : process.env.STARTICA_GOOGLE_API_BASE;
  return g.__starticaGoogleBase ?? env;
}
export const tokenUrl = () => (apiBase() ? `${apiBase()}/token` : "https://oauth2.googleapis.com/token");
export const searchConsoleUrl = () => (apiBase() ? `${apiBase()}/webmasters/v3` : "https://searchconsole.googleapis.com/webmasters/v3");

export function parseServiceAccount(secret: string, what = "Search Console"): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secret);
  } catch {
    throw new Error(`The ${what} key isn't valid JSON: paste the whole .json file`);
  }
  const key = serviceAccount.safeParse(parsed);
  if (!key.success) throw new Error(`The ${what} key isn't a service account key: paste the .json file from Google Cloud → Service accounts → Keys`);
  return key.data;
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

/** A JWT for Google's token endpoint, signed with the key (RS256). */
export function signedJwt(key: ServiceAccount, scope: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(key.private_key).toString("base64url")}`;
}

const tokens = new Map<string, { token: string; expires: number }>();

/** An access token for the key and scope, reused until a minute before it expires. */
export async function accessToken(key: ServiceAccount, scope: string, signal?: AbortSignal): Promise<string> {
  const cacheKey = `${key.client_email} ${scope} ${tokenUrl()}`;
  const cached = tokens.get(cacheKey);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  let assertion: string;
  try {
    assertion = signedJwt(key, scope);
  } catch {
    throw new Error("The service account key's private key can't be read: paste the .json file again");
  }
  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal,
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    const why = body.error_description ?? body.error ?? `HTTP ${res.status}`;
    throw new Error(`Google refused the service account key (${why}). If you deleted or rotated the key, paste a new one.`);
  }
  tokens.set(cacheKey, { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

export function clearTokenCache(): void {
  tokens.clear();
}
