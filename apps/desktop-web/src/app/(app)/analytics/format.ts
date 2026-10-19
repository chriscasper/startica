export type ValueFormat = "number" | "money" | "decimal";

/** Numbers as Analytics shows them; shared by the server tables and the client charts. */
export function formatValue(n: number, format: ValueFormat = "number") {
  if (format === "money") return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (format === "decimal") return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return Math.round(n).toLocaleString("en-US");
}
