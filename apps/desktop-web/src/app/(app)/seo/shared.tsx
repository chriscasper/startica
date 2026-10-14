import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SEO_RULES, type SeoRuleId, type SeoSeverity } from "@startica/core/seo/rules";
import { cn } from "@/lib/utils";
import { AddSiteButton } from "../accessibility/controls";
import type { loadSites } from "../accessibility/data";

/** Shared pieces of the SEO & GEO screens (ARCHITECTURE.md section 10). */

type Loaded = NonNullable<Awaited<ReturnType<typeof loadSites>>>;

const SEVERITY_STYLE: Record<SeoSeverity, string> = {
  high: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  medium: "border-transparent bg-orange-500/10 text-orange-700 dark:text-orange-300",
  low: "border-transparent bg-amber-500/10 text-amber-800 dark:text-amber-300",
  info: "",
};

export function SeverityBadge({ severity }: { severity: SeoSeverity }) {
  return (
    <Badge variant="outline" className={cn("capitalize", SEVERITY_STYLE[severity])}>
      {severity === "info" ? "FYI" : severity}
    </Badge>
  );
}

export const ruleOf = (id: string) => SEO_RULES[id as SeoRuleId] ?? { title: id, severity: "low" as const, category: "basics" as const, why: "", fix: "" };

/** Shown when the product has no site yet (sites are shared with Accessibility). */
export function SeoNoSite({ ctx }: { ctx: Loaded }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Check how {ctx.product.name}&apos;s website does in search and AI answers</CardTitle>
        <CardDescription>
          Add the site and Startica crawls it, checking every page for what search engines and AI assistants need: titles and descriptions, indexing,
          broken links, structured data, and whether AI crawlers may read it. The same scan checks accessibility. Scans are free.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AddSiteButton productId={ctx.product.id} suggested={{ name: ctx.product.name, url: ctx.product.url }} first />
      </CardContent>
    </Card>
  );
}

export function SeoSitePicker({ ctx, path }: { ctx: Loaded; path: string }) {
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
