"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { getProducts, PRODUCT_COOKIE } from "@/lib/dal";

export async function setActiveProduct(productId: string) {
  const id = z.guid().parse(productId);
  const products = await getProducts();
  if (!products.some((p) => p.id === id)) throw new Error("Unknown product");
  (await cookies()).set(PRODUCT_COOKIE, id, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
}
