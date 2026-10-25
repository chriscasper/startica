"use server";

import { z } from "zod";
import { hasAiKey } from "@startica/core/ai/client";
import { removeBenchmarkAccount } from "@startica/core/benchmarks/accounts";
import { markActivitySeen } from "@startica/core/competitors/activity";
import { markBriefSeen, updateBriefsNow } from "@startica/core/competitors/briefs";
import { addPerson, followCompanyLink, followPerson, ignorePerson, removePerson, updatePerson } from "@startica/core/competitors/people";
import { researchCompetitor } from "@startica/core/competitors/research";
import { saveWatchSettings, watchSettings } from "@startica/core/competitors/settings";
import { briefPeriods } from "@startica/db/schema";
import type { ActionResult } from "@/components/app/form-dialog";
import { formFields, id, mutate, productScope } from "@/lib/actions";
import { getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";

// The competitor watch (ARCHITECTURE.md section 3): research, people, followed accounts and pages, activity, the briefs and their settings.

async function needAi() {
  if (desktopApp().demo) throw new Error("AI research is off in the demo.");
  if (!(await hasAiKey())) throw new Error("Add an AI key first (Settings → General → AI)");
}

/** Problems following some links don't fail the action; they're shown as a warning. */
type FollowResult = ActionResult & { warning?: string };
async function following(fn: () => Promise<string[]>): Promise<FollowResult> {
  let problems: string[] = [];
  const result = await mutate(async () => {
    problems = await fn();
  });
  return result.error || !problems.length ? result : { ...result, warning: `Not followed: ${problems.join("; ")}` };
}

export async function research(competitorId: string): Promise<ActionResult> {
  return mutate(async () => {
    await needAi();
    await researchCompetitor((await getWorkspace()).id, id.parse(competitorId));
  });
}

const personFields = (formData: FormData) => {
  const f = formFields(formData);
  return { name: String(f.name ?? ""), role: String(f.role ?? ""), why: String(f.why ?? ""), links: String(f.links ?? "") };
};

export async function newPerson(competitorId: string, formData: FormData): Promise<FollowResult> {
  return following(async () => (await addPerson((await getWorkspace()).id, id.parse(competitorId), personFields(formData))).problems);
}

export async function editPerson(personId: string, formData: FormData): Promise<FollowResult> {
  return following(async () => updatePerson((await getWorkspace()).id, id.parse(personId), personFields(formData)));
}

export async function follow(personId: string): Promise<FollowResult> {
  return following(async () => followPerson((await getWorkspace()).id, id.parse(personId)));
}

export async function ignore(personId: string): Promise<ActionResult> {
  return mutate(async () => ignorePerson((await getWorkspace()).id, id.parse(personId)));
}

export async function deletePerson(personId: string): Promise<ActionResult> {
  return mutate(async () => removePerson((await getWorkspace()).id, id.parse(personId)));
}

export async function followLink(competitorId: string, url: string): Promise<ActionResult> {
  return mutate(async () => {
    await followCompanyLink((await getWorkspace()).id, id.parse(competitorId), z.string().trim().min(1, "Enter an address").max(500).parse(url));
  });
}

export async function followLinkForm(competitorId: string, formData: FormData): Promise<ActionResult> {
  return followLink(competitorId, String(formFields(formData).url ?? ""));
}

export async function unfollowAccount(accountId: string): Promise<ActionResult> {
  return mutate(async () => removeBenchmarkAccount((await getWorkspace()).id, id.parse(accountId)));
}

export async function markSeen(productId: string, competitorId?: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await markActivitySeen(scope.workspaceId, scope.productId, competitorId ? id.parse(competitorId) : undefined);
  });
}

export async function updateNow(productId: string, period: string): Promise<ActionResult> {
  return mutate(async () => {
    await needAi();
    const scope = await productScope(productId);
    await updateBriefsNow(scope.workspaceId, scope.productId, z.enum(briefPeriods).parse(period));
  });
}

export async function saveSettings(productId: string, input: unknown): Promise<ActionResult> {
  return mutate(async () => {
    await saveWatchSettings((await productScope(productId)).productId, watchSettings.parse(input));
  });
}

export async function briefSeen(briefId: string): Promise<ActionResult> {
  return mutate(async () => markBriefSeen((await getWorkspace()).id, id.parse(briefId)));
}
