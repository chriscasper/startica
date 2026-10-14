"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { products, securityReports, sites } from "@startica/db/schema";
import { hasAiKey } from "@startica/core/ai/client";
import { addReport, importInput, reportInput, reportToFinding, requestExplain, requestImport, requestTriage } from "@startica/core/security/ai";
import { buildDisclosurePolicy, buildSecurityTxt, policyInput, securityTxtInput, securityTxtProblems } from "@startica/core/security/disclosure";
import { enqueue } from "@startica/db/queue";
import { getScanner } from "@startica/core/a11y/scanner";
import { NO_SCANNER } from "@startica/core/a11y/scan";
import { ownSite, startPageCheck } from "@startica/core/a11y/sites";
import { addFindingToRoadmap } from "@startica/core/security/actions";
import { decideFinding, decisionInput, findingPages, ownFinding } from "@startica/core/security/findings";
import { SECURITY_RULES, isSecurityRule } from "@startica/core/security/rules";
import { verifySite, type VerifyAttempt } from "@startica/core/security/verify";
import { queueMonitor } from "@startica/core/security/monitor";
import { createIssueForSecurityFinding } from "@startica/core/trackers/trackers";
import { jobByPayload } from "@startica/core/jobs/cancel";
import type { ActionResult } from "@/components/app/form-dialog";
import { fail, formFields, id, mutate, productScope } from "@/lib/actions";
import { db, getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";

/** Security (ARCHITECTURE.md section 11): verification, decisions on findings, rechecks. Checks themselves run in scans and jobs. */

function noDemo() {
  if (desktopApp().demo) throw new Error("Checks are off in the demo, like every other outside call.");
}

/** Tries Search Console, the DNS record and the file; says which worked or why none did. */
export async function verifyOwnership(siteId: string): Promise<{ error: string | null; verified?: boolean; attempts?: VerifyAttempt[] }> {
  try {
    noDemo();
    const site = await ownSite((await getWorkspace()).id, id.parse(siteId));
    const result = await verifySite(site);
    refresh();
    return { error: null, ...result };
  } catch (error) {
    return fail(error);
  }
}

export async function decide(findingId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => decideFinding((await getWorkspace()).id, id.parse(findingId), decisionInput.parse(formFields(formData))));
}

export async function reopen(findingId: string): Promise<ActionResult> {
  return mutate(async () => decideFinding((await getWorkspace()).id, id.parse(findingId), { status: "open", reason: "" }));
}

/** Site-wide findings rerun the site probes; page findings recheck their pages. */
export async function recheckFinding(findingId: string): Promise<ActionResult> {
  return mutate(async () => {
    noDemo();
    const workspace = await getWorkspace();
    const { finding, site } = await ownFinding(workspace.id, id.parse(findingId));
    if (finding.source === "monitor") {
      if (!(await queueMonitor(site))) throw new Error("Monitoring is already running for this site");
      return;
    }
    if (finding.source !== "scan") throw new Error("Startica doesn't check imported or reported findings; mark it fixed when it's done");
    const scope = isSecurityRule(finding.rule) ? SECURITY_RULES[finding.rule].scope : "site";
    if (scope === "site") {
      if (await jobByPayload(workspace.id, ["security_recheck"], "siteId", site.id)) throw new Error("A recheck of this site is already under way");
      await enqueue(workspace.id, "security_recheck", { siteId: site.id });
      return;
    }
    if (!getScanner()) throw new Error(NO_SCANNER);
    const urls = (await findingPages(site.id, finding.groupKey)).map((p) => p.url);
    if (urls.length === 0) throw new Error("This finding isn't on any page right now; run a full scan instead");
    await startPageCheck(site, urls.slice(0, 500), "group");
  });
}

export async function addToRoadmap(findingId: string): Promise<ActionResult> {
  return mutate(async () => addFindingToRoadmap((await getWorkspace()).id, id.parse(findingId)));
}

/** Opens a GitHub/GitLab issue for a finding (or returns the one already open). */
export async function createSecurityIssue(findingId: string): Promise<{ error: string | null; url?: string; existed?: boolean }> {
  try {
    const { finding } = await ownFinding((await getWorkspace()).id, id.parse(findingId));
    const created = await createIssueForSecurityFinding(finding.id);
    refresh();
    return { error: null, url: created.url, existed: created.existed };
  } catch (error) {
    return fail(error);
  }
}

// --- S4: AI help, imported reports, the disclosure kit and reported problems

async function needAiKey() {
  if (!(await hasAiKey())) throw new Error("Add an AI key first (Settings → General → AI)");
}

export async function explainFinding(findingId: string): Promise<ActionResult> {
  return mutate(async () => {
    noDemo();
    await needAiKey();
    await requestExplain((await getWorkspace()).id, id.parse(findingId));
  });
}

export async function markFixed(findingId: string): Promise<ActionResult> {
  return mutate(async () => decideFinding((await getWorkspace()).id, id.parse(findingId), { status: "fixed", reason: "" }));
}

export async function importReport(siteId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    noDemo();
    await needAiKey();
    const workspace = await getWorkspace();
    const site = await ownSite(workspace.id, id.parse(siteId));
    if (!site.securityVerifiedAt) throw new Error("Verify the site first");
    await requestImport(workspace.id, site.id, importInput.parse(formFields(formData)));
  });
}

export async function generateSecurityTxt(siteId: string, formData: FormData): Promise<{ error: string | null; text?: string; problems?: string[] }> {
  try {
    const site = await ownSite((await getWorkspace()).id, id.parse(siteId));
    const text = buildSecurityTxt(site.startUrl, securityTxtInput.parse(formFields(formData)));
    return { error: null, text, problems: securityTxtProblems(text) };
  } catch (error) {
    return fail(error);
  }
}

export async function generatePolicy(productId: string, formData: FormData): Promise<{ error: string | null; text?: string }> {
  try {
    const scope = await productScope(productId);
    const [product] = await (await db()).select({ name: products.name }).from(products).where(eq(products.id, scope.productId));
    const hosts = (await (await db()).select({ url: sites.startUrl }).from(sites).where(eq(sites.productId, scope.productId))).map((s) => new URL(s.url).origin);
    return { error: null, text: buildDisclosurePolicy(product!.name, hosts, policyInput.parse(formFields(formData))) };
  } catch (error) {
    return fail(error);
  }
}

export async function addSecurityReport(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await addReport(scope, reportInput.parse(formFields(formData)), !desktopApp().demo && (await hasAiKey()));
  });
}

export async function triageReport(reportId: string): Promise<ActionResult> {
  return mutate(async () => {
    noDemo();
    await needAiKey();
    await requestTriage((await getWorkspace()).id, id.parse(reportId));
  });
}

export async function reportFinding(reportId: string, siteId: string): Promise<ActionResult> {
  return mutate(async () => {
    await reportToFinding((await getWorkspace()).id, id.parse(reportId), id.parse(siteId));
  });
}

export async function setReportStatus(reportId: string, status: "new" | "resolved" | "dismissed"): Promise<ActionResult> {
  return mutate(async () => {
    const workspace = await getWorkspace();
    await (await db())
      .update(securityReports)
      .set({ status: z.enum(["new", "resolved", "dismissed"]).parse(status) })
      .where(and(eq(securityReports.id, id.parse(reportId)), eq(securityReports.workspaceId, workspace.id)));
  });
}

// --- S2: exposure monitoring

export async function runMonitorNow(siteId: string): Promise<ActionResult> {
  return mutate(async () => {
    noDemo();
    const site = await ownSite((await getWorkspace()).id, id.parse(siteId));
    if (!site.securityVerifiedAt) throw new Error("Verify the site first");
    if (!(await queueMonitor(site))) throw new Error("Monitoring is already running for this site");
  });
}
