// A stand-in for Umami v3's API, for tests and the smoke test: the same answer for every
// day (so totals are easy to check), a key, a website, and a username/password login.
import { createServer } from "node:http";

export const UMAMI_STANDIN_SITE = "4fb7a6c2-1d2e-4f00-9a1b-2c3d4e5f6a7b";
export const UMAMI_STANDIN_KEY = "umami_testkey";

export async function startUmamiStandin(port = 0) {
  const SITE = UMAMI_STANDIN_SITE;
  const KEY = UMAMI_STANDIN_KEY;
  const seen = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    seen.push(`${req.method} ${url.pathname}${url.searchParams.get("type") ? `?type=${url.searchParams.get("type")}` : ""}`);
    const send = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (url.pathname === "/api/auth/login") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      return req.on("end", () => {
        const { username, password } = JSON.parse(raw);
        if (username === "twofactor") return send(200, { requiresTwoFactor: true });
        return password === "secret" ? send(200, { token: KEY }) : send(401, { error: { code: "unauthorized", message: "Incorrect username and/or password." } });
      });
    }
    if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: "Unauthorized" });
    if (url.pathname === `/api/websites/${SITE}`) return send(200, { id: SITE, name: "Fieldnote", domain: "fieldnote.example" });
    if (url.pathname === `/api/websites/${SITE}/stats`) return send(200, { pageviews: 50, visitors: 18, visits: 20, bounces: 5, totaltime: 900, comparison: {} });
    if (url.pathname === `/api/websites/${SITE}/metrics/expanded`) {
      const type = url.searchParams.get("type");
      if (type === "referrer") return send(200, [{ name: "www.google.com", visits: 6 }, { name: "chatgpt.com", visits: 4 }, { name: "news.ycombinator.com", visits: 2 }]);
      if (type === "path") return send(200, [{ name: "/", visits: 12 }, { name: "/pricing?plan=team", visits: 8 }]);
      if (type === "utmContent") return send(200, [{ name: "draft-123", visits: 3 }]);
      if (type === "entry") return send(200, [{ name: "/", visits: 14 }, { name: "/pricing", visits: 6 }]);
      if (type === "country") return send(200, [{ name: "US", visits: 11 }, { name: "DE", visits: 5 }, { name: "", visits: 4 }]);
      if (type === "device") return send(200, [{ name: "desktop", visits: 9 }, { name: "laptop", visits: 3 }, { name: "mobile", visits: 8 }]);
      if (type === "browser") return send(200, [{ name: "firefox", visits: 12 }, { name: "safari", visits: 8 }]);
      return send(400, { error: "Bad type" });
    }
    if (url.pathname === `/api/websites/${SITE}/events/series`) {
      // Like Umami: dates in the requested time zone (here, this computer's).
      const days = [0, 1, 2].map((i) => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() - i).toLocaleDateString("en-CA"); });
      return send(200, days.flatMap((d) => [{ x: "signup", t: `${d}T00:00:00Z`, y: 2 }, { x: "newsletter", t: `${d}T00:00:00Z`, y: 1 }]));
    }
    if (url.pathname === `/api/websites/${SITE}/attribution`) return send(200, { utm_content: [{ name: "draft-123", value: 1 }], total: {} });
    send(404, { error: "Not found" });
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/api`, seen, close: () => new Promise((r) => server.close(r)) };
}
