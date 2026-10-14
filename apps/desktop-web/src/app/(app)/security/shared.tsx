import Link from "next/link";
import { InfoIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSecurityRule, SECURITY_RULES, SEVERITY_ORDER, type SecurityRule, type SecuritySeverity } from "@startica/core/security/rules";
import { siteFindings } from "@startica/core/security/findings";
import { txtValue, VERIFY_FILE_PATH } from "@startica/core/security/verify";
import { cn } from "@/lib/utils";
import { AddSiteButton } from "../accessibility/controls";
import type { loadSites } from "../accessibility/data";
import { CopyValue, VerifyButton } from "./controls";

/** Shared pieces of the Security screens (ARCHITECTURE.md section 11). */

type Loaded = NonNullable<Awaited<ReturnType<typeof loadSites>>>;
export type FindingRow = Awaited<ReturnType<typeof siteFindings>>[number];

const SEVERITY_STYLE: Record<SecuritySeverity, string> = {
  critical: "border-transparent bg-destructive text-white dark:bg-destructive/80",
  high: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  medium: "border-transparent bg-orange-500/10 text-orange-700 dark:text-orange-300",
  low: "border-transparent bg-amber-500/10 text-amber-800 dark:text-amber-300",
  info: "",
};

export function SeverityBadge({ severity }: { severity: SecuritySeverity }) {
  return (
    <Badge variant="outline" className={cn("capitalize", SEVERITY_STYLE[severity])}>
      {severity === "info" ? "FYI" : severity}
    </Badge>
  );
}

export const STATUS_LABEL: Record<string, string> = { open: "Open", fixed: "Fixed", accepted: "Risk accepted", false_positive: "Not a problem" };

export const ruleOf = (id: string): SecurityRule =>
  isSecurityRule(id) ? SECURITY_RULES[id] : { title: id, severity: "low", category: "headers", scope: "page", why: "", fix: "", controls: [] };

/** Most serious first; among equals, known exploited (KEV) and likelier exploitation (EPSS) first, then the most pages. */
export const bySeverity = (a: FindingRow, b: FindingRow) =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
  Number(Boolean(b.detail.kev)) - Number(Boolean(a.detail.kev)) ||
  Number(b.detail.epss ?? 0) - Number(a.detail.epss ?? 0) ||
  b.pagesCount - a.pagesCount;

/** Said wherever results appear (ARCHITECTURE.md section 11.1): outside checks see only part of a site's security. */
export function OutsideNote() {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      These are problems found by automated checks from outside the site: what any visitor&apos;s browser receives. They don&apos;t test how the
      application handles input, access between users, or anything behind a sign-in, so a short list doesn&apos;t mean the site is safe.
    </p>
  );
}

export function SecurityNoSite({ ctx }: { ctx: Loaded }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Check {ctx.product.name}&apos;s website for security problems</CardTitle>
        <CardDescription>
          Add the site, prove it&apos;s yours, and every scan also checks HTTPS, security headers, cookies, exposed files and your email domain. Checks
          only read what any visitor can see; they never try to break in. Scans are free.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AddSiteButton productId={ctx.product.id} suggested={{ name: ctx.product.name, url: ctx.product.url }} first />
      </CardContent>
    </Card>
  );
}

/** The steps to prove a site is the user's, until it's verified. */
export function VerifyCard({ site, token, demo }: { site: { id: string; name: string; startUrl: string }; token: string; demo: boolean }) {
  const host = new URL(site.startUrl).hostname;
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Prove {site.name} is yours</CardTitle>
        <CardDescription>
          Security checks look at a site more closely than the other modules, so Startica runs them only on sites you can show you control. Do one of
          these, then press Verify.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 text-sm">
        <ol className="flex list-decimal flex-col gap-4 pl-5">
          <li>
            <span className="font-medium">Search Console:</span> if the product&apos;s{" "}
            <Link href="/seo/search" className="underline">
              Search Console connection
            </Link>{" "}
            covers {host}, nothing else is needed.
          </li>
          <li className="flex flex-col gap-1.5">
            <span>
              <span className="font-medium">DNS record:</span> add a TXT record on <code className="font-mono text-xs">{host.replace(/^www\./, "")}</code> (or{" "}
              <code className="font-mono text-xs">{host}</code>) with this value:
            </span>
            <CopyValue value={txtValue(token)} label="the TXT record value" />
            <span className="text-xs text-muted-foreground">DNS changes can take from a few minutes to an hour to show up.</span>
          </li>
          <li className="flex flex-col gap-1.5">
            <span>
              <span className="font-medium">File:</span> publish a text file at <code className="font-mono text-xs">{VERIFY_FILE_PATH}</code> containing:
            </span>
            <CopyValue value={token} label="the verification code" />
          </li>
        </ol>
        <VerifyButton siteId={site.id} disabled={demo} />
        {demo && <p className="text-xs text-muted-foreground">Verification is off in the demo.</p>}
      </CardContent>
    </Card>
  );
}
