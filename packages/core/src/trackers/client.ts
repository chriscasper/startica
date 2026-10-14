/**
 * GitHub and GitLab issue APIs, with the user's own token (ARCHITECTURE.md section 8.5).
 * Only what Startica needs: check access, open an issue, comment, close and reopen.
 */

export type TrackerProvider = "github" | "gitlab";
export type NewIssue = { title: string; body: string; labels: string[] };
export type CreatedIssue = { number: number; url: string };

export interface TrackerClient {
  /** Confirms the token can see the repository and that it takes issues; returns its display name. */
  checkAccess(): Promise<string>;
  createIssue(issue: NewIssue): Promise<CreatedIssue>;
  comment(number: number, body: string): Promise<void>;
  setState(number: number, state: "open" | "closed"): Promise<void>;
}

export const DEFAULT_BASE_URL: Record<TrackerProvider, string> = { github: "https://api.github.com", gitlab: "https://gitlab.com" };

const TIMEOUT_MS = 20_000;

export class TrackerError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "TrackerError";
  }
}

async function request<T>(url: string, init: RequestInit & { headers: Record<string, string> }, what: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new TrackerError(`Couldn't reach ${new URL(url).host} (${error instanceof Error ? error.message : String(error)})`, null);
  }
  if (!res.ok) {
    const detail = await res
      .json()
      .then((body: unknown) => {
        const b = body as { message?: unknown; error?: unknown };
        return String(b?.message ?? b?.error ?? "");
      })
      .catch(() => "");
    const hint =
      res.status === 401
        ? "the token is invalid or expired"
        : res.status === 403
          ? "the token isn't allowed to do this (check its permissions)"
          : res.status === 404
            ? "repository not found, or the token can't see it"
            : `HTTP ${res.status}`;
    throw new TrackerError(`${what} failed: ${hint}${detail ? ` (${detail.slice(0, 200)})` : ""}`, res.status);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export function githubClient(baseUrl: string, repo: string, token: string): TrackerClient {
  const api = `${baseUrl.replace(/\/$/, "")}/repos/${repo.split("/").map(encodeURIComponent).join("/")}`;
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" };
  return {
    async checkAccess() {
      const r = await request<{ full_name: string; has_issues: boolean }>(api, { headers }, "Reading the repository");
      if (!r.has_issues) throw new TrackerError(`Issues are turned off for ${r.full_name}`, null);
      return r.full_name;
    },
    async createIssue(issue) {
      const r = await request<{ number: number; html_url: string }>(`${api}/issues`, { method: "POST", headers, body: JSON.stringify(issue) }, "Opening the issue");
      return { number: r.number, url: r.html_url };
    },
    async comment(number, body) {
      await request(`${api}/issues/${number}/comments`, { method: "POST", headers, body: JSON.stringify({ body }) }, "Commenting");
    },
    async setState(number, state) {
      const body = state === "closed" ? { state, state_reason: "completed" } : { state };
      await request(`${api}/issues/${number}`, { method: "PATCH", headers, body: JSON.stringify(body) }, state === "closed" ? "Closing the issue" : "Reopening the issue");
    },
  };
}

export function gitlabClient(baseUrl: string, repo: string, token: string): TrackerClient {
  const api = `${baseUrl.replace(/\/$/, "")}/api/v4/projects/${encodeURIComponent(repo)}`;
  const headers = { "private-token": token, "content-type": "application/json" };
  return {
    async checkAccess() {
      const r = await request<{ path_with_namespace: string; issues_enabled?: boolean }>(api, { headers }, "Reading the project");
      if (r.issues_enabled === false) throw new TrackerError(`Issues are turned off for ${r.path_with_namespace}`, null);
      return r.path_with_namespace;
    },
    async createIssue(issue) {
      const r = await request<{ iid: number; web_url: string }>(
        `${api}/issues`,
        { method: "POST", headers, body: JSON.stringify({ title: issue.title, description: issue.body, labels: issue.labels.join(",") }) },
        "Opening the issue",
      );
      return { number: r.iid, url: r.web_url };
    },
    async comment(number, body) {
      await request(`${api}/issues/${number}/notes`, { method: "POST", headers, body: JSON.stringify({ body }) }, "Commenting");
    },
    async setState(number, state) {
      await request(`${api}/issues/${number}`, { method: "PUT", headers, body: JSON.stringify({ state_event: state === "closed" ? "close" : "reopen" }) }, state === "closed" ? "Closing the issue" : "Reopening the issue");
    },
  };
}

export function trackerClient(provider: TrackerProvider, baseUrl: string, repo: string, token: string): TrackerClient {
  return provider === "github" ? githubClient(baseUrl, repo, token) : gitlabClient(baseUrl, repo, token);
}
