// A stand-in for Google's token endpoint and the Search Console API, for tests and the
// smoke test (ARCHITECTURE.md section 10). It checks the JWT's signature against the test key,
// serves one property with generated data, and records every request.
import { createServer } from "node:http";
import { createVerify, generateKeyPairSync } from "node:crypto";

export const STANDIN_PROPERTY = "sc-domain:example.com";

/** A throwaway service account key, as Google Cloud would download it. */
export function testServiceAccount(email = "startica@fieldnote-test.iam.gserviceaccount.com") {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = {
    type: "service_account",
    project_id: "fieldnote-test",
    private_key_id: "test",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    client_email: email,
    token_uri: "https://oauth2.googleapis.com/token",
  };
  return { key, json: JSON.stringify(key), publicKey: publicKey.export({ type: "spki", format: "pem" }) };
}

const QUERIES = [
  ["example app", 1.4, 0.3],
  ["field notes app", 7.8, 0.02],
  ["offline notebook for research", 12.5, 0.01],
  ["how to take field notes", 4.2, 0.01],
  ["example pricing", 1.1, 0.4],
];
const PAGES = ["https://example.com/", "https://example.com/pricing", "https://example.com/blog/field-notes"];

/** Rows for one day, made up but consistent: the same day always gives the same numbers. */
function dayRows(day, i) {
  const rows = { query: [], page: [], country: [], device: [] };
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  QUERIES.forEach(([q, position, ctr], n) => {
    const imp = 20 + ((i * 7 + n * 13) % 30) * (n + 1);
    const c = Math.round(imp * ctr);
    rows.query.push({ keys: [day, q], clicks: c, impressions: imp, position });
    clicks += c;
    impressions += imp;
    weighted += position * imp;
  });
  // Anonymized queries: the site total is a little more than the sum of the queries.
  impressions += 5;
  PAGES.forEach((p, n) => rows.page.push({ keys: [day, p], clicks: Math.round(clicks / (n + 2)), impressions: Math.round(impressions / (n + 1.5)), position: 3 + n * 4 }));
  rows.country.push({ keys: [day, "usa"], clicks: Math.round(clicks * 0.6), impressions: Math.round(impressions * 0.6), position: 5 }, { keys: [day, "gbr"], clicks: Math.round(clicks * 0.4), impressions: Math.round(impressions * 0.4), position: 6 });
  rows.device.push({ keys: [day, "DESKTOP"], clicks: Math.round(clicks * 0.7), impressions: Math.round(impressions * 0.7), position: 5 }, { keys: [day, "MOBILE"], clicks: Math.round(clicks * 0.3), impressions: Math.round(impressions * 0.3), position: 6 });
  return { total: { keys: [day], clicks, impressions, position: Math.round((weighted / (impressions - 5)) * 100) / 100 }, ...rows };
}

function verifyJwt(assertion, publicKey) {
  const [header, claims, signature] = String(assertion).split(".");
  if (!signature) return null;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${claims}`);
  if (!verifier.verify(publicKey, Buffer.from(signature, "base64url"))) return null;
  return JSON.parse(Buffer.from(claims, "base64url").toString());
}

export async function startGoogleStandin(port, { publicKey, clientEmail, days = 60, today = new Date() }) {
  const requests = [];
  const tokens = new Set();
  const read = (req) => new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
  });
  const json = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const dayList = Array.from({ length: days }, (_, i) => new Date(today.getTime() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const body = await read(req);
    requests.push({ method: req.method, path: url.pathname, body });
    if (url.pathname === "/token") {
      const claims = verifyJwt(new URLSearchParams(body).get("assertion"), publicKey);
      if (!claims || claims.iss !== clientEmail) return json(res, 400, { error: "invalid_grant", error_description: "Invalid JWT Signature." });
      const token = `token-${tokens.size + 1}`;
      tokens.add(token);
      return json(res, 200, { access_token: token, expires_in: 3600, token_type: "Bearer" });
    }
    if (!tokens.has((req.headers.authorization ?? "").replace("Bearer ", ""))) return json(res, 401, { error: { message: "Request had invalid authentication credentials." } });
    if (url.pathname === "/webmasters/v3/sites") return json(res, 200, { siteEntry: [{ siteUrl: STANDIN_PROPERTY, permissionLevel: "siteRestrictedUser" }] });
    const m = url.pathname.match(/^\/webmasters\/v3\/sites\/([^/]+)\/(searchAnalytics\/query|sitemaps)$/);
    if (!m) return json(res, 404, { error: { message: "Not found" } });
    if (decodeURIComponent(m[1]) !== STANDIN_PROPERTY) return json(res, 403, { error: { message: "User does not have sufficient permission for site." } });
    if (m[2] === "sitemaps") {
      return json(res, 200, { sitemap: [{ path: "https://example.com/sitemap.xml", lastSubmitted: "2026-09-01T10:00:00Z", lastDownloaded: "2026-10-10T04:00:00Z", isPending: false, errors: "0", warnings: "1", contents: [{ type: "web", submitted: "42" }] }] });
    }
    const q = JSON.parse(body || "{}");
    const kind = q.dimensions?.length === 1 ? "total" : q.dimensions?.[1];
    const all = dayList
      .map((day, i) => [day, i])
      .filter(([day]) => day >= q.startDate && day <= q.endDate)
      .flatMap(([day, i]) => {
        const rows = dayRows(day, i)[kind];
        return Array.isArray(rows) ? rows : [rows];
      });
    const start = q.startRow ?? 0;
    return json(res, 200, { rows: all.slice(start, start + (q.rowLimit ?? 1000)), responseAggregationType: "byProperty" });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export const BING_KEY = "bing-test-key";
export const BING_SITE = "https://example.com/";

/** A stand-in for Bing Webmaster Tools' JSON API: daily totals and weekly query and page rows. */
export async function startBingStandin(port, { today = new Date() } = {}) {
  const requests = [];
  const date = (daysBack) => `/Date(${today.getTime() - daysBack * 86400_000}-0700)/`;
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push(url.pathname);
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.searchParams.get("apikey") !== BING_KEY) return send(400, { ErrorCode: 3, Message: "InvalidApiKey" });
    const method = url.pathname.split("/").pop();
    if (method === "GetUserSites") return send(200, { d: [{ Url: BING_SITE, IsVerified: true }, { Url: "https://unverified.example/", IsVerified: false }] });
    if (url.searchParams.get("siteUrl") !== BING_SITE) return send(400, { ErrorCode: 14, Message: "NotAuthorized" });
    if (method === "GetRankAndTrafficStats") return send(200, { d: Array.from({ length: 30 }, (_, i) => ({ Date: date(29 - i), Clicks: 3 + (i % 4), Impressions: 80 + i })) });
    if (method === "GetQueryStats" || method === "GetPageStats") {
      const keys = method === "GetQueryStats" ? ["field notes app", "example"] : ["https://example.com/", "https://example.com/pricing"];
      return send(200, { d: [0, 7, 14, 21].flatMap((back) => keys.map((k, n) => ({ Date: date(back), Query: k, Clicks: 5 - n, Impressions: 60 + n * 10, AvgImpressionPosition: n ? 2.5 : -1, AvgClickPosition: 2 }))) });
    }
    return send(400, { ErrorCode: 16, Message: "Deprecated" });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}
