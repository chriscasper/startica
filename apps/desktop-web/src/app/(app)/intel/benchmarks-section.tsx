import { ArrowDownRightIcon, ArrowUpRightIcon, InfoIcon } from "lucide-react";
import type { BenchmarkAccount, Benchmarks } from "@startica/core/benchmarks/report";
import { BENCHMARK_HINT, BENCHMARK_LABEL, type SupportedChannel } from "@startica/core/benchmarks/sources";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BenchmarkChart, MAX_SERIES, type ChartAccount, type Metric } from "./benchmark-chart";
import { AddAccountButton, CheckNowButton, RemoveAccountButton } from "./benchmark-controls";

const TONE = {
  ahead: { Icon: ArrowUpRightIcon, className: "text-emerald-700 dark:text-emerald-400", label: "Ahead" },
  behind: { Icon: ArrowDownRightIcon, className: "text-destructive", label: "Behind" },
  note: { Icon: InfoIcon, className: "text-muted-foreground", label: "Note" },
} as const;

const num = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-US", { maximumFractionDigits: 1 }));
const when = (d: Date | null) => (d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

function Growth({ a }: { a: BenchmarkAccount }) {
  const g = a.followerGrowth;
  if (!g) return <span className="text-muted-foreground">–</span>;
  const diff = g.to - g.from;
  return (
    <span className="tabular-nums">
      {diff > 0 ? "+" : ""}
      {num(diff)}
      {g.from > 0 && <span className="text-muted-foreground"> ({diff >= 0 ? "+" : ""}{Math.round((diff / g.from) * 100)}%)</span>}
    </span>
  );
}

function chartAccounts(accounts: BenchmarkAccount[]): ChartAccount[] {
  return accounts.slice(0, MAX_SERIES).map((a, slot) => ({
    id: a.id,
    name: a.name,
    handle: a.handle,
    slot,
    series: {
      followers: a.series.map((p) => ({ day: p.day, value: p.followers })),
      karma: a.series.map((p) => ({ day: p.day, value: p.karma })),
      postsLast7: a.series.map((p) => ({ day: p.day, value: p.postsLast7 })),
      avgEngagement: a.series.map((p) => ({ day: p.day, value: p.avgEngagement })),
    },
  }));
}

function ChannelCard({ channel, accounts }: { channel: SupportedChannel; accounts: BenchmarkAccount[] }) {
  const withData = accounts.filter((a) => a.series.length > 0);
  const has = (k: Metric) => withData.some((a) => a.series.some((p) => p[k] != null));
  const metrics = (["followers", "karma", "postsLast7", "avgEngagement"] as const).filter(has);
  const label = BENCHMARK_LABEL[channel];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>Reads {BENCHMARK_HINT[channel].reads}. Engagement is {channel === "hackernews" ? "points and comments on recent stories" : "likes, reposts and replies on recent posts"}.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {withData.length > 0 && metrics.length > 0 ? (
          <BenchmarkChart channel={label} accounts={chartAccounts(withData)} metrics={metrics} />
        ) : (
          <p className="text-sm text-muted-foreground">No numbers yet: they appear after the next check.</p>
        )}
        {withData.length > MAX_SERIES && <p className="text-xs text-muted-foreground">The chart shows the first {MAX_SERIES} accounts; the table has all of them.</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">{channel === "hackernews" ? "Karma" : "Followers"}</TableHead>
              <TableHead className="text-right">Followers, 4 weeks</TableHead>
              <TableHead className="text-right">Posts, last 7 days</TableHead>
              <TableHead className="text-right">Avg engagement</TableHead>
              <TableHead>Checked</TableHead>
              <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{a.name}</span>
                    {a.own && <Badge variant="secondary">You</Badge>}
                  </div>
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline">
                      {a.handle}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">{a.handle}</span>
                  )}
                  {a.status === "error" && <p className="mt-1 max-w-sm text-xs whitespace-normal text-destructive">Couldn&apos;t read it: {a.lastError}</p>}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">{num(channel === "hackernews" ? a.latest?.karma : a.latest?.followers)}</TableCell>
                <TableCell className="text-right align-top">{channel === "hackernews" || channel === "reddit" ? <span className="text-muted-foreground">–</span> : <Growth a={a} />}</TableCell>
                <TableCell className="text-right align-top tabular-nums">{num(a.latest?.postsLast7)}</TableCell>
                <TableCell className="text-right align-top tabular-nums">{num(a.latest?.avgEngagement)}</TableCell>
                <TableCell className="align-top text-xs text-muted-foreground">{a.status === "untested" ? "Waiting" : when(a.lastCheckedAt)}</TableCell>
                <TableCell className="align-top">
                  <RemoveAccountButton id={a.id} label={`${a.name} on ${label} (${a.handle})`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Intel → Benchmarks: own accounts against competitors', per channel (ARCHITECTURE.md section 13). */
export function BenchmarksSection({ productId, data, running, demo }: { productId: string; data: Benchmarks; running: boolean; demo: boolean }) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Benchmarks</CardTitle>
          <CardDescription>
            Public numbers of competitors&apos; accounts next to yours: followers, how often they post and how much each post gets back. Read daily (or as often as Intel → Following → Settings says) from
            Bluesky, Mastodon, Reddit and Hacker News without an account. X isn&apos;t included: Startica doesn&apos;t look up accounts on X. A competitor with tracked
            accounts is kept when Intel is rebuilt.
          </CardDescription>
          <CardAction className="flex flex-wrap gap-2">
            <CheckNowButton productId={productId} running={running} disabled={demo ? "The demo doesn't read other sites" : data.accounts.length === 0 ? "Add an account first" : undefined} />
            <AddAccountButton productId={productId} competitors={data.competitors} />
          </CardAction>
        </CardHeader>
        <CardContent>
          {data.accounts.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No accounts yet. Add a competitor&apos;s Bluesky, Mastodon, Reddit or Hacker News account, and your own on the same channel to compare.
            </p>
          ) : data.observations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No big gaps between you and the competitors yet. Observations appear when one side posts twice as often, grows twice as fast or gets 1.5 times the engagement.</p>
          ) : (
            <ul className="grid gap-2.5 text-sm">
              {data.observations.map((o, i) => {
                const t = TONE[o.tone];
                return (
                  <li key={i} className="flex gap-2">
                    <t.Icon aria-label={t.label} className={`mt-0.5 size-4 shrink-0 ${t.className}`} />
                    <span>{o.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      {data.channels.map((c) => (
        <ChannelCard key={c} channel={c} accounts={data.accounts.filter((a) => a.channel === c)} />
      ))}
    </div>
  );
}
