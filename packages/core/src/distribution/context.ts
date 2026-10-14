import { asc, eq } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { competitors, personas, products } from "@startica/db/schema";

export type ProductContext = {
  id: string;
  workspaceId: string;
  name: string;
  url: string | null;
  relevanceThreshold: number;
  intentThreshold: number;
  /** Stable text block about the product for prompts (cache-friendly: same for every call). */
  text: string;
};

export async function loadProductContext(productId: string): Promise<ProductContext> {
  const db = getDb();
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) throw new Error(`Product ${productId} not found`);

  const [ps, cs] = await Promise.all([
    db
      .select({ name: personas.name, summary: personas.summary, pains: personas.pains })
      .from(personas)
      .where(eq(personas.productId, productId))
      .orderBy(asc(personas.createdAt)),
    db.select({ name: competitors.name }).from(competitors).where(eq(competitors.productId, productId)).orderBy(asc(competitors.createdAt)),
  ]);

  const b = product.brief;
  const text = [
    `Product: ${product.name}${product.url ? ` (${product.url})` : ""}`,
    product.oneLiner && `One-liner: ${product.oneLiner}`,
    b && `Summary: ${b.summary}`,
    b && `Audience: ${b.audience}`,
    b && `Problem: ${b.problem}`,
    b && `Positioning: ${b.positioning}`,
    b?.value_props.length && `Value: ${b.value_props.join("; ")}`,
    b?.differentiators.length && `Differentiators: ${b.differentiators.join("; ")}`,
    ps.length && `Personas:\n${ps.map((p) => `- ${p.name}: ${p.summary} Pains: ${p.pains.join("; ")}`).join("\n")}`,
    cs.length && `Alternatives people use: ${cs.map((c) => c.name).join(", ")}`,
    product.ownerNotes && `Owner's notes: ${product.ownerNotes}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: product.id,
    workspaceId: product.workspaceId,
    name: product.name,
    url: product.url,
    relevanceThreshold: product.relevanceThreshold,
    intentThreshold: product.intentThreshold,
    text,
  };
}
