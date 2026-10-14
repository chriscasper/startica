"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addAd,
  campaignInput,
  campaignStatuses,
  copyFromForm,
  createCampaign,
  deleteAd,
  deleteCampaign,
  ownAd,
  ownCampaign,
  ownGroup,
  replanCampaign,
  rewriteAd,
  saveAd,
  setCampaignStatus,
  stopPlanning,
  targetingFromForm,
  updateCampaign,
  suggestCreatives,
  updateGroup,
} from "@startica/core/ads/campaigns";
import {
  createCreative,
  creativeInput,
  deleteCreative,
  drawCreative,
  ownCreative,
  removeLogo,
  rerenderCreative,
  saveLogo,
  stopCreative,
  updateCreative,
} from "@startica/core/ads/creatives";
import { competitorNames } from "@startica/core/ads/jobs";
import { addSpend, campaignReview, deleteSpend, setTargetCost, spendInput, suggestionToRoadmap, suggestionToToday } from "@startica/core/ads/results";
import type { ActionResult } from "@/components/app/form-dialog";
import { fail, formFields, id, mutate, productScope } from "@/lib/actions";
import { getWorkspace } from "@/lib/dal";

/** Ads (ARCHITECTURE.md section 8.6): plans and copy. Startica never launches or pays for ads. */

const strings = (formData: FormData) => formFields(formData) as Record<string, string>;

async function campaign(campaignId: string) {
  return ownCampaign((await getWorkspace()).id, id.parse(campaignId));
}

export async function newCampaign(productId: string, formData: FormData): Promise<ActionResult> {
  let created: string;
  try {
    const scope = await productScope(productId);
    created = await createCampaign(scope.workspaceId, scope.productId, campaignInput.parse(strings(formData)));
  } catch (error) {
    return fail(error);
  }
  redirect(`/ads/${created}`);
}

export async function saveCampaign(campaignId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const c = await campaign(campaignId);
    await updateCampaign(c, campaignInput.omit({ platform: true }).parse(strings(formData)));
  });
}

export async function replan(campaignId: string): Promise<ActionResult> {
  return mutate(async () => replanCampaign(await campaign(campaignId)));
}

export async function stopPlan(campaignId: string): Promise<ActionResult> {
  return mutate(async () => stopPlanning(await campaign(campaignId)));
}

export async function changeStatus(campaignId: string, status: string): Promise<ActionResult> {
  return mutate(async () => setCampaignStatus(await campaign(campaignId), z.enum(campaignStatuses).parse(status)));
}

export async function removeCampaign(campaignId: string): Promise<ActionResult> {
  try {
    await deleteCampaign(await campaign(campaignId));
  } catch (error) {
    return fail(error);
  }
  redirect("/ads");
}

export async function saveGroup(groupId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const { group, campaign } = await ownGroup((await getWorkspace()).id, id.parse(groupId));
    const fields = strings(formData);
    const name = z.string().trim().min(1, "Give the group a name").parse(fields.name);
    await updateGroup(group.id, { name, angle: (fields.angle ?? "").trim(), targeting: targetingFromForm(campaign.platform, fields) });
  });
}

export async function editAd(adId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const { ad, campaign } = await ownAd((await getWorkspace()).id, id.parse(adId));
    await saveAd(ad.id, copyFromForm(campaign.platform, strings(formData)));
  });
}

export async function newAd(groupId: string): Promise<ActionResult> {
  return mutate(async () => {
    const workspace = await getWorkspace();
    const { group } = await ownGroup(workspace.id, id.parse(groupId));
    await addAd(workspace.id, group.id);
  });
}

export async function removeAd(adId: string): Promise<ActionResult> {
  return mutate(async () => deleteAd((await ownAd((await getWorkspace()).id, id.parse(adId))).ad.id));
}

export async function rewrite(adId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const workspace = await getWorkspace();
    const { ad } = await ownAd(workspace.id, id.parse(adId));
    const guidance = z.string().trim().max(2000).default("").parse(strings(formData).guidance);
    await rewriteAd(workspace.id, ad.id, guidance);
  });
}

// --- Creatives (AD2) ---------------------------------------------------------------

/** The uploaded image in a form, if any (an empty file input sends a 0-byte file). */
async function uploaded(formData: FormData, name = "image"): Promise<Buffer | null> {
  const file = formData.get(name);
  return file instanceof File && file.size > 0 ? Buffer.from(await file.arrayBuffer()) : null;
}

const textFields = (formData: FormData) => Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));

export async function newCreative(campaignId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const c = await campaign(campaignId);
    await createCreative(c, creativeInput.parse(textFields(formData)), await uploaded(formData), await competitorNames(c.productId));
  });
}

async function creative(creativeId: string) {
  const workspace = await getWorkspace();
  const row = await ownCreative(workspace.id, id.parse(creativeId));
  return { creative: row, campaign: await ownCampaign(workspace.id, row.campaignId) };
}

export async function saveCreative(creativeId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const { creative: row, campaign: c } = await creative(creativeId);
    await updateCreative(row, c, creativeInput.parse(textFields(formData)), await uploaded(formData), await competitorNames(c.productId));
  });
}

export async function drawAgain(creativeId: string): Promise<ActionResult> {
  return mutate(async () => {
    const { creative: row, campaign: c } = await creative(creativeId);
    await drawCreative(row, await competitorNames(c.productId));
  });
}

export async function renderAgain(creativeId: string): Promise<ActionResult> {
  return mutate(async () => rerenderCreative((await creative(creativeId)).creative));
}

export async function stopCreativeWork(creativeId: string): Promise<ActionResult> {
  return mutate(async () => stopCreative((await creative(creativeId)).creative));
}

export async function removeCreative(creativeId: string): Promise<ActionResult> {
  return mutate(async () => deleteCreative((await creative(creativeId)).creative));
}

export async function suggestIdeas(campaignId: string): Promise<ActionResult> {
  return mutate(async () => suggestCreatives(await campaign(campaignId)));
}

export async function uploadLogo(campaignId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const c = await campaign(campaignId);
    const data = await uploaded(formData, "logo");
    if (!data) throw new Error("Choose a logo image");
    saveLogo(c.productId, data);
  });
}

export async function deleteLogo(campaignId: string): Promise<ActionResult> {
  return mutate(async () => removeLogo((await campaign(campaignId)).productId));
}

// --- Results and suggestions (AD3–AD4) -----------------------------------------------

export async function newSpend(campaignId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => addSpend(await campaign(campaignId), spendInput.parse(strings(formData))));
}

export async function removeSpend(spendId: string): Promise<ActionResult> {
  return mutate(async () => deleteSpend((await getWorkspace()).id, id.parse(spendId)));
}

export async function saveTarget(campaignId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const raw = String(formData.get("target_cost") ?? "").trim();
    const value = raw === "" ? null : z.coerce.number().positive("Enter a cost above zero, or leave it empty").max(1_000_000).parse(raw);
    await setTargetCost(await campaign(campaignId), value);
  });
}

/** The suggestion for one ad, worked out again on the server (never trusted from the page). */
async function suggestion(campaignId: string, adId: string) {
  const c = await campaign(campaignId);
  const s = (await campaignReview(c)).suggestions.find((x) => x.adId === id.parse(adId));
  if (!s) throw new Error("That suggestion has changed: reload the page");
  return { c, s };
}

export async function suggestionRoadmap(campaignId: string, adId: string): Promise<ActionResult> {
  return mutate(async () => {
    const { c, s } = await suggestion(campaignId, adId);
    await suggestionToRoadmap(c, s);
  });
}

export async function suggestionToday(campaignId: string, adId: string): Promise<ActionResult> {
  return mutate(async () => {
    const { c, s } = await suggestion(campaignId, adId);
    await suggestionToToday(c, s);
  });
}

export async function rewriteFromSuggestion(campaignId: string, adId: string): Promise<ActionResult> {
  return mutate(async () => {
    const { c, s } = await suggestion(campaignId, adId);
    await rewriteAd(c.workspaceId, s.adId, s.guidance ?? "Make it sharper and more specific.");
  });
}
