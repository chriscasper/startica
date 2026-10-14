"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Point = { day: string; value: number };

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="text-muted-foreground">{shortDate(label)}</div>
      <div className="font-medium text-foreground tabular-nums">
        {(payload[0]?.value ?? 0).toLocaleString()} {unit}
      </div>
    </div>
  );
}

/**
 * One metric over time. A single series, so the card title names it and there's no
 * legend; a hover crosshair shows exact values (dataviz: one axis, thin 2px line).
 */
export function MetricChart({ data, unit, label }: { data: Point[]; unit: string; label: string }) {
  return (
    // The module's accent (globals.css) when there is one, else dataviz palette slot 1; both are
    // checked at 3:1 or better against the light and dark card surfaces.
    <figure className="grid gap-2 [--viz-series-1:var(--module-chart,#2a78d6)] dark:[--viz-series-1:var(--module-chart,#3987e5)]">
      <div className="h-56 w-full" role="img" aria-label={`${label}, daily, last ${data.length} days`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              dataKey="day"
              tickFormatter={shortDate}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={<ChartTooltip unit={unit} />}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke="var(--viz-series-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--viz-series-1)", stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full max-w-xs tabular-nums">
          <thead>
            <tr>
              <th className="text-left font-medium">Day</th>
              <th className="text-right font-medium">{label}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.day}>
                <td>{shortDate(p.day)}</td>
                <td className="text-right">{p.value.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
