// Stand-in site for site scans (ARCHITECTURE.md sections 9.2 and 11.2): static pages with
// known failures, a robots.txt that disallows /private/, and a sitemap listing a
// page nothing links to. Security problems are planted in the responses: no security
// headers except on /clean.html, a version in X-Powered-By, a session cookie without
// HttpOnly or SameSite on /signup.html, a public /.git/HEAD and no security.txt. Content
// problems (A5) are on /about.html: a misspelling, a hard-to-read paragraph, an untagged
// PDF without a title or language, and a link to a missing page on another host.
// Used by both smoke tests and for manual runs:
//   node packages/core/src/a11y/standin/server.mjs [port]   (default 58395)
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml", ".pdf": "application/pdf" };

// Every security header Startica checks for, as a well-configured site sends them.
const SECURE_HEADERS = {
  "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

/** The planted security problems: response headers per page path. */
export function standinHeaders(path) {
  if (path === "/clean.html") return SECURE_HEADERS;
  return { "x-powered-by": "Standin/1.2", ...(path === "/signup.html" ? { "set-cookie": "session=standin; Path=/" } : {}) };
}

/**
 * Starts the stand-in site; resolves to { url, close }. `transform(path, html)` lets a
 * test serve a changed page (e.g. a fixed one) without touching the files;
 * `headers(path, planted)` changes a page's response headers the same way.
 */
export function startStandin(port = 58395, { transform, headers } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const base = `http://${req.headers.host}`;
    if (url.pathname === "/robots.txt") {
      res.writeHead(200, { "content-type": types[".txt"] });
      // GPTBot (training) and OAI-SearchBot (AI search) are blocked: SEO checks report both, the search one as a problem.
      return res.end(`User-agent: *\nDisallow: /private/\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n\nSitemap: ${base}/sitemap.xml\n`);
    }
    if (url.pathname === "/sitemap.xml") {
      res.writeHead(200, { "content-type": types[".xml"] });
      const pages = ["/", "/pricing.html", "/sitemap-only.html"];
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((p) => `<url><loc>${base}${p}</loc></url>`).join("")}</urlset>`);
    }
    if (url.pathname === "/.git/HEAD") {
      // A deployed Git folder: Security reports it as exposed.
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end("ref: refs/heads/main\n");
    }
    const path = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
    if (path.endsWith(".mjs")) return notFound(res);
    try {
      const body = await readFile(join(root, path));
      const extra = path.endsWith(".html") ? (headers ? headers(path, standinHeaders(path)) : standinHeaders(path)) : {};
      res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream", ...extra });
      // {{OTHER_ORIGIN}}: the same server under another host name (127.0.0.1), so a link to it is a link to another site (A5's external links).
      const html = path.endsWith(".html") ? body.toString("utf8").replaceAll("{{OTHER_ORIGIN}}", `http://127.0.0.1:${req.socket.localPort}`) : null;
      res.end(html === null ? body : transform ? transform(path, html) : html);
    } catch {
      notFound(res);
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    // Port 0 picks a free port (unit tests).
    server.listen(port, "127.0.0.1", () =>
      resolve({ url: `http://localhost:${server.address().port}`, close: () => new Promise((r) => (server.close(() => r()), server.closeAllConnections())) }),
    );
  });
}

function notFound(res) {
  res.writeHead(404, { "content-type": types[".html"] });
  res.end('<!doctype html><html lang="en"><title>Not found</title><h1>Not found</h1></html>');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startStandin(Number(process.argv[2] ?? 58395));
  console.log(`Accessibility stand-in site: ${url}`);
}
