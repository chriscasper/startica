import { describe, expect, it } from "vitest";
import { ga4Day, mapRows, pageDimension } from "./ga4.ts";
import { monthlyRevenue, summarizeSubscriptions, type SubscriptionLike } from "./stripe.ts";

const ts = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function sub(partial: Partial<SubscriptionLike> & { amount: number; interval?: string; count?: number; qty?: number }): SubscriptionLike {
  return {
    status: partial.status ?? "active",
    created: partial.created ?? ts("2026-01-01T00:00:00Z"),
    canceled_at: partial.canceled_at ?? null,
    items: {
      data: [
        {
          quantity: partial.qty ?? 1,
          price: { unit_amount: partial.amount, recurring: { interval: partial.interval ?? "month", interval_count: partial.count ?? 1 } },
        },
      ],
    },
  };
}

describe("stripe metrics", () => {
  it("normalizes plans to monthly revenue", () => {
    expect(monthlyRevenue(sub({ amount: 500 }))).toBe(5);
    expect(monthlyRevenue(sub({ amount: 6000, interval: "year" }))).toBe(5);
    expect(monthlyRevenue(sub({ amount: 500, qty: 3 }))).toBe(15);
    expect(monthlyRevenue(sub({ amount: 1500, interval: "month", count: 3 }))).toBe(5);
  });

  it("summarizes active subscriptions, MRR, new and cancelled per day", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    const rows = summarizeSubscriptions(
      [
        sub({ amount: 500, created: ts("2026-10-08T09:00:00Z") }),
        sub({ amount: 6000, interval: "year", status: "trialing" }),
        sub({ amount: 500, status: "canceled", canceled_at: ts("2026-10-07T10:00:00Z") }),
      ],
      now,
    );
    const get = (metric: string, day: string) => rows.find((r) => r.metric === metric && r.day === day)?.value;
    expect(get("active_subscriptions", "2026-10-09")).toBe(2);
    expect(get("mrr", "2026-10-09")).toBe(10);
    expect(get("new_subscriptions", "2026-10-08")).toBe(1);
    expect(get("new_subscriptions", "2026-10-07")).toBe(0);
    expect(get("cancellations", "2026-10-07")).toBe(1);
  });
});

describe("ga4 mapping", () => {
  it("keys sessions by page path, without the query string", () => {
    expect(pageDimension("/pricing?plan=pro")).toBe("page:/pricing");
    expect(pageDimension("(not set)")).toBeNull();
  });

  it("converts GA4 dates", () => {
    expect(ga4Day("20261008")).toBe("2026-10-08");
  });

  it("maps totals and split rows, dropping unset splits", () => {
    const rows = [
      { dimensionValues: [{ value: "20261008" }, { value: "d-123" }], metricValues: [{ value: "7" }, { value: "2" }] },
      { dimensionValues: [{ value: "20261008" }, { value: "(not set)" }], metricValues: [{ value: "90" }, { value: "5" }] },
    ];
    const mapped = mapRows(rows, {
      metrics: ["sessions", "key_events"],
      dimension: ([content = ""]) => (content === "(not set)" ? null : `utm_content:${content}`),
    });
    expect(mapped).toEqual([
      { day: "2026-10-08", metric: "sessions", dimension: "utm_content:d-123", value: 7 },
      { day: "2026-10-08", metric: "key_events", dimension: "utm_content:d-123", value: 2 },
    ]);
  });
});
