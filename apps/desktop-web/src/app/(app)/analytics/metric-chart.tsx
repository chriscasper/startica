"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatValue, type ValueFormat } from "./format";

export type Point = { day: string; value: number; before?: number | null };
export type { ValueFormat };

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  format,
  compare,
}: {
  active?: boolean;
  payload?: { value?: number; dataKey?: string; payload?: Point }[];
  label?: string;
  unit: string;
  format: ValueFormat;
  compare: boolean;
}) {
  if (!active || !payload?.length || !label) return null;
  const point = payload[0]?.payload;
  const value = (n: number) => `${formatValue(n, format)}${format === "money" ? "" : ` ${unit}`}`;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="text-muted-foreground">{shortDate(label)}</div>
      <div className="font-medium text-foreground tabular-nums">{value(point?.value ?? 0)}</div>
      {compare && point?.before != null && <div className="text-muted-foreground tabular-nums">Period before: {value(point.before)}</div>}
    </div>
  );
}

/**
 * One metric over time. The card title names it; with `before` values a dashed line shows the
 * period before, day for day, and a legend names both (dataviz: one axis, thin 2px lines). A hover
 * crosshair shows exact values, and "Show as table" lists them.
 */
export function MetricChart({ data, unit, label, format = "number" }: { data: Point[]; unit: string; label: string; format?: ValueFormat }) {
  const compare = data.some((p) => p.before != null);
  return (
    // The module's accent (globals.css) when there is one, else dataviz palette slot 1; both are
    // checked at 3:1 or better against the light and dark card surfaces.
    <figure className="grid gap-2 [--viz-series-1:var(--module-chart,#2a78d6)] dark:[--viz-series-1:var(--module-chart,#3987e5)]">
      {compare && (
        <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full bg-(--viz-series-1)" />
            This period
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t-2 border-dashed border-muted-foreground" />
            Period before
          </span>
        </figcaption>
      )}
      <div className="h-56 w-full" role="img" aria-label={`${label}, daily, last ${data.length} days${compare ? ", with the period before" : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: format === "money" ? 0 : -16 }}>
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
              allowDecimals={format === "decimal"}
              tickFormatter={(v: number) => (format === "money" ? formatValue(v, "money") : v.toLocaleString("en-US"))}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={format === "money" ? 64 : 48}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={<ChartTooltip unit={unit} format={format} compare={compare} />}
            />
            {compare && (
              <Line
                type="linear"
                dataKey="before"
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
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
        <table className="mt-2 w-full max-w-sm tabular-nums">
          <thead>
            <tr>
              <th className="text-left font-medium">Day</th>
              <th className="text-right font-medium">{label}</th>
              {compare && <th className="text-right font-medium">Period before</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.day}>
                <td>{shortDate(p.day)}</td>
                <td className="text-right">{formatValue(p.value, format)}</td>
                {compare && <td className="text-right">{p.before == null ? "—" : formatValue(p.before, format)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
