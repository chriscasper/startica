import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { aiRuns, conversations, opportunities, products } from "@startica/db/schema";
import type { RawConversation } from "../channels/types.ts";
import { DUPLICATE_THRESHOLD, findNearDuplicate, fingerprint, similarity } from "./fingerprint.ts";
import { runOpportunityScore, storeConversation } from "./jobs.ts";

const question =
  "I just started my first field season, doing bird counts on a coastal transect, and I have no idea how to keep my notes organized once I am back at the station. My paper notebook gets wet and nobody in my lab uses the same format. Is there a tool for this?";

describe("fingerprint", () => {
  it("treats light edits and a different title as the same text", () => {
    const a = fingerprint("How to organize field notes?", question)!;
    const b = fingerprint("How do you organize your field notes", `${question.replace("bird counts", "bird surveys")} Thanks!`)!;
    expect(similarity(a, b)).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it("keeps different texts apart, even on the same topic", () => {
    const a = fingerprint("How to organize field notes?", question)!;
    const b = fingerprint(
      "Rugged tablets",
      "Which rugged tablet are people using for data entry in wetlands these days? The one our department bought dies after two hours and the screen is unreadable in sunlight.",
    )!;
    expect(similarity(a, b)).toBeLessThan(0.3);
    expect(findNearDuplicate(a, [{ id: "x", fingerprint: b }])).toBeNull();
  });

  it("skips texts too short to compare, and ignores the appended top replies", () => {
    expect(fingerprint("Help!", "(link or image post; no text)")).toBeNull();
    expect(fingerprint("How to organize field notes?", `${question}\n\nTop replies so far:\n- someone: try a shared spreadsheet`)).toBe(
      fingerprint("How to organize field notes?", question),
    );
  });
});

describe("opportunity_score dedupe", () => {
  let workspaceId = "";
  let productId = "";

  beforeAll(async () => {
    openDatabase(join(mkdtempSync(join(tmpdir(), "startica-dedupe-")), "test.db"));
    await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
    workspaceId = (await ensureWorkspace()).id;
    [{ id: productId }] = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning({ id: products.id })) as [{ id: string }];
  });
  afterAll(() => closeDatabase());

  const post = (externalId: string, community: string, body: string): RawConversation => ({
    channel: "reddit",
    externalId,
    url: `https://www.reddit.com/r/${community}/comments/${externalId}/x/`,
    kind: "post",
    community,
    author: "someone",
    title: "How to organize field notes?",
    threadTitle: null,
    body,
    postedAt: new Date(),
    score: null,
    numComments: null,
  });

  it("archives a cross-post as a duplicate of the earlier one, without calling Claude", async () => {
    const first = await storeConversation({ workspaceId, productId, conversation: post("t3_a1", "ecology", question), origin: "listening", matchedOn: "reddit" });
    await new Promise((r) => setTimeout(r, 5)); // distinct created_at
    const copy = await storeConversation({ workspaceId, productId, conversation: post("t3_b2", "GradSchool", `${question} Thanks in advance.`), origin: "listening", matchedOn: "reddit" });

    const result = await runOpportunityScore({ workspaceId }, { workspaceId, opportunityIds: [copy.opportunityId], force: false });
    expect(result).toEqual({ drafting: 0, archived: 0, duplicates: 1 });

    const [row] = await getDb().select().from(opportunities).where(eq(opportunities.id, copy.opportunityId));
    expect(row?.status).toBe("archived");
    expect(row?.duplicateOfId).toBe(first.opportunityId);
    expect(row?.reasoning).toContain("/r/ecology/");
    expect(await getDb().select().from(aiRuns)).toHaveLength(0);

    const stored = await getDb().select({ fp: conversations.fingerprint }).from(conversations);
    expect(stored.every((c) => c.fp)).toBe(true);
  });
});
