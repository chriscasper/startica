// Stand-in for the public services exposure monitoring uses (ARCHITECTURE.md section 11.4):
// crt.sh, OSV.dev, FIRST's EPSS API and CISA's KEV feed, with fixed answers. Point the
// app at it with STARTICA_SECURITY_API_BASE=<url>. Also serves a "third-party" script
// whose content can be changed, to test change detection. Used by tests and the smoke run.
import { createServer } from "node:http";

const VULNS = {
  "GHSA-gxr4-xjj5-5px2": { id: "GHSA-gxr4-xjj5-5px2", summary: "Potential XSS vulnerability in jQuery's htmlPrefilter", aliases: ["CVE-2020-11022"], database_specific: { severity: "MODERATE" }, affected: [{ ranges: [{ events: [{ introduced: "1.2.0" }, { fixed: "3.5.0" }] }] }] },
  "GHSA-jpcq-cgw6-v4j6": { id: "GHSA-jpcq-cgw6-v4j6", summary: "Potential XSS vulnerability in jQuery when passing <option> elements", aliases: ["CVE-2020-11023"], database_specific: { severity: "MODERATE" }, affected: [{ ranges: [{ events: [{ introduced: "1.0.3" }, { fixed: "3.5.0" }] }] }] },
};
const VULNERABLE = { "jquery@1.12.4": ["GHSA-gxr4-xjj5-5px2", "GHSA-jpcq-cgw6-v4j6"] };
const EPSS = { "CVE-2020-11022": ["0.02251", "0.84"], "CVE-2020-11023": ["0.11743", "0.95"] };
const KEV = ["CVE-2020-11023"];

/** Starts the stand-in; resolves to { url, close, setScript(text), requests }. */
export function startSecurityStandin(port = 0) {
  let script = "console.log('widget v1');";
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    requests.push(`${req.method} ${url.pathname}`);
    const json = (body, status = 200) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (url.pathname === "/crtsh/") {
      const domain = (url.searchParams.get("q") ?? "").replace(/^%\./, "");
      return json([
        { id: 1001, issuer_name: "C=US, O=Example Trust CA, CN=Example R1", name_value: `${domain}\nwww.${domain}`, not_before: "2026-08-01T00:00:00", not_after: "2026-10-30T00:00:00", entry_timestamp: "2026-08-01T00:05:00" },
        { id: 1002, issuer_name: "C=US, O=Example Trust CA, CN=Example R1", name_value: `app.${domain}\n*.${domain}`, not_before: "2026-09-01T00:00:00", not_after: "2026-11-30T00:00:00", entry_timestamp: "2026-09-01T00:05:00" },
        { id: 1003, issuer_name: "C=US, O=Old Hosting CA", name_value: `old-shop.${domain}`, not_before: "2024-01-01T00:00:00", not_after: "2024-04-01T00:00:00", entry_timestamp: "2024-01-01T00:05:00" },
      ]);
    }
    if (url.pathname === "/osv/v1/querybatch" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { queries } = JSON.parse(body);
      return json({ results: queries.map((q) => ({ vulns: (VULNERABLE[`${q.package.name}@${q.version}`] ?? []).map((id) => ({ id, modified: "2025-01-01T00:00:00Z" })) })) });
    }
    if (url.pathname.startsWith("/osv/v1/vulns/")) {
      const v = VULNS[decodeURIComponent(url.pathname.slice("/osv/v1/vulns/".length))];
      return v ? json(v) : json({ message: "Bug not found" }, 404);
    }
    if (url.pathname === "/epss") {
      const cves = (url.searchParams.get("cve") ?? "").split(",").filter(Boolean);
      return json({ data: cves.filter((c) => EPSS[c]).map((cve) => ({ cve, epss: EPSS[cve][0], percentile: EPSS[cve][1], date: "2026-10-12" })) });
    }
    if (url.pathname === "/kev.json") return json({ title: "Stand-in KEV", vulnerabilities: KEV.map((cveID) => ({ cveID })) });
    if (url.pathname === "/widget.js") return res.writeHead(200, { "content-type": "application/javascript" }).end(script);
    res.writeHead(404).end();
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        requests,
        setScript: (text) => void (script = text),
        close: () => new Promise((r) => server.close(() => r())),
      }),
    );
  });
}
