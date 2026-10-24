import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { hasAiKey } from "@startica/core/ai/client";
import { BENCHMARK_LABEL } from "@startica/core/benchmarks/sources";
import { latestDigest, loadActivity, type ActivityItem } from "@startica/core/competitors/activity";
import { LINK_LABEL, READABLE_LINKS } from "@startica/core/competitors/people";
import * as schema from "@startica/db/schema";
import { db } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import type { AccountView, ActivityView, DigestView, LinkView, PersonView } from "./competitor-ui";

/** View shapes for the competitor watch (the competitor page and Intel → Following). */

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null);

export const linkView = (l: schema.PersonLink): LinkView => ({ kind: l.kind, label: LINK_LABEL[l.kind], url: l.url, readable: Boolean(READABLE_LINKS[l.kind]) });

export const accountView = (a: typeof schema.competitorAccounts.$inferSelect): AccountView => ({
  id: a.id,
  channel: a.channel,
  label: BENCHMARK_LABEL[a.channel],
  handle: a.channel === "rss" ? a.handle.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : a.handle,
  url: a.url,
  status: a.status,
  lastError: a.lastError,
  checked: day(a.lastCheckedAt),
});

export const activityView = (i: ActivityItem): ActivityView => ({
  id: i.id,
  competitorId: i.competitorId,
  competitor: i.competitor,
  who: i.person ? `${i.person}${i.role ? `, ${i.role}` : ""}` : (i.competitor ?? ""),
  channel: BENCHMARK_LABEL[i.channel as schema.BenchmarkChannel] ?? i.channel,
  url: i.url,
  title: i.title,
  text: i.text,
  when: day(i.postedAt),
  engagement: i.engagement,
  seen: i.seen,
});

/** Why AI buttons are disabled, or undefined when they can run. */
export async function aiBlocked(): Promise<string | undefined> {
  if (desktopApp().demo) return "AI research is off in the demo";
  if (!(await hasAiKey())) return "Add an AI key in Settings → General → AI";
  return undefined;
}

/** A competitor's people with their accounts, and the company's own followed accounts. */
export async function peopleAndAccounts(competitorId: string): Promise<{ people: PersonView[]; company: AccountView[] }> {
  const d = await db();
  const [people, accounts] = await Promise.all([
    d.select().from(schema.competitorPeople).where(eq(schema.competitorPeople.competitorId, competitorId)).orderBy(asc(schema.competitorPeople.createdAt)),
    d
      .select()
      .from(schema.competitorAccounts)
      .where(and(eq(schema.competitorAccounts.competitorId, competitorId), inArray(schema.competitorAccounts.channel, ["bluesky", "mastodon", "reddit", "hackernews", "rss"])))
      .orderBy(asc(schema.competitorAccounts.createdAt)),
  ]);
  return {
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      why: p.why,
      status: p.status,
      source: p.source,
      links: p.links.map(linkView),
      accounts: accounts.filter((a) => a.personId === p.id).map(accountView),
    })),
    company: accounts.filter((a) => !a.personId).map(accountView),
  };
}

export async function activityViews(productId: string, competitorId?: string, limit = 60): Promise<ActivityView[]> {
  return (await loadActivity(productId, { competitorId, limit })).map(activityView);
}

export async function digestView(productId: string): Promise<DigestView | null> {
  const row = await latestDigest(productId);
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    error: row.error,
    when: row.createdAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    posts: row.posts,
    seen: row.seenAt !== null,
    digest: row.digest,
  };
}
