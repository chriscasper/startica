// Stand-in GitHub and GitLab issue APIs for tests (ARCHITECTURE.md section 8.5): just the
// endpoints Startica calls, issues kept in memory, one valid token ("test-token").
//   const api = await startTrackerStandin(0); api.url; api.issues; await api.close();
import { createServer } from "node:http";

export const STANDIN_TOKEN = "test-token";

export function startTrackerStandin(port = 0) {
  /** Every issue opened, by "provider:repo#number". */
  const issues = new Map();
  let next = 1;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const body = await new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
    });
    const send = (status, data) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const base = `http://${req.headers.host}`;

    // GitHub: /repos/:owner/:name[/issues[/:n[/comments]]]
    let m = /^\/repos\/([^/]+\/[^/]+)(?:\/issues(?:\/(\d+)(\/comments)?)?)?$/.exec(url.pathname);
    if (m) {
      if (req.headers.authorization !== `Bearer ${STANDIN_TOKEN}`) return send(401, { message: "Bad credentials" });
      const [, repo, number, comments] = m;
      if (!number && !url.pathname.endsWith("/issues")) return send(200, { full_name: repo, has_issues: true });
      if (!number && req.method === "POST") {
        const n = next++;
        issues.set(`github:${repo}#${n}`, { ...body, state: "open", comments: [] });
        return send(201, { number: n, html_url: `${base}/${repo}/issues/${n}` });
      }
      const issue = issues.get(`github:${repo}#${number}`);
      if (!issue) return send(404, { message: "Not Found" });
      if (comments) issue.comments.push(body.body);
      else if (req.method === "PATCH") issue.state = body.state;
      return send(200, { number: Number(number) });
    }

    // GitLab: /api/v4/projects/:id[/issues[/:iid[/notes]]]
    m = /^\/api\/v4\/projects\/([^/]+)(?:\/issues(?:\/(\d+)(\/notes)?)?)?$/.exec(url.pathname);
    if (m) {
      if (req.headers["private-token"] !== STANDIN_TOKEN) return send(401, { message: "401 Unauthorized" });
      const repo = decodeURIComponent(m[1]);
      const [, , iid, notes] = m;
      if (!iid && !url.pathname.endsWith("/issues")) return send(200, { path_with_namespace: repo, issues_enabled: true });
      if (!iid && req.method === "POST") {
        const n = next++;
        issues.set(`gitlab:${repo}#${n}`, { title: body.title, body: body.description, labels: String(body.labels ?? "").split(",").filter(Boolean), state: "open", comments: [] });
        return send(201, { iid: n, web_url: `${base}/${repo}/-/issues/${n}` });
      }
      const issue = issues.get(`gitlab:${repo}#${iid}`);
      if (!issue) return send(404, { message: "404 Not found" });
      if (notes) issue.comments.push(body.body);
      else if (req.method === "PUT") issue.state = body.state_event === "close" ? "closed" : "open";
      return send(200, { iid: Number(iid) });
    }
    send(404, { message: "Not Found" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve({ url: `http://localhost:${server.address().port}`, issues, close: () => new Promise((r) => server.close(() => r())) }),
    );
  });
}
