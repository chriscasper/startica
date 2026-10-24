"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

export type ChartAccount = { id: string; name: string; handle: string; slot: number; series: Record<Metric, { day: string; value: number | null }[]> };
export type Metric = "followers" | "karma" | "postsLast7" | "avgEngagement";

export const METRIC_LABEL: Record<Metric, string> = {
  followers: "Followers",
  karma: "Karma",
  postsLast7: "Posts in the last 7 days",
  avgEngagement: "Average engagement per post",
};

// Categorical slots from the dataviz reference palette, validated (light and dark) for six series:
// identity follows the account (own accounts first, then competitors in Intel's order), never rank.
const SLOTS = "[--b1:#2a78d6] [--b2:#eb6834] [--b3:#1baf7a] [--b4:#eda100] [--b5:#e87ba4] [--b6:#4a3aa7] dark:[--b1:#3987e5] dark:[--b2:#d95926] dark:[--b3:#199e70] dark:[--b4:#c98500] dark:[--b5:#d55181] dark:[--b6:#9085e9]";
export const MAX_SERIES = 6;
const color = (slot: number) => `var(--b${slot + 1})`;

const shortDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const show = (v: number | null | undefined) => (v == null ? "–" : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));

type Row = { day: string } & Record<string, number | null | string>;

function ChartTooltip({ active, label, payload, accounts }: { active?: boolean; label?: string; payload?: { payload?: Row }[]; accounts: ChartAccount[] }) {
  if (!active || !label) return null;
  const row = payload?.[0]?.payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 text-muted-foreground">{shortDate(label)}</div>
      {accounts.map((a) => (
        <div key={a.id} className="flex items-center gap-2 tabular-nums">
          <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: color(a.slot) }} />
          <span className="text-foreground">{a.name}</span>
          <span className="ml-auto pl-3 font-medium text-foreground">{show(row?.[a.id] as number | null)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * One channel's accounts over time, one line each, for the metric picked above the chart (one
 * y-axis, 2px lines, a crosshair tooltip, a legend with names, and Show as table).
 */
export function BenchmarkChart({ channel, accounts, metrics }: { channel: string; accounts: ChartAccount[]; metrics: Metric[] }) {
  const [metric, setMetric] = useState<Metric>(metrics[0] ?? "postsLast7");
  const days = [...new Set(accounts.flatMap((a) => a.series[metric].map((p) => p.day)))].sort();
  const rows: Row[] = days.map((day) => {
    const row: Row = { day };
    for (const a of accounts) row[a.id] = a.series[metric].find((p) => p.day === day)?.value ?? null;
    return row;
  });
  return (
    <figure className={cn("grid gap-2", SLOTS)}>
      {metrics.length > 1 && (
        <div className="flex w-fit flex-wrap gap-1 rounded-lg border p-1 text-xs" role="group" aria-label="Measure">
          {metrics.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === metric}
              onClick={() => setMetric(m)}
              className={cn("rounded-md px-2 py-0.5 text-muted-foreground hover:text-foreground", m === metric && "bg-muted font-medium text-foreground")}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
      )}
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {accounts.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: color(a.slot) }} />
            {a.name} <span className="opacity-80">{a.handle}</span>
          </span>
        ))}
      </figcaption>
      <div className="h-56 w-full" role="img" aria-label={`${METRIC_LABEL[metric]} on ${channel}, per day, for ${accounts.map((a) => a.name).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="day" tickFormatter={shortDate} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={24} />
            <YAxis
              allowDecimals={metric === "avgEngagement"}
              tickFormatter={(v: number) => v.toLocaleString("en-US")}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} content={<ChartTooltip accounts={accounts} />} />
            {accounts.map((a) => (
              <Line
                key={a.id}
                type="linear"
                dataKey={a.id}
                name={a.name}
                stroke={color(a.slot)}
                strokeWidth={2}
                dot={false}
                connectNulls
                activeDot={{ r: 4, fill: color(a.slot), stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Show as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full tabular-nums">
            <thead>
              <tr>
                <th className="text-left font-medium">Day</th>
                {accounts.map((a) => (
                  <th key={a.id} className="text-right font-medium">
                    {a.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.day}>
                  <td>{shortDate(r.day)}</td>
                  {accounts.map((a) => (
                    <td key={a.id} className="text-right">
                      {show(r[a.id] as number | null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
