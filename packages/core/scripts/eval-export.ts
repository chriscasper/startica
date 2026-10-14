/**
 * Turns the owner's Inbox decisions into eval cases for the scorer: posted
 * replies are "reply", dismissed conversations are "skip" (see labelFromDecision).
 * Reads the app's database without changing it, and refreshes the product
 * snapshot in each product's eval file. Authors are left out.
 *
 *   yarn eval:export score
 */
import { and, eq, inArray } from "drizzle-orm";
import { openDatabase, closeDatabase, getDb } from "@startica/db/client";
import { databasePath } from "@startica/db/paths";
import { conversations, opportunities, products } from "@startica/db/schema";
import { evalPath, labelFromDecision, mergeCases, readEvalFile, writeEvalFile, type ScoreCase } from "../src/ai/evals/score/cases.ts";
import { loadProductContext } from "../src/distribution/context.ts";

const task = process.argv[2];
if (task !== "score") {
  console.error("Usage: yarn eval:export score   (only the scorer has an eval set so far)");
  process.exit(1);
}

openDatabase(databasePath());
const db = getDb();
const list = await db.select({ id: products.id, name: products.name, relevance: products.relevanceThreshold, intent: products.intentThreshold }).from(products);

for (const product of list) {
  const rows = await db
    .select({
      status: opportunities.status,
      dismissReason: opportunities.dismissReason,
      channel: conversations.channel,
      externalId: conversations.externalId,
      url: conversations.url,
      kind: conversations.kind,
      community: conversations.community,
      title: conversations.title,
      threadTitle: conversations.threadTitle,
      body: conversations.body,
    })
    .from(opportunities)
    .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
    .where(and(eq(opportunities.productId, product.id), inArray(opportunities.status, ["posted", "dismissed"])));

  const incoming: ScoreCase[] = rows.flatMap((r) => {
    const expect = labelFromDecision(r.status, r.dismissReason);
    if (!expect) return [];
    return [
      {
        id: `${r.channel}:${r.externalId}`,
        source: "owner" as const,
        expect,
        note: r.status === "posted" ? "You posted a reply." : `You dismissed it: ${r.dismissReason ?? "no reason"}.`,
        conversation: { channel: r.channel, kind: r.kind, community: r.community, title: r.title, threadTitle: r.threadTitle, body: r.body, url: r.url },
      },
    ];
  });

  const path = evalPath(product.name);
  const existing = readEvalFile(path);
  const cases = mergeCases(existing?.cases ?? [], incoming);
  writeEvalFile(path, {
    product: product.name,
    productContext: (await loadProductContext(product.id)).text,
    thresholds: { relevance: product.relevance, intent: product.intent },
    cases,
  });
  const owner = cases.filter((c) => c.source === "owner");
  console.log(
    `${product.name}: ${incoming.length} labeled decisions exported; ${owner.length} owner cases (${owner.filter((c) => c.expect === "reply").length} reply, ${owner.filter((c) => c.expect === "skip").length} skip) + ${cases.length - owner.length} seed cases → ${path}`,
  );
}
closeDatabase();
