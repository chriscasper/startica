import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { asc, count, eq } from "drizzle-orm";
import { activeProvider, aiApiKey, monthlyBudgetUsd } from "@startica/core/ai/client";
import { modelLabel, PROVIDERS } from "@startica/core/ai/models";
import { X_COST_PER_READ, X_TOKEN_SECRET, xLastError, xSettings, xUsage } from "@startica/core/channels/x";
import { getSetting } from "@startica/db/bootstrap";
import { dataDir } from "@startica/db/paths";
import * as schema from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, getActiveProduct, getProducts, getWorkspace } from "@/lib/dal";
import { askDesktop, desktopApp } from "@/lib/desktop";
import { POSTING_SETTINGS, type PostingSettings } from "@/lib/posting";
import { cn } from "@/lib/utils";
import { AddSiteButton, SiteSettingsButton } from "../accessibility/controls";
import { Connections, type ConnectionRow } from "./connections";
import { IssueTracker } from "./issue-tracker";
import { trackerFor } from "@startica/core/trackers/trackers";
import {
  AddProductButton,
  AiSettingsButton,
  EditAiModelButton,
  EditProductButton,
  LaunchAtLoginToggle,
  OpenDataFolderButton,
  PostingSettingsButton,
  RemoveAiKeyButton,
  RunSetupAgainButton,
  XApiButton,
} from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings, one tab per kind of setting: General (AI and the app), Products (each
 * product's connections and sites), Channels (finding conversations and posting).
 */
const TABS = {
  general: { label: "General", description: "AI provider, keys and budget; how the app runs." },
  products: { label: "Products", description: "Your products, where Startica reads their results, and the sites it checks." },
  channels: { label: "Channels", description: "Finding conversations and posting: X and Mastodon." },
} as const;
type Tab = keyof typeof TABS;

const taskDescriptions: Record<string, string> = {
  strategy: "Briefs, positioning, roadmap and weekly re-plan",
  research: "Web research on competitors and communities",
  draft: "Reply and post drafts",
  vision: "Reading images in threads and screenshots",
  score: "Scoring conversations for relevance, and reading AI visibility answers",
  answer: "AI visibility: answering your questions with web search, as an assistant would",
  image: "Ads: drawing ad pictures (OpenAI only; effort is the image quality)",
  ping: "System health check",
};

export default function SettingsPage(props: PageProps<"/settings">) {
  return (
    <>
      <PageHeader title="Settings" description="AI and the app, your products, and channels." />
      <Suspense fallback={<PageSkeleton />}>
        <SettingsContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function SettingsContent({ searchParams }: { searchParams: PageProps<"/settings">["searchParams"] }) {
  const params = await searchParams;
  const param = params.tab;
  const tab: Tab = typeof param === "string" && param in TABS ? (param as Tab) : "general";
  return (
    <>
      <nav className="flex w-fit gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Settings sections">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <Link
            key={key}
            href={key === "general" ? "/settings" : `/settings?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", tab === key && "bg-background font-medium text-foreground shadow-sm")}
          >
            {TABS[key].label}
          </Link>
        ))}
      </nav>
      <p className="-mt-3 text-sm text-muted-foreground">{TABS[tab].description}</p>
      {tab === "general" ? <General /> : tab === "products" ? <Products productParam={params.product} /> : <Channels />}
    </>
  );
}

function keyStatus(key: string | null, required: boolean) {
  if (key) return "saved";
  return required ? <span className="text-destructive">not set</span> : "not set";
}

// --- General: AI and the app -----------------------------------------------------------

async function General() {
  const workspace = await getWorkspace();
  const d = await db();
  const [models, provider, anthropicKey, openaiKey, budget, launchAtLogin] = await Promise.all([
    d.select().from(schema.aiModels).where(eq(schema.aiModels.workspaceId, workspace.id)).orderBy(asc(schema.aiModels.task)),
    activeProvider(),
    aiApiKey("anthropic"),
    aiApiKey("openai"),
    monthlyBudgetUsd(),
    askDesktop<boolean>("launch-at-login"),
  ]);
  const app = desktopApp();

  return (
    <>
      <LiveRefresh tables={["ai_models"]} />
      <Card>
        <CardHeader>
          <CardTitle>AI</CardTitle>
          <CardDescription>
            Using {PROVIDERS[provider].label}. {PROVIDERS.anthropic.keyLabel}: {keyStatus(anthropicKey, provider === "anthropic")}.{" "}
            {PROVIDERS.openai.keyLabel}: {keyStatus(openaiKey, provider === "openai")}. Monthly budget: ${budget}.
          </CardDescription>
          <CardAction className="flex gap-2">
            {(provider === "anthropic" ? openaiKey : anthropicKey) && <RemoveAiKeyButton provider={provider === "anthropic" ? "openai" : "anthropic"} />}
            <AiSettingsButton provider={provider} keys={{ anthropic: Boolean(anthropicKey), openai: Boolean(openaiKey) }} budget={budget} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium">Advanced: the model for each task</summary>
            <p className="mt-2 text-sm text-muted-foreground">Picking a provider sets these to its recommended models; change one only if you have a reason to.</p>
            <Table className="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Effort</TableHead>
                  <TableHead className="text-right">Max tokens</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">{m.task}</div>
                      <div className="text-xs text-muted-foreground">{taskDescriptions[m.task] ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {modelLabel(m.model)}
                      <div className="font-mono text-muted-foreground">{m.model}</div>
                    </TableCell>
                    <TableCell>{m.effort ?? "default"}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.maxTokens.toLocaleString()}</TableCell>
                    <TableCell>
                      <EditAiModelButton row={{ id: m.id, task: m.task, model: m.model, effort: m.effort, max_tokens: m.maxTokens }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>App</CardTitle>
          <CardDescription>Scans, syncs and the weekly re-plan only run while Startica is open (closing the window keeps it running in the tray).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {app.packaged ? (
            <LaunchAtLoginToggle enabled={Boolean(launchAtLogin)} />
          ) : (
            <p className="text-muted-foreground">Launch at login: available in the installed app.</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Data folder: <code className="text-xs">{dataDir()}</code>
            </span>
            <OpenDataFolderButton />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <RunSetupAgainButton />
            <span className="text-muted-foreground">Opens the welcome steps again and brings back the Getting started checklist on Today.</span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// --- Products: connections and sites -------------------------------------------------------

/** Products, and the connections and sites of the one picked in the list (`?product=`, else the active product). */
async function Products({ productParam }: { productParam: string | string[] | undefined }) {
  const [products, activeProduct] = await Promise.all([getProducts(), getActiveProduct()]);
  const active = products.find((p) => p.id === productParam) ?? activeProduct;
  const d = await db();
  const [connections, sites, tracker] = await Promise.all([
    active ? d.select().from(schema.connections).where(eq(schema.connections.productId, active.id)) : Promise.resolve([]),
    active ? d.select().from(schema.sites).where(eq(schema.sites.productId, active.id)).orderBy(asc(schema.sites.createdAt)) : Promise.resolve([]),
    active ? trackerFor(active.id) : Promise.resolve(null),
  ]);
  const trackerIssueCount = tracker
    ? ((await d.select({ n: count() }).from(schema.trackerIssues).where(eq(schema.trackerIssues.trackerId, tracker.id)))[0]?.n ?? 0)
    : 0;
  const connectionRows = connections.map(
    (c): ConnectionRow => ({
      id: c.id,
      kind: c.kind,
      config: c.config,
      status: c.status,
      lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
      lastError: c.lastError,
    }),
  );

  return (
    <>
      <LiveRefresh tables={["connections", "products", "sites", "issue_trackers"]} />
      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>
            The things you market and check with Startica. Pick one to see its connections and sites below; the header&apos;s switcher sets the product
            the rest of the app shows.
          </CardDescription>
          <CardAction>
            <AddProductButton />
          </CardAction>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products yet. Add the first one to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id} data-state={p.id === active?.id ? "selected" : undefined}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/settings?tab=products&product=${p.id}`}
                        aria-current={p.id === active?.id ? "true" : undefined}
                        className="hover:underline"
                      >
                        {p.name}
                      </Link>{" "}
                      {p.id === activeProduct?.id && <Badge variant="secondary">Active</Badge>}
                      {p.id === active?.id && p.id !== activeProduct?.id && <Badge variant="outline">Showing below</Badge>}
                      {p.oneLiner && <div className="text-xs font-normal text-muted-foreground">{p.oneLiner}</div>}
                    </TableCell>
                    <TableCell>{p.url}</TableCell>
                    <TableCell>{p.stage.replace("_", "-")}</TableCell>
                    <TableCell>
                      <EditProductButton product={{ id: p.id, name: p.name, url: p.url, one_liner: p.oneLiner, stage: p.stage }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {active && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Connections for {active.name}</CardTitle>
              <CardDescription>
                Where Startica reads this product&apos;s results. Engagement on Reddit, Hacker News, Bluesky, Mastodon and Discourse needs no setup.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Connections productId={active.id} connections={connectionRows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Issue tracker for {active.name}</CardTitle>
              <CardDescription>GitHub or GitLab: where Startica opens issues for the accessibility problems it finds, so they land in your normal workflow.</CardDescription>
            </CardHeader>
            <CardContent>
              <IssueTracker
                productId={active.id}
                tracker={
                  tracker
                    ? {
                        provider: tracker.provider,
                        baseUrl: tracker.baseUrl,
                        repo: tracker.repo,
                        labels: tracker.labels,
                        autoMinImpact: tracker.autoMinImpact,
                        autoMinSecurity: tracker.autoMinSecurity,
                        closeWhenFixed: tracker.closeWhenFixed,
                        status: tracker.status,
                        lastError: tracker.lastError,
                        issueCount: trackerIssueCount,
                      }
                    : null
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sites for {active.name}</CardTitle>
              <CardDescription>The websites Accessibility checks. Scans, issues and pages are on the Accessibility screens.</CardDescription>
              <CardAction>
                <AddSiteButton productId={active.id} suggested={{ name: active.name, url: active.url }} first={sites.length === 0} />
              </CardAction>
            </CardHeader>
            <CardContent>
              {sites.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sites yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead className="text-right">Pages per scan</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Link href={`/accessibility?site=${s.id}`} className="font-medium hover:underline">
                            {s.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{s.startUrl}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.maxPages}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.score == null ? "–" : Math.round(s.score)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.targetScore}</TableCell>
                        <TableCell className="text-right">
                          <SiteSettingsButton site={s} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

// --- Channels: finding conversations and posting --------------------------------------------

async function Channels() {
  const d = await db();
  const [[xToken], x, xToday, posting, xError] = await Promise.all([
    d.select({ id: schema.secrets.id }).from(schema.secrets).where(eq(schema.secrets.name, X_TOKEN_SECRET)),
    xSettings(),
    xUsage(),
    getSetting<PostingSettings>(POSTING_SETTINGS),
    xLastError(),
  ]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>X API (optional, paid)</CardTitle>
          <CardDescription>
            With your own X API bearer token, Startica also finds X posts matching your top listening keywords, reads pasted X links and checks
            replies on what you post there. X charges per post read (about ${X_COST_PER_READ} each), so Startica scans at most every {x.scanHours}{" "}
            hours and stops at {x.dailyReads} reads a day (about ${(x.dailyReads * X_COST_PER_READ).toFixed(2)}). Without a token, paste X links as
            before.
          </CardDescription>
          <CardAction>
            <XApiButton hasToken={Boolean(xToken)} dailyReads={x.dailyReads} scanHours={x.scanHours} />
          </CardAction>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Token: {xToken ? "saved" : "not set"}. Reads today (UTC): {xToday.reads} of {xToday.cap}.
          {xError && <span className="block text-destructive">Last X request failed: {xError.message}.</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Posting</CardTitle>
          <CardDescription>
            Post… opens the site in Startica&apos;s posting window with your reply filled in; you press the site&apos;s own button. You sign in to each
            site once, in that window. Mastodon replies and posts go out from your own server.
          </CardDescription>
          <CardAction>
            <PostingSettingsButton mastodonServer={posting?.mastodonServer ?? ""} />
          </CardAction>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Mastodon server: {posting?.mastodonServer ?? "not set (Post… stays hidden for Mastodon)"}.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Elsewhere</CardTitle>
          <CardDescription>Settings that live next to what they change.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <Link href="/intel" className="w-fit underline">
            Intel: watched communities and listening keywords
          </Link>
          <Link href="/inbox" className="w-fit underline">
            Inbox → Scoring: what gets a draft
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
