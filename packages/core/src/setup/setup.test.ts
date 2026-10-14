import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { communities, jobRuns, products } from "@startica/db/schema";
import { communitySuggestions, setSetupFlags, setupFlags, setupStatus, watchCommunities } from "./status.ts";

let workspaceId = "";

beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-setup-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
});
afterAll(() => closeDatabase());

describe("setup", () => {
  it("starts with nothing done, and remembers the wizard and checklist flags", async () => {
    expect(await setupStatus(workspaceId, null)).toEqual({ hasKey: false, hasProduct: false, intel: "none", watching: 0, suggestions: 0, scanned: false, analytics: false, posted: false });
    expect(await setupFlags()).toEqual({});
    await setSetupFlags({ welcomeDone: true });
    await setSetupFlags({ checklistDismissed: true });
    expect(await setupFlags()).toEqual({ welcomeDone: true, checklistDismissed: true });
  });

  it("pre-selects the first five suggestions listening can read, in intel's order", async () => {
    const [p] = await getDb().insert(products).values({ workspaceId, name: "Fieldnote", intelStatus: "ready" }).returning();
    const add = (channel: "reddit" | "hackernews" | "mastodon" | "discourse" | "other", name: string, url: string | null = null) =>
      getDb().insert(communities).values({ workspaceId, productId: p!.id, channel, name, url, status: "suggested", source: "ai" }).returning();
    for (const [channel, name, url] of [
      ["reddit", "notebooks"],
      ["hackernews", "Show HN"], // keyword-based: not a community listening reads
      ["discourse", "Paper Forum"], // no address: can't be read
      ["reddit", "fountainpens"],
      ["mastodon", "#notebooks@mastodon.social"],
      ["other", "A newsletter"],
      ["discourse", "Stationery Forum", "https://forum.example.com"],
      ["reddit", "bulletjournal"],
      ["reddit", "productivity"],
    ] as const) {
      await add(channel, name, (url as string | undefined) ?? null);
    }

    const suggestions = await communitySuggestions(p!.id);
    expect(suggestions.filter((s) => s.preselected).map((s) => s.name)).toEqual(["notebooks", "fountainpens", "#notebooks@mastodon.social", "Stationery Forum", "bulletjournal"]);
    expect(suggestions).toHaveLength(9);

    const picked = suggestions.filter((s) => s.preselected).map((s) => s.id);
    expect(await watchCommunities(p!.id, picked)).toBe(5);
    const status = await setupStatus(workspaceId, p!.id);
    expect(status).toMatchObject({ hasProduct: true, intel: "ready", watching: 5, suggestions: 4 });
  });

  it("counts a first scan per product: its own scan, or an all-products scan since it was added", async () => {
    const [a] = await getDb().insert(products).values({ workspaceId, name: "A" }).returning();
    const [b] = await getDb().insert(products).values({ workspaceId, name: "B" }).returning();
    const run = (payload: Record<string, unknown>, startedAt: Date) =>
      getDb().insert(jobRuns).values({ workspaceId, queue: "listen_scan", status: "succeeded", payload, startedAt });
    await run({ workspaceId, productId: b!.id }, new Date());
    await run({ workspaceId }, new Date(a!.createdAt.getTime() - 60_000)); // before A existed
    expect((await setupStatus(workspaceId, a!.id)).scanned).toBe(false);
    await run({ workspaceId }, new Date());
    expect((await setupStatus(workspaceId, a!.id)).scanned).toBe(true);
  });
});
