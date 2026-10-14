import Link from "next/link";
import { InfoIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AddSiteButton } from "./controls";
import type { loadSites } from "./data";

/** Shared pieces of the Accessibility screens. */

const IMPACT_STYLE: Record<string, string> = {
  critical: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  serious: "border-transparent bg-orange-500/10 text-orange-700 dark:text-orange-300",
  moderate: "border-transparent bg-amber-500/10 text-amber-800 dark:text-amber-300",
  minor: "",
};

export function ImpactBadge({ impact }: { impact: string | null }) {
  return (
    <Badge variant="outline" className={cn("capitalize", IMPACT_STYLE[impact ?? "minor"])}>
      {impact ?? "minor"}
    </Badge>
  );
}

/** Said wherever results appear (ARCHITECTURE.md section 9.1): automated checks are only part of the picture. */
export function AutomatedNote() {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      These are issues found by automated checks (axe-core), which cover only part of WCAG. Many criteria, like keyboard use, meaningful
      alternative text and clear language, still need a person to review them.
    </p>
  );
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadSites>>>;

/** Site switcher (when the product has more than one) for a given Accessibility screen. */
export function SitePicker({ ctx, path }: { ctx: Loaded; path: string }) {
  if (ctx.sites.length < 2) return null;
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Sites">
      {ctx.sites.map((s) => (
        <Link
          key={s.id}
          href={`${path}?site=${s.id}`}
          aria-current={s.id === ctx.site?.id ? "page" : undefined}
          className={cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", s.id === ctx.site?.id && "bg-background font-medium text-foreground shadow-sm")}
        >
          {s.name}
        </Link>
      ))}
    </nav>
  );
}

/** Shown when the product has no site yet. */
export function NoSite({ ctx }: { ctx: Loaded }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Check {ctx.product.name}&apos;s website</CardTitle>
        <CardDescription>
          Add the site and Startica crawls it, checks every page against WCAG 2.2 A and AA, and lists what to fix first. Scans are free: they
          don&apos;t use your AI key.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AddSiteButton productId={ctx.product.id} suggested={{ name: ctx.product.name, url: ctx.product.url }} first />
      </CardContent>
    </Card>
  );
}

export function NoProduct() {
  return (
    <p className="text-sm text-muted-foreground">
      No product yet. <Link href="/settings?tab=products" className="underline">Add one in Settings</Link>, then add its website here.
    </p>
  );
}

/** Why scans can't start here, if they can't. */
export function ScanUnavailable({ demo }: { demo: boolean }) {
  return (
    <p className="rounded-lg border p-3 text-sm">
      {demo
        ? "Scans are off in the demo, like every other outside call. The results below are sample data."
        : "Accessibility scans run in the Startica desktop app. (In browser development mode they need Playwright's Chromium: yarn playwright install chromium in apps/desktop-web.)"}
    </p>
  );
}

export function Score({ value, target }: { value: number | null; target?: number }) {
  if (value == null) return <span className="text-muted-foreground">–</span>;
  const tone = target == null ? "" : value >= target ? "text-emerald-700 dark:text-emerald-400" : value >= target - 20 ? "text-amber-700 dark:text-amber-400" : "text-destructive";
  return <span className={cn("tabular-nums", tone)}>{Math.round(value)}</span>;
}

const PRIORITY_STYLE: Record<string, string> = {
  high: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  medium: "border-transparent bg-amber-500/10 text-amber-800 dark:text-amber-300",
  low: "",
};

/** High / Medium / Low from impact, pages and traffic (ARCHITECTURE.md section 9.3). */
export function PriorityBadge({ band }: { band: "high" | "medium" | "low" }) {
  return (
    <Badge variant="outline" className={cn("capitalize", PRIORITY_STYLE[band])}>
      {band}
    </Badge>
  );
}
