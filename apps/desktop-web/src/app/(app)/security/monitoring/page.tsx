import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, desc, eq, isNull } from "drizzle-orm";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { securityAssets, securityComponents, securityFindings, sitePages } from "@startica/db/schema";
import { db } from "@/lib/dal";
import { ago, loadSites, withSite } from "../../accessibility/data";
import { NoProduct, SitePicker } from "../../accessibility/ui";
import { RunMonitorButton } from "../controls";
import { SecurityNoSite, SeverityBadge } from "../shared";

export const metadata: Metadata = { title: "Monitoring" };

export default function MonitoringPage(props: PageProps<"/security/monitoring">) {
  return (
    <>
      <PageHeader title="Monitoring" description="What's around your site: subdomains and certificates, look-alike domains, third-party scripts and the libraries your pages load." />
      <Suspense fallback={<PageSkeleton />}>
        <Monitoring searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

/** Everything the page shows. A plain function, so it may read the clock. */
async function load(siteParam: string | string[] | undefined) {
  const ctx = await loadSites(siteParam);
  if (!ctx?.site) return { ctx, data: null };
  const site = ctx.site;
  const d = await db();
  const [assets, components, findings] = await Promise.all([
    d.select().from(securityAssets).where(eq(securityAssets.siteId, site.id)).orderBy(desc(securityAssets.firstSeenAt)),
    d
      .select({ name: securityComponents.name, version: securityComponents.version, url: sitePages.url })
      .from(securityComponents)
      .innerJoin(sitePages, eq(sitePages.id, securityComponents.pageId))
      .where(and(eq(securityComponents.siteId, site.id), isNull(sitePages.goneAt))),
    d.select().from(securityFindings).where(and(eq(securityFindings.siteId, site.id), eq(securityFindings.source, "monitor"))),
  ]);
  const libs = new Map<string, { name: string; version: string; pages: number }>();
  for (const c of components) {
    const key = `${c.name}@${c.version}`;
    libs.set(key, { name: c.name, version: c.version, pages: (libs.get(key)?.pages ?? 0) + 1 });
  }
  const findingOf = (groupKey: string) => findings.find((f) => f.groupKey === groupKey && f.status !== "fixed");
  const lastRun = site.securityMonitor;
  const day = 86_400_000;
  const newSince = lastRun ? lastRun.checkedAt - 7 * day : 0;
  return {
    ctx,
    data: {
      site,
      lastWhen: lastRun ? ago(new Date(lastRun.checkedAt)) : null,
      errors: lastRun?.errors ?? [],
      assets,
      isNew: (a: (typeof assets)[number]) => a.firstSeenAt.getTime() >= newSince && a.firstSeenAt.getTime() > (assets.at(-1)?.firstSeenAt.getTime() ?? 0),
      libs: [...libs.entries()].map(([key, l]) => ({ ...l, finding: findingOf(`vuln:${key}`) })),
      findingOf,
    },
  };
}

async function Monitoring({ searchParams }: { searchParams: PageProps<"/security/monitoring">["searchParams"] }) {
  const { ctx, data } = await load((await searchParams).site);
  if (!ctx) return <NoProduct />;
  if (!data) return <SecurityNoSite ctx={ctx} />;
  const { site } = data;
  if (!site.securityVerifiedAt) {
    return (
      <p className="text-sm">
        Monitoring starts once you prove the site is yours.{" "}
        <Link href={withSite("/security", site.id)} className="underline">
          Verify {site.name}
        </Link>
      </p>
    );
  }
  const of = (kind: string) => data.assets.filter((a) => a.kind === kind);

  return (
    <>
      <LiveRefresh tables={["sites", "security_findings"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SitePicker ctx={ctx} path="/security/monitoring" />
        <RunMonitorButton siteId={site.id} disabled={ctx.demo} />
      </div>
      <p className="text-sm text-muted-foreground">
        {data.lastWhen ? `Last checked ${data.lastWhen}.` : "Not checked yet."} Runs every day and after each full scan. It reads certificate transparency logs (crt.sh), public DNS, the
        scripts your pages load from other sites, and the vulnerability databases OSV.dev, EPSS and CISA KEV. It sends them only your domain, library names and versions, and
        CVE ids.
      </p>
      {data.errors.length > 0 && (
        <div className="rounded-lg border border-destructive/40 p-3 text-sm">
          <span className="font-medium">Some checks couldn&apos;t run last time:</span>
          <ul className="list-disc pl-5">
            {data.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          Their findings are kept as they were; they&apos;re checked again next run.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Libraries</CardTitle>
          <CardDescription>Client-side libraries your pages load, with their versions, from the latest scan. Known vulnerabilities become findings.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.libs.length === 0 ? (
            <p className="text-sm text-muted-foreground">None detected. Startica recognizes common libraries (jQuery, Bootstrap, Angular, Vue, React, Lodash, Moment, Handlebars, DOMPurify).</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Library</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead>Advisories</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.libs.map((l) => (
                  <TableRow key={`${l.name}@${l.version}`}>
                    <TableCell className="font-mono text-xs">{l.name}</TableCell>
                    <TableCell className="tabular-nums">{l.version}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.pages}</TableCell>
                    <TableCell>
                      {l.finding ? (
                        <Link href={`/security/findings/${l.finding.id}`} className="inline-flex items-center gap-2 hover:underline">
                          <SeverityBadge severity={l.finding.severity} />
                          {Array.isArray(l.finding.detail.vulns) ? (l.finding.detail.vulns as unknown[]).length : 0} known
                          {l.finding.detail.kev ? <Badge variant="destructive">Exploited</Badge> : null}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">None known</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subdomains</CardTitle>
            <CardDescription>Names on certificates issued for your domain, and where they point. A subdomain pointing at a name that no longer exists can be taken over.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {of("subdomain").length === 0 && <p className="text-muted-foreground">None found yet.</p>}
            {of("subdomain").map((a) => {
              const finding = data.findingOf(`takeover:${a.name}`);
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{a.name}</span>
                  {typeof a.detail.cname === "string" && <span className="text-xs text-muted-foreground">→ {a.detail.cname}</span>}
                  {finding ? (
                    <Link href={`/security/findings/${finding.id}`}>
                      <Badge variant="destructive">Dangling</Badge>
                    </Link>
                  ) : a.detail.resolves ? null : (
                    <Badge variant="outline">Doesn&apos;t resolve</Badge>
                  )}
                  {data.isNew(a) && <Badge variant="outline">New</Badge>}
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Certificates</CardTitle>
            <CardDescription>The latest certificates logged for your domain. One you didn&apos;t ask for can mean someone else controls a name of yours.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {of("certificate").length === 0 && <p className="text-muted-foreground">None found yet.</p>}
            {of("certificate")
              .slice(0, 15)
              .map((a) => (
                <div key={a.id} className="flex flex-col">
                  <span>
                    {String(a.detail.issuer ?? "")} · {String(a.detail.notBefore ?? "").slice(0, 10)} to {String(a.detail.notAfter ?? "").slice(0, 10)}
                    {data.isNew(a) && (
                      <Badge variant="outline" className="ml-2">
                        New
                      </Badge>
                    )}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{(a.detail.names as string[] | undefined)?.join(", ")}</span>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Look-alike domains</CardTitle>
            <CardDescription>Common typos and other endings of your domain that are registered. Checked through DNS only: Startica never visits them.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {of("lookalike").length === 0 && <p className="text-muted-foreground">None registered.</p>}
            {of("lookalike").map((a) => {
              const finding = data.findingOf(`lookalike:${a.name}`);
              return (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="font-mono text-xs">{a.name}</span>
                  {finding ? (
                    <Link href={`/security/findings/${finding.id}`} className="text-xs underline">
                      Finding
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">reviewed</span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Third-party scripts</CardTitle>
            <CardDescription>Scripts your pages load from other sites without an integrity check, with a fingerprint of their content. A change becomes a finding to review.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {of("script").length === 0 && <p className="text-muted-foreground">None, or not checked yet.</p>}
            {of("script").map((a) => (
              <div key={a.id} className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-xs" title={a.name}>
                  {a.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {a.changedAt ? `Changed ${ago(a.changedAt)}` : `Unchanged since ${ago(a.firstSeenAt)}`} · {Math.round(Number(a.detail.bytes ?? 0) / 1024)} KB
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
