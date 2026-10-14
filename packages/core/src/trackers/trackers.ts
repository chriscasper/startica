import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { a11yIssueGroups, a11yImpacts, a11yOccurrences, issueTrackers, securityFindings, sitePages, sites, trackerIssues, type A11yImpact } from "@startica/db/schema";
import { putSecret, readSecret, updateSecret } from "@startica/db/secrets";
import type { AiContext } from "../ai/client.ts";
import { IMPACT_WEIGHT } from "../a11y/results.ts";
import { isPrivateHost } from "../a11y/urls.ts";
import { findingPages } from "../security/findings.ts";
import { describeDetail, findingInfo } from "../security/report.ts";
import { DEFAULT_BASE_URL, trackerClient, type TrackerClient } from "./client.ts";

/**
 * Issue trackers (ARCHITECTURE.md section 8.5): a product's GitHub or GitLab repository, where
 * Startica opens an issue per finding, by hand or automatically after a scan, and
 * closes it when the finding is fixed. Each finding maps to at most one repo issue.
 */

export const AUTO_CREATE_PER_RUN = 10; // a first scan of a big site can't flood the repo
const MAX_ELEMENTS_IN_ISSUE = 20;

type Tracker = typeof issueTrackers.$inferSelect;
type Group = typeof a11yIssueGroups.$inferSelect;

export const trackerInput = z.object({
  provider: z.enum(["github", "gitlab"]),
  base_url: z.string().trim().default(""),
  repo: z
    .string()
    .trim()
    .transform((v) => v.replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "").replace(/\/+$/, ""))
    .pipe(z.string().regex(/^[\w.-]+(\/[\w.-]+)+$/, "Enter the repository as owner/name (GitHub) or group/project (GitLab)")),
  token: z.string().trim().default(""),
  labels: z
    .string()
    .default("accessibility")
    .transform((v) =>
      v
        .split(/[\n,]/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 10),
    ),
  auto_min_impact: z.enum(["", ...a11yImpacts]).default(""),
  auto_min_security: z.enum(["", "critical", "high", "medium", "low"]).default(""),
  close_when_fixed: z.string().optional(),
});

/** The API address: the provider's default, or an https URL (http only for a server on this computer or network). */
export function trackerBaseUrl(provider: "github" | "gitlab", raw: string): string {
  if (!raw) return DEFAULT_BASE_URL[provider];
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter the server's address, e.g. https://gitlab.example.com");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isPrivateHost(url.hostname))) throw new Error("Use an https:// address for the server");
  return url.toString().replace(/\/$/, "");
}

export async function trackerFor(productId: string): Promise<Tracker | null> {
  const [row] = await getDb().select().from(issueTrackers).where(eq(issueTrackers.productId, productId));
  return row ?? null;
}

async function clientFor(tracker: Tracker): Promise<TrackerClient> {
  const token = tracker.secretId ? await readSecret(tracker.secretId) : null;
  if (!token) throw new Error("No token saved for the issue tracker");
  return trackerClient(tracker.provider, tracker.baseUrl, tracker.repo, token);
}

async function recordStatus(trackerId: string, error: unknown) {
  await getDb()
    .update(issueTrackers)
    .set(error ? { status: "error", lastError: error instanceof Error ? error.message : String(error) } : { status: "ok", lastError: null })
    .where(eq(issueTrackers.id, trackerId));
}

/** Saves (or updates) a product's tracker and checks the token can reach the repository. A blank token keeps the saved one. */
export async function saveTracker(workspaceId: string, productId: string, input: z.infer<typeof trackerInput>): Promise<string> {
  const baseUrl = trackerBaseUrl(input.provider, input.base_url);
  const existing = await trackerFor(productId);
  if (!existing?.secretId && !input.token) throw new Error("Paste an access token");
  const values = {
    provider: input.provider,
    baseUrl,
    repo: input.repo,
    labels: input.labels,
    autoMinImpact: input.auto_min_impact || null,
    autoMinSecurity: input.auto_min_security || null,
    closeWhenFixed: input.close_when_fixed === "on",
  };
  let id = existing?.id;
  // Another repository (or server): the issue numbers Startica recorded belong to the old one,
  // so forget them rather than close or comment on unrelated issues in the new one.
  if (existing && (existing.provider !== values.provider || existing.baseUrl !== baseUrl || existing.repo.toLowerCase() !== values.repo.toLowerCase())) {
    await getDb().delete(trackerIssues).where(eq(trackerIssues.trackerId, existing.id));
  }
  if (existing) await getDb().update(issueTrackers).set({ ...values, status: "untested", lastError: null }).where(eq(issueTrackers.id, existing.id));
  else id = (await getDb().insert(issueTrackers).values({ workspaceId, productId, ...values }).returning({ id: issueTrackers.id }))[0]!.id;
  if (input.token) {
    if (existing?.secretId) await updateSecret(existing.secretId, input.token);
    else {
      const secretId = await putSecret(`issue-tracker-${id}`, input.token);
      await getDb().update(issueTrackers).set({ secretId }).where(eq(issueTrackers.id, id!));
    }
  }
  const tracker = (await trackerFor(productId))!;
  try {
    await (await clientFor(tracker)).checkAccess();
    await recordStatus(tracker.id, null);
  } catch (error) {
    await recordStatus(tracker.id, error);
    throw error;
  }
  return tracker.id;
}

// --- Issue text -----------------------------------------------------------------------

/** Title and Markdown body for an accessibility issue group: what fails, where, and how to fix it. */
export async function a11yIssueText(group: Group, labels: string[], now = new Date()) {
  const elements = await getDb()
    .select({ url: sitePages.url, selector: a11yOccurrences.selector, html: a11yOccurrences.html, failureSummary: a11yOccurrences.failureSummary })
    .from(a11yOccurrences)
    .innerJoin(sitePages, eq(sitePages.id, a11yOccurrences.pageId))
    .where(eq(a11yOccurrences.groupId, group.id))
    .orderBy(asc(sitePages.url))
    .limit(MAX_ELEMENTS_IN_ISSUE);
  const pages = group.pagesCount === 1 ? "1 page" : `${group.pagesCount} pages`;
  const title = `Accessibility: ${group.help}${group.pagesCount > 1 ? ` (${pages})` : ""}`.slice(0, 250);
  const fence = "````"; // four backticks, so a snippet containing ``` can't break out
  const lines = [
    `**Impact:** ${group.impact ?? "unknown"} · **WCAG:** ${group.criteria.join(", ") || "–"}${group.level ? ` (${group.level})` : ""} · **Rule:** \`${group.ruleId}\``,
    "",
    group.description,
    "",
    ...(group.helpUrl ? [`**How to fix:** ${group.helpUrl}`, ""] : []),
    ...(group.pagesCount > 1 ? ["The same element fails on several pages, so it's probably in a shared template or component: fixing it there fixes every page.", ""] : []),
    `### Where it fails (${pages}, ${group.occurrencesCount} element${group.occurrencesCount === 1 ? "" : "s"})`,
    "",
    ...elements.flatMap((e) => [
      `- ${e.url}`,
      `  \`${e.selector.replace(/`/g, "'")}\``,
      `  ${fence}html`,
      ...e.html.split("\n").map((l) => `  ${l}`),
      `  ${fence}`,
      ...(e.failureSummary ? [`  ${e.failureSummary.split("\n").slice(0, 3).join(" ").replace(/\s+/g, " ").trim()}`] : []),
    ]),
    ...(group.occurrencesCount > elements.length ? ["", `…and ${group.occurrencesCount - elements.length} more elements, listed in Startica.`] : []),
    "",
    "---",
    `Found by Startica's automated accessibility checks on ${now.toISOString().slice(0, 10)}. Automated checks cover only part of WCAG; please also check this by hand.`,
    `<!-- startica:a11y:${group.id} -->`,
  ];
  return { title, body: lines.join("\n"), labels };
}

// --- Creating, closing, syncing ----------------------------------------------------------

async function productOfGroup(groupId: string) {
  const [row] = await getDb()
    .select({ group: a11yIssueGroups, productId: sites.productId })
    .from(a11yIssueGroups)
    .innerJoin(sites, eq(sites.id, a11yIssueGroups.siteId))
    .where(eq(a11yIssueGroups.id, groupId));
  if (!row) throw new Error("Issue not found");
  return row;
}

export async function trackerIssueFor(trackerId: string, groupId: string) {
  const [row] = await getDb()
    .select()
    .from(trackerIssues)
    .where(and(eq(trackerIssues.trackerId, trackerId), eq(trackerIssues.sourceKind, "a11y"), eq(trackerIssues.sourceId, groupId)));
  return row ?? null;
}

async function openIssue(tracker: Tracker, client: TrackerClient, group: Group) {
  const created = await client.createIssue(await a11yIssueText(group, tracker.labels));
  await getDb()
    .insert(trackerIssues)
    .values({ workspaceId: tracker.workspaceId, trackerId: tracker.id, sourceKind: "a11y", sourceId: group.id, number: created.number, url: created.url })
    .onConflictDoNothing();
  return created;
}

/** Opens a repo issue for one accessibility issue group (Create issue). Returns the existing one if there is one. */
export async function createIssueForGroup(groupId: string): Promise<{ url: string; number: number; existed: boolean }> {
  const { group, productId } = await productOfGroup(groupId);
  const tracker = await trackerFor(productId);
  if (!tracker) throw new Error("Connect GitHub or GitLab first (Settings → Products → Issue tracker)");
  const existing = await trackerIssueFor(tracker.id, group.id);
  if (existing) return { url: existing.url, number: existing.number, existed: true };
  try {
    const created = await openIssue(tracker, await clientFor(tracker), group);
    await recordStatus(tracker.id, null);
    return { ...created, existed: false };
  } catch (error) {
    await recordStatus(tracker.id, error);
    throw error;
  }
}

const atLeast = (impact: A11yImpact | null, min: A11yImpact) => IMPACT_WEIGHT[impact ?? "minor"] >= IMPACT_WEIGHT[min];

export const trackerSyncPayload = z.object({ workspaceId: z.guid(), productId: z.guid() });

/**
 * After a scan: opens issues for new findings at or above the tracker's impact (at most
 * AUTO_CREATE_PER_RUN, most important first), closes the ones Startica sees fixed, and
 * reopens them if the problem comes back. Ignored findings are left alone.
 */
export async function runTrackerSync(_ctx: AiContext, payload: z.infer<typeof trackerSyncPayload>) {
  const tracker = await trackerFor(payload.productId);
  if (!tracker || (!tracker.autoMinImpact && !tracker.autoMinSecurity && !tracker.closeWhenFixed)) return { skipped: "nothing to do" };
  const siteIds = (await getDb().select({ id: sites.id }).from(sites).where(eq(sites.productId, payload.productId))).map((s) => s.id);
  if (siteIds.length === 0) return { skipped: "no sites" };
  const groups = await getDb()
    .select()
    .from(a11yIssueGroups)
    .where(and(inArray(a11yIssueGroups.siteId, siteIds), eq(a11yIssueGroups.kind, "violation")));
  const issues = await getDb().select().from(trackerIssues).where(and(eq(trackerIssues.trackerId, tracker.id), eq(trackerIssues.sourceKind, "a11y")));
  const issueOf = new Map(issues.map((i) => [i.sourceId, i]));
  const done = { created: 0, closed: 0, reopened: 0 };
  try {
    const client = await clientFor(tracker);
    if (tracker.autoMinImpact) {
      const min = tracker.autoMinImpact;
      const candidates = groups
        .filter((g) => g.status === "open" && !issueOf.has(g.id) && atLeast(g.impact, min))
        .sort((a, b) => IMPACT_WEIGHT[b.impact ?? "minor"] * b.pagesCount - IMPACT_WEIGHT[a.impact ?? "minor"] * a.pagesCount)
        .slice(0, AUTO_CREATE_PER_RUN);
      for (const group of candidates) {
        await openIssue(tracker, client, group);
        done.created++;
      }
    }
    if (tracker.closeWhenFixed) {
      for (const group of groups) {
        const issue = issueOf.get(group.id);
        if (!issue) continue;
        if (group.status === "fixed" && issue.state === "open") {
          await client.comment(issue.number, "Startica's latest scan no longer finds this problem on any page, so it's closing this issue. It will reopen it if the problem comes back.");
          await client.setState(issue.number, "closed");
          await getDb().update(trackerIssues).set({ state: "closed" }).where(eq(trackerIssues.id, issue.id));
          done.closed++;
        } else if (group.status === "open" && issue.state === "closed") {
          await client.setState(issue.number, "open");
          await client.comment(issue.number, `Startica's latest scan found this problem again, on ${group.pagesCount === 1 ? "1 page" : `${group.pagesCount} pages`}.`);
          await getDb().update(trackerIssues).set({ state: "open" }).where(eq(trackerIssues.id, issue.id));
          done.reopened++;
        }
      }
    }
    // Security findings (S2): the scans' and the monitor's own, never imported or reported ones.
    const security = await syncSecurityIssues(tracker, client, siteIds, AUTO_CREATE_PER_RUN - done.created);
    done.created += security.created;
    done.closed += security.closed;
    done.reopened += security.reopened;
    await recordStatus(tracker.id, null);
  } catch (error) {
    await recordStatus(tracker.id, error);
    throw error;
  }
  return done;
}

const SECURITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

async function syncSecurityIssues(tracker: Tracker, client: TrackerClient, siteIds: string[], room: number) {
  const done = { created: 0, closed: 0, reopened: 0 };
  if (!tracker.autoMinSecurity && !tracker.closeWhenFixed) return done;
  const findings = (await getDb().select().from(securityFindings).where(inArray(securityFindings.siteId, siteIds))).filter((f) => f.source === "scan" || f.source === "monitor");
  const issues = await getDb().select().from(trackerIssues).where(and(eq(trackerIssues.trackerId, tracker.id), eq(trackerIssues.sourceKind, "security")));
  const issueOf = new Map(issues.map((i) => [i.sourceId, i]));
  if (tracker.autoMinSecurity && room > 0) {
    const min = SECURITY_ORDER.indexOf(tracker.autoMinSecurity);
    const candidates = findings
      .filter((f) => f.status === "open" && !issueOf.has(f.id) && SECURITY_ORDER.indexOf(f.severity) <= min)
      .sort((a, b) => SECURITY_ORDER.indexOf(a.severity) - SECURITY_ORDER.indexOf(b.severity) || b.pagesCount - a.pagesCount)
      .slice(0, room);
    for (const f of candidates) {
      await openSecurityIssue(tracker, client, f);
      done.created++;
    }
  }
  if (tracker.closeWhenFixed) {
    for (const f of findings) {
      const issue = issueOf.get(f.id);
      if (!issue) continue;
      if (f.status === "fixed" && issue.state === "open") {
        await client.comment(issue.number, "Startica's latest check no longer finds this problem, so it's closing this issue. It will reopen it if the problem comes back.");
        await client.setState(issue.number, "closed");
        await getDb().update(trackerIssues).set({ state: "closed" }).where(eq(trackerIssues.id, issue.id));
        done.closed++;
      } else if (f.status === "open" && issue.state === "closed") {
        await client.setState(issue.number, "open");
        await client.comment(issue.number, "Startica's latest check found this problem again.");
        await getDb().update(trackerIssues).set({ state: "open" }).where(eq(trackerIssues.id, issue.id));
        done.reopened++;
      }
    }
  }
  return done;
}

async function openSecurityIssue(tracker: Tracker, client: TrackerClient, finding: typeof securityFindings.$inferSelect) {
  const pages = (await findingPages(finding.siteId, finding.groupKey)).map((p) => p.url);
  // The tracker's default label is "accessibility"; security issues get "security" instead.
  const labels = tracker.labels.filter((l) => l !== "accessibility");
  const created = await client.createIssue(securityIssueText(finding, pages, labels));
  await getDb()
    .insert(trackerIssues)
    .values({ workspaceId: tracker.workspaceId, trackerId: tracker.id, sourceKind: "security", sourceId: finding.id, number: created.number, url: created.url })
    .onConflictDoNothing();
  return created;
}

/** Queues a tracker sync for the product of a site whose scan just finished, if the product has one that does anything automatically. */
export async function queueTrackerSync(site: { workspaceId: string; productId: string }): Promise<void> {
  const tracker = await trackerFor(site.productId);
  if (tracker && (tracker.autoMinImpact || tracker.autoMinSecurity || tracker.closeWhenFixed)) await enqueue(site.workspaceId, "tracker_sync", { productId: site.productId });
}

// --- Security findings (ARCHITECTURE.md section 11.2) ----------------------------------------------

/** The repo issue for a security finding: what it is, why it matters, how to fix it, where. */
export function securityIssueText(finding: typeof securityFindings.$inferSelect, pages: string[], labels: string[], now = new Date()) {
  const info = findingInfo(finding);
  const title = `Security: ${info.title}${pages.length > 1 ? ` (${pages.length} pages)` : ""}`;
  const detail = describeDetail(finding.detail);
  const lines = [
    `**Severity:** ${finding.severity}${info.owasp ? ` · ${info.owasp}` : ""}${info.sourceLabel ? ` · ${info.sourceLabel}` : ""}`,
    ...(detail ? ["", `**Seen:** ${detail}`] : []),
    "",
    `**Why it matters:** ${info.why}`,
    "",
    `**How to fix:** ${info.fix}`,
    ...(pages.length ? ["", `**Pages (${pages.length}):**`, ...pages.slice(0, MAX_ELEMENTS_IN_ISSUE).map((u) => `- ${u}`)] : []),
    "",
    "---",
    finding.source === "scan" ? `Found by Startica's automated security checks on ${now.toISOString().slice(0, 10)}.` : `Tracked in Startica on ${now.toISOString().slice(0, 10)}.`,
    `<!-- startica:security:${finding.id} -->`,
  ];
  return { title, body: lines.join("\n"), labels: labels.length ? labels : ["security"] };
}

/** Opens a repo issue for one security finding (Create issue). Returns the existing one if there is one. */
export async function createIssueForSecurityFinding(findingId: string): Promise<{ url: string; number: number; existed: boolean }> {
  const [row] = await getDb()
    .select({ finding: securityFindings, productId: sites.productId })
    .from(securityFindings)
    .innerJoin(sites, eq(sites.id, securityFindings.siteId))
    .where(eq(securityFindings.id, findingId));
  if (!row) throw new Error("Finding not found");
  const tracker = await trackerFor(row.productId);
  if (!tracker) throw new Error("Connect GitHub or GitLab first (Settings → Products → Issue tracker)");
  const [existing] = await getDb()
    .select()
    .from(trackerIssues)
    .where(and(eq(trackerIssues.trackerId, tracker.id), eq(trackerIssues.sourceKind, "security"), eq(trackerIssues.sourceId, findingId)));
  if (existing) return { url: existing.url, number: existing.number, existed: true };
  try {
    const created = await openSecurityIssue(tracker, await clientFor(tracker), row.finding);
    await recordStatus(tracker.id, null);
    return { ...created, existed: false };
  } catch (error) {
    await recordStatus(tracker.id, error);
    throw error;
  }
}
