"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { NO_SCANNER } from "@startica/core/a11y/scan";
import { getScanner } from "@startica/core/a11y/scanner";
import { confirmOwnership, createSite, deleteSite, groupPageUrls, ownSite, siteInput, startPageCheck, startSiteScan, updateSite } from "@startica/core/a11y/sites";
import { a11yIssueGroups, a11yOccurrences, sitePages } from "@startica/db/schema";
import { hasAiKey } from "@startica/core/ai/client";
import { requestAltReview, requestFix, requestReviewHelp, requestSummary } from "@startica/core/a11y/ai";
import { addRule, ignoreWord, removeRule, ruleInput, setReadabilityTarget } from "@startica/core/a11y/content";
import { queueContentCheck } from "@startica/core/a11y/documents";
import { criterionToRoadmap, reviewInput as manualReviewInput, saveCriterionReview, saveStatementInput, statementInput } from "@startica/core/a11y/manual";
import { addGroupToRoadmap, ignoreGroup, ignoreInput, reviewGroup, reviewInput, unignoreGroup } from "@startica/core/a11y/track";
import { createIssueForGroup } from "@startica/core/trackers/trackers";
import { refresh } from "next/cache";
import type { ActionResult } from "@/components/app/form-dialog";
import { fail, formFields, id, mutate, productScope } from "@/lib/actions";
import { db, getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";

/** Accessibility (ARCHITECTURE.md section 9): sites, scans and rechecks. Scanning itself runs as jobs. */

async function site(siteId: string) {
  return ownSite((await getWorkspace()).id, id.parse(siteId));
}

function requireScanner() {
  if (desktopApp().demo) throw new Error("Scans are off in the demo, like every other outside call.");
  if (!getScanner()) throw new Error(NO_SCANNER);
}

export async function addSite(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const fields = formFields(formData);
    confirmOwnership.parse(fields.owner);
    const scope = await productScope(productId);
    await createSite(scope.workspaceId, scope.productId, siteInput.parse(fields));
  });
}

export async function saveSite(siteId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const s = await site(siteId);
    await updateSite(s.id, siteInput.parse(formFields(formData)));
  });
}

export async function removeSite(siteId: string): Promise<ActionResult> {
  return mutate(async () => deleteSite((await site(siteId)).id));
}

export async function scanSite(siteId: string): Promise<ActionResult> {
  return mutate(async () => {
    requireScanner();
    await startSiteScan(await site(siteId));
  });
}

export async function checkPage(siteId: string, formData: FormData): Promise<ActionResult> {
  try {
    requireScanner();
    const s = await site(siteId);
    const { url } = z.object({ url: z.string().trim().min(1, "Paste the page's address") }).parse(formFields(formData));
    // A path on its own ("/pricing") is read against the site's address.
    await startPageCheck(s, [new URL(url, s.startUrl).toString()]);
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function recheckPage(pageId: string): Promise<ActionResult> {
  return mutate(async () => {
    requireScanner();
    const workspace = await getWorkspace();
    const [page] = await (await db())
      .select({ url: sitePages.url, siteId: sitePages.siteId })
      .from(sitePages)
      .where(and(eq(sitePages.id, id.parse(pageId)), eq(sitePages.workspaceId, workspace.id)));
    if (!page) throw new Error("Page not found");
    await startPageCheck(await site(page.siteId), [page.url]);
  });
}

export async function recheckGroup(groupId: string): Promise<ActionResult> {
  return mutate(async () => {
    requireScanner();
    const workspace = await getWorkspace();
    const [group] = await (await db())
      .select({ id: a11yIssueGroups.id, siteId: a11yIssueGroups.siteId })
      .from(a11yIssueGroups)
      .where(and(eq(a11yIssueGroups.id, id.parse(groupId)), eq(a11yIssueGroups.workspaceId, workspace.id)));
    if (!group) throw new Error("Issue not found");
    const urls = await groupPageUrls(group.id);
    if (urls.length === 0) throw new Error("This issue isn't on any page right now; run a full scan instead");
    await startPageCheck(await site(group.siteId), urls.slice(0, 500), "group");
  });
}

/** Opens a GitHub/GitLab issue for an accessibility issue (or returns the one already open). */
export async function createTrackerIssue(groupId: string): Promise<{ error: string | null; url?: string; existed?: boolean }> {
  try {
    const workspace = await getWorkspace();
    const [group] = await (await db())
      .select({ id: a11yIssueGroups.id })
      .from(a11yIssueGroups)
      .where(and(eq(a11yIssueGroups.id, id.parse(groupId)), eq(a11yIssueGroups.workspaceId, workspace.id)));
    if (!group) throw new Error("Issue not found");
    const created = await createIssueForGroup(group.id);
    refresh();
    return { error: null, url: created.url, existed: created.existed };
  } catch (error) {
    return fail(error);
  }
}

// --- A2: ignore, review, roadmap, highlights (ARCHITECTURE.md section 9.3)

export async function ignoreIssue(groupId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => ignoreGroup((await getWorkspace()).id, id.parse(groupId), ignoreInput.parse(formFields(formData))));
}

export async function unignoreIssue(groupId: string): Promise<ActionResult> {
  return mutate(async () => unignoreGroup((await getWorkspace()).id, id.parse(groupId)));
}

export async function reviewItem(groupId: string, decision: "pass" | "fail" | "skip" | "undo", note = ""): Promise<ActionResult> {
  return mutate(async () => reviewGroup((await getWorkspace()).id, id.parse(groupId), reviewInput.parse({ decision, note })));
}

export async function issueToRoadmap(groupId: string): Promise<ActionResult> {
  return mutate(async () => addGroupToRoadmap((await getWorkspace()).id, id.parse(groupId)));
}

/** Opens the live page in the desktop app's viewer window with each failing element outlined. */
export async function openHighlights(pageId: string): Promise<ActionResult> {
  try {
    if (desktopApp().demo) throw new Error("The live page can't be opened in the demo, like every other outside call.");
    if (process.env.STARTICA_ELECTRON !== "1" || typeof process.send !== "function") throw new Error("Open with highlights works in the Startica desktop app");
    const workspace = await getWorkspace();
    const [page] = await (await db())
      .select({ url: sitePages.url, siteId: sitePages.siteId })
      .from(sitePages)
      .where(and(eq(sitePages.id, id.parse(pageId)), eq(sitePages.workspaceId, workspace.id)));
    if (!page) throw new Error("Page not found");
    await ownSite(workspace.id, page.siteId);
    const elements = await (await db())
      .select({ selector: a11yOccurrences.selector, impact: a11yOccurrences.impact, help: a11yIssueGroups.help })
      .from(a11yOccurrences)
      .innerJoin(a11yIssueGroups, eq(a11yIssueGroups.id, a11yOccurrences.groupId))
      .where(and(eq(a11yOccurrences.pageId, id.parse(pageId)), eq(a11yIssueGroups.status, "open")));
    process.send({ type: "a11y-highlight", url: page.url, elements: elements.slice(0, 200) });
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

// --- A3: AI help (ARCHITECTURE.md section 9.4)

async function aiReady() {
  if (desktopApp().demo) throw new Error("AI help is off in the demo, like every other outside call.");
  if (!(await hasAiKey())) throw new Error("Add an AI key first (Settings → General → AI)");
}

export async function suggestFix(groupId: string, formData?: FormData): Promise<ActionResult> {
  return mutate(async () => {
    await aiReady();
    const guidance = formData ? String(formData.get("guidance") ?? "").slice(0, 500) : undefined;
    await requestFix((await getWorkspace()).id, id.parse(groupId), guidance);
  });
}

export async function suggestReview(groupId: string): Promise<ActionResult> {
  return mutate(async () => {
    await aiReady();
    await requestReviewHelp((await getWorkspace()).id, id.parse(groupId));
  });
}

export async function reviewAltText(siteId: string): Promise<ActionResult> {
  return mutate(async () => {
    await aiReady();
    const workspace = await getWorkspace();
    await requestAltReview(workspace.id, (await ownSite(workspace.id, id.parse(siteId))).id);
  });
}

export async function summarize(siteId: string): Promise<ActionResult> {
  return mutate(async () => {
    await aiReady();
    const workspace = await getWorkspace();
    await requestSummary(workspace.id, (await ownSite(workspace.id, id.parse(siteId))).id);
  });
}

// --- A4: manual checklist, statement, report (ARCHITECTURE.md section 9.5)

export async function reviewCriterion(siteId: string, criterion: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => saveCriterionReview((await getWorkspace()).id, id.parse(siteId), criterion, manualReviewInput.parse(formFields(formData))));
}

export async function setCriterionStatus(siteId: string, criterion: string, status: "pass" | "fail" | "not_applicable" | "not_tested", note = ""): Promise<ActionResult> {
  return mutate(async () => saveCriterionReview((await getWorkspace()).id, id.parse(siteId), criterion, manualReviewInput.parse({ status, note })));
}

export async function criterionRoadmap(siteId: string, criterion: string): Promise<ActionResult> {
  return mutate(async () => criterionToRoadmap((await getWorkspace()).id, id.parse(siteId), criterion));
}

export async function saveStatement(siteId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => saveStatementInput((await getWorkspace()).id, id.parse(siteId), statementInput.parse(formFields(formData))));
}

/** Desktop app: asks the Electron process to save the printable report as a PDF (it asks where). */
export async function saveReportPdf(siteId: string): Promise<ActionResult> {
  try {
    if (process.env.STARTICA_ELECTRON !== "1" || typeof process.send !== "function") throw new Error("Save as PDF works in the desktop app; open the report and print it from your browser instead");
    const site = await ownSite((await getWorkspace()).id, id.parse(siteId));
    process.send({ type: "save-pdf", path: `/accessibility/report/print?site=${site.id}`, filename: `${new URL(site.startUrl).hostname}-accessibility-report.pdf` });
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

// --- A5: content quality and documents (ARCHITECTURE.md section 9.6)

export async function addContentRule(siteId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => addRule((await getWorkspace()).id, id.parse(siteId), ruleInput.parse(formFields(formData))));
}

export async function deleteContentRule(siteId: string, ruleId: string): Promise<ActionResult> {
  return mutate(async () => removeRule((await getWorkspace()).id, id.parse(siteId), id.parse(ruleId)));
}

export async function ignoreSpelling(siteId: string, word: string): Promise<ActionResult> {
  return mutate(async () => ignoreWord((await getWorkspace()).id, id.parse(siteId), word));
}

export async function saveReadabilityTarget(siteId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => setReadabilityTarget((await getWorkspace()).id, id.parse(siteId), Number(formData.get("target"))));
}

export async function checkContentNow(siteId: string): Promise<ActionResult> {
  return mutate(async () => {
    if (desktopApp().demo) throw new Error("Checks are off in the demo, like every other outside call.");
    const site = await ownSite((await getWorkspace()).id, id.parse(siteId));
    if (!(await queueContentCheck(site))) throw new Error("Already checking this site's documents and links");
  });
}
