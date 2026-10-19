"use client";

import { useState, useTransition } from "react";
import { CopyIcon, ExternalLinkIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type Field } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectProductDb, deleteConnection, productDbSetupSql, saveConnection, syncConnections, type ConnectionKind } from "./actions";

export type ConnectionRow = {
  id: string;
  kind: ConnectionKind;
  config: Record<string, unknown>;
  status: "untested" | "ok" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ error: string | null }>, ok?: string) =>
    startTransition(async () => {
      const { error } = await fn();
      if (error) toast.error(error);
      else if (ok) toast.success(ok);
    });
  return [pending, run] as const;
}

function Status({ conn }: { conn: ConnectionRow | undefined }) {
  if (!conn) return <Badge variant="outline">Not connected</Badge>;
  if (conn.status === "ok") return <Badge variant="secondary">Connected</Badge>;
  if (conn.status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="outline">Checking…</Badge>;
}

function Row({
  title,
  what,
  conn,
  actions,
  children,
}: {
  title: string;
  what: string;
  conn: ConnectionRow | undefined;
  actions: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [pending, run] = useAction();
  return (
    <div className="grid gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{title}</h3>
        <Status conn={conn} />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {actions}
          {conn && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${title}`}
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Remove the ${title} connection for this product?`)) run(() => deleteConnection(conn.id));
              }}
            >
              <Trash2Icon />
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{what}</p>
      {children}
      {conn?.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Last synced {new Date(conn.lastSyncedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
      {conn?.status === "error" && conn.lastError && <p className="text-sm text-destructive">{conn.lastError}</p>}
    </div>
  );
}

// --- Google Analytics (service account) -------------------------------------------

const linkClass = "inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-4";

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
      {children}
      <ExternalLinkIcon className="size-3" aria-hidden />
    </a>
  );
}

const GA4_STEPS = [
  <>
    In <ExternalLink href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com">Google Cloud Console</ExternalLink>, pick or create
    a project and enable the <strong>Google Analytics Data API</strong>.
  </>,
  <>
    Create a <ExternalLink href="https://console.cloud.google.com/iam-admin/serviceaccounts">service account</ExternalLink> (no roles needed), then open it
    and choose <strong>Keys → Add key → JSON</strong>. A .json file downloads.
  </>,
  <>
    In Google Analytics, go to <strong>Admin → Property access management</strong> and add the service account&apos;s email (it ends in
    .iam.gserviceaccount.com) as a <strong>Viewer</strong>.
  </>,
];

function Ga4({ productId, conn }: { productId: string; conn?: ConnectionRow }) {
  const current = typeof conn?.config.propertyId === "string" ? conn.config.propertyId : "";
  return (
    <Row
      title="Google Analytics 4"
      what="Visits by source and landing page, engagement, countries and devices, key events, and visits from each Startica reply."
      conn={conn}
      actions={
        <FormDialog
          trigger={<Button size="sm" variant={conn ? "outline" : "default"}>{conn ? "Replace key" : "Connect"}</Button>}
          title="Connect Google Analytics 4"
          description="Startica reads GA4 with a service account: a read-only key that only sees the properties you add it to."
          steps={GA4_STEPS}
          fields={[
            { name: "propertyId", label: "Property ID", type: "text", required: true, placeholder: "123456789", hint: "In Google Analytics: Admin → Property details." },
            {
              name: "secret",
              label: "Service account key",
              type: "textarea",
              rows: 4,
              placeholder: '{ "type": "service_account", … }',
              fileAccept: ".json,application/json",
              hint: conn ? "Leave empty to keep the saved key." : "Delete the downloaded file once it's saved here.",
            },
          ]}
          footnote="Startica checks the connection right away. The key is stored encrypted on this computer."
          values={{ propertyId: current }}
          submitLabel="Save and test"
          action={(fd) => saveConnection(productId, "ga4", fd)}
        />
      }
    >
      {current && <p className="text-sm text-muted-foreground">Property {current}</p>}
    </Row>
  );
}

// --- Umami (API key) ---------------------------------------------------------------------

function Umami({ productId, conn }: { productId: string; conn?: ConnectionRow }) {
  const c = conn?.config ?? {};
  const cloud = !c.baseUrl || c.baseUrl === "https://api.umami.is/v1";
  const steps = [
    <>
      <strong>Umami Cloud:</strong> in <ExternalLink href="https://cloud.umami.is">Umami</ExternalLink>, open <strong>Settings → API keys</strong> and create a key.{" "}
      <strong>Your own Umami (v3.4 or later):</strong> the same place; for read-only access, put the website in a team, add a <strong>view-only</strong> user to that team as view-only,
      sign in as that user and create its key. Older installs: use <code>username:password</code> of a view-only user instead of a key.
    </>,
    <>
      Copy the website&apos;s ID: <strong>Settings → Websites → Edit</strong> (it looks like <code>4fb7a6c2-…</code>).
    </>,
  ];
  return (
    <Row
      title="Umami"
      what="Visits, visitors, sources, pages, custom events, and visits from each Startica post. Use it instead of Google Analytics, or as well (Google Analytics is used when both work)."
      conn={conn}
      actions={
        <FormDialog
          trigger={<Button size="sm" variant={conn ? "outline" : "default"}>{conn ? "Change" : "Connect"}</Button>}
          title="Connect Umami"
          description="Startica reads your Umami statistics with an API key. It only reads; nothing is changed in Umami."
          steps={steps}
          fields={[
            { name: "baseUrl", label: "Server", type: "text", placeholder: "Leave empty for Umami Cloud, or https://umami.example.com", hint: "Your own Umami: its address. Startica adds /api." },
            { name: "websiteId", label: "Website ID", type: "text", required: true, placeholder: "4fb7a6c2-1d2e-…" },
            { name: "keyEvents", label: "Key events (optional)", type: "text", placeholder: "signup, purchase", hint: "Custom event names that count as conversions. Empty: every custom event counts." },
            { name: "secret", label: "API key", type: "password", placeholder: "umami_…, or username:password", hint: conn ? "Leave empty to keep the saved key." : undefined },
          ]}
          footnote="Startica checks the key can read the website before saving. It's stored encrypted on this computer."
          values={{ baseUrl: cloud ? "" : String(c.baseUrl ?? ""), websiteId: String(c.websiteId ?? ""), keyEvents: Array.isArray(c.keyEvents) ? (c.keyEvents as string[]).join(", ") : "" }}
          submitLabel="Save and sync"
          action={(fd) => saveConnection(productId, "umami", fd)}
        />
      }
    >
      {typeof c.websiteId === "string" && (
        <p className="text-sm text-muted-foreground">
          {cloud ? "Umami Cloud" : String(c.baseUrl)} · website {String(c.websiteId).slice(0, 8)}…
          {Array.isArray(c.keyEvents) && c.keyEvents.length ? ` · key events: ${(c.keyEvents as string[]).join(", ")}` : ""}
        </p>
      )}
    </Row>
  );
}

// --- Google Search Console (service account) --------------------------------------

function SearchConsole({ productId, conn, ga4 }: { productId: string; conn?: ConnectionRow; ga4?: ConnectionRow }) {
  const property = typeof conn?.config.siteUrl === "string" ? conn.config.siteUrl : "";
  const usesGa4Key = conn?.config.useGa4Key === true;
  const steps = [
    <>
      In <ExternalLink href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com">Google Cloud Console</ExternalLink>, enable the{" "}
      <strong>Google Search Console API</strong> in the project of your service account{ga4 ? " (the one GA4 uses works)" : ""}.
    </>,
    ga4 ? (
      <>Reuse the GA4 service account below, or create another one and download its JSON key.</>
    ) : (
      <>
        Create a <ExternalLink href="https://console.cloud.google.com/iam-admin/serviceaccounts">service account</ExternalLink> (no roles needed), then choose{" "}
        <strong>Keys → Add key → JSON</strong>.
      </>
    ),
    <>
      In <ExternalLink href="https://search.google.com/search-console">Search Console</ExternalLink>, open the property&apos;s <strong>Settings → Users and
      permissions → Add user</strong>, and add the service account&apos;s email with <strong>Restricted</strong> permission.
    </>,
  ];
  const fields: Field[] = [
    {
      name: "siteUrl",
      label: "Property",
      type: "text",
      required: true,
      placeholder: "example.com or https://example.com/",
      hint: "A domain on its own means a Domain property (sc-domain:). Use the full address for a URL-prefix property.",
    },
    ...(ga4 ? [{ name: "useGa4Key", label: "Use the GA4 service account key", type: "checkbox" } satisfies Field] : []),
    {
      name: "secret",
      label: ga4 ? "Or a service account key of its own" : "Service account key",
      type: "textarea",
      rows: 4,
      placeholder: '{ "type": "service_account", … }',
      fileAccept: ".json,application/json",
      hint: conn && !usesGa4Key ? "Leave empty to keep the saved key." : undefined,
    },
  ];
  return (
    <Row
      title="Google Search Console"
      what="Searches you're found for: clicks, impressions, positions, and your sitemaps. Shows on SEO & GEO → Search."
      conn={conn}
      actions={
        <FormDialog
          trigger={<Button size="sm" variant={conn ? "outline" : "default"}>{conn ? "Change" : "Connect"}</Button>}
          title="Connect Google Search Console"
          description="Startica reads Search Console with a service account: read-only, and it only sees the properties you add it to."
          steps={steps}
          fields={fields}
          footnote="The first sync reads the last 16 months, which can take a minute. The key is stored encrypted on this computer."
          values={{ siteUrl: property, useGa4Key: conn ? (usesGa4Key ? "on" : "") : ga4 ? "on" : "" }}
          submitLabel="Save and sync"
          action={(fd) => saveConnection(productId, "search_console", fd)}
        />
      }
    >
      {property && (
        <p className="text-sm text-muted-foreground">
          {property}
          {usesGa4Key ? " · uses the GA4 key" : ""}
        </p>
      )}
    </Row>
  );
}

// --- Bing Webmaster Tools (API key) -------------------------------------------------

function Bing({ productId, conn }: { productId: string; conn?: ConnectionRow }) {
  const site = typeof conn?.config.siteUrl === "string" ? conn.config.siteUrl : "";
  const steps = [
    <>
      In <ExternalLink href="https://www.bing.com/webmasters">Bing Webmaster Tools</ExternalLink>, add and verify the site (you can import it from Search
      Console).
    </>,
    <>
      Open <strong>Settings → API access</strong>, accept the terms, and generate an <strong>API key</strong>. One key covers every site in the account.
    </>,
  ];
  return (
    <Row
      title="Bing Webmaster Tools"
      what="Optional. Clicks and impressions from Bing and Copilot (Bing reports them together), and top queries and pages, updated weekly by Bing."
      conn={conn}
      actions={
        <FormDialog
          trigger={<Button size="sm" variant="outline">{conn ? "Replace key" : "Connect"}</Button>}
          title="Connect Bing Webmaster Tools"
          steps={steps}
          fields={[
            { name: "siteUrl", label: "Site", type: "text", required: true, placeholder: "https://example.com/" },
            { name: "secret", label: "API key", type: "password", hint: conn ? "Leave empty to keep the saved key." : undefined },
          ]}
          footnote="A Bing API key can do anything your Bing Webmaster Tools account can; Startica only reads with it. It's stored encrypted on this computer."
          values={{ siteUrl: site }}
          submitLabel="Save and sync"
          action={(fd) => saveConnection(productId, "bing_webmaster", fd)}
        />
      }
    >
      {site && <p className="text-sm text-muted-foreground">{site}</p>}
    </Row>
  );
}

// --- Stripe (guided key) -----------------------------------------------------------

function Stripe({ productId, conn }: { productId: string; conn?: ConnectionRow }) {
  const steps = [
    <>
      Open Stripe&apos;s <ExternalLink href="https://dashboard.stripe.com/apikeys/create">Create restricted key</ExternalLink> page in the right Stripe
      account.
    </>,
    <>
      Name it <strong>Startica</strong>. Set <strong>Read</strong> for Customers, Subscriptions, Prices and Invoices; leave everything else as None.
    </>,
    <>Create the key and copy it (it starts with rk_live_).</>,
  ];
  return (
    <Row
      title="Stripe"
      what="Subscriptions, trials, MRR and how it moved, cancellations and revenue paid."
      conn={conn}
      actions={
        <FormDialog
          trigger={<Button size="sm" variant={conn ? "outline" : "default"}>{conn ? "Replace key" : "Connect"}</Button>}
          title="Connect Stripe"
          description="Startica reads Stripe with a restricted key that can only read the four kinds of data it needs."
          steps={steps}
          fields={[{ name: "secret", label: "Restricted key", type: "password", placeholder: "rk_live_…", hint: conn ? "Leave empty to keep the saved key." : undefined }]}
          footnote="Startica checks the key right away. It's stored encrypted on this computer."
          submitLabel="Save and test"
          action={(fd) => saveConnection(productId, "stripe", fd)}
        />
      }
    />
  );
}

// --- Product database: SQL you run, then a read-only login ------------------------------

type Metric = { name: string; schema: string; table: string; timeColumn: string; count: "rows" | "distinct"; distinctColumn?: string };

const SIGNUPS: Metric = { name: "signups", schema: "auth", table: "users", timeColumn: "created_at", count: "rows" };

function MetricEditor({ metric, onChange, onRemove }: { metric: Metric; onChange: (m: Metric) => void; onRemove: () => void }) {
  return (
    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1.4fr_1fr_1.2fr_auto] sm:items-end">
      <div className="grid gap-1">
        <Label className="text-xs">Metric name</Label>
        <Input value={metric.name} onChange={(e) => onChange({ ...metric, name: e.target.value })} placeholder="signups" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Table</Label>
        <Input
          value={metric.table ? `${metric.schema}.${metric.table}` : ""}
          onChange={(e) => {
            const [schema, table] = e.target.value.includes(".") ? e.target.value.split(".", 2) : ["public", e.target.value];
            onChange({ ...metric, schema: schema ?? "public", table: table ?? "" });
          }}
          placeholder="public.events"
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Date column</Label>
        <Input value={metric.timeColumn} onChange={(e) => onChange({ ...metric, timeColumn: e.target.value })} placeholder="created_at" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Count per day</Label>
        <div className="flex gap-1">
          <select
            className={selectClass}
            value={metric.count}
            onChange={(e) => onChange({ ...metric, count: e.target.value as Metric["count"], distinctColumn: e.target.value === "rows" ? undefined : metric.distinctColumn })}
          >
            <option value="rows">Rows</option>
            <option value="distinct">Distinct…</option>
          </select>
          {metric.count === "distinct" && (
            <Input aria-label="Column to count distinct values of" value={metric.distinctColumn ?? ""} onChange={(e) => onChange({ ...metric, distinctColumn: e.target.value })} placeholder="user_id" />
          )}
        </div>
      </div>
      <Button size="icon-sm" variant="ghost" aria-label="Remove metric" onClick={onRemove}>
        <Trash2Icon />
      </Button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <span className="grid size-5 place-items-center rounded-full bg-muted text-xs tabular-nums">{n}</span>
        {title}
      </h3>
      <div className="grid gap-2 pl-7">{children}</div>
    </section>
  );
}

function ProductDbSetup({ productId, conn }: { productId: string; conn?: ConnectionRow }) {
  const saved = Array.isArray(conn?.config.metrics) ? (conn.config.metrics as Metric[]) : null;
  const projectRef = typeof conn?.config.projectRef === "string" ? conn.config.projectRef : null;
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metric[]>(saved ?? [SIGNUPS]);
  const [setup, setSetup] = useState<{ sql: string; password: string } | null>(null);
  const [connectionString, setConnectionString] = useState("");
  const [pending, startTransition] = useTransition();

  const edit = (next: Metric[]) => {
    setMetrics(next);
    setSetup(null); // the SQL no longer matches
  };
  const writeSql = () =>
    startTransition(async () => {
      const res = await productDbSetupSql(productId, { metrics });
      if (res.error || !res.sql || !res.password) toast.error(res.error ?? "Couldn't write the SQL");
      else setSetup({ sql: res.sql, password: res.password });
    });
  const connect = () =>
    startTransition(async () => {
      if (!setup) return;
      const { error } = await connectProductDb(productId, { metrics, password: setup.password, connectionString });
      if (error) toast.error(error);
      else {
        toast.success("Connected with the read-only login. Syncing now.");
        setOpen(false);
      }
    });
  const copy = () =>
    setup &&
    navigator.clipboard.writeText(setup.sql).then(
      () => toast.success("SQL copied"),
      () => toast.error("Couldn't copy"),
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setMetrics(saved ?? [SIGNUPS]);
          setSetup(null);
          setConnectionString("");
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" variant={conn ? "outline" : "default"} />}>{conn ? "Change setup" : "Set up"}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Connect the product database</DialogTitle>
          <DialogDescription>
            You run a short SQL script in your own database. It creates a view with daily totals only, and a read-only login that can see nothing else.
            Startica connects with that login. It never needs a login that can change your data.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] gap-5 overflow-y-auto pr-1">
          <Step n={1} title="Pick what to count">
            {metrics.map((m, i) => (
              <MetricEditor key={i} metric={m} onChange={(next) => edit(metrics.map((x, j) => (j === i ? next : x)))} onRemove={() => edit(metrics.filter((_, j) => j !== i))} />
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => edit([...metrics, { name: "", schema: "public", table: "", timeColumn: "created_at", count: "rows" }])}>
                <PlusIcon /> Add metric
              </Button>
              <p className="text-xs text-muted-foreground">
                Analytics shows <code>signups</code> and <code>active_users</code> by name (for example distinct <code>user_id</code> per day from an events table);
                other metrics are stored too.
              </p>
            </div>
            {!setup && (
              <div>
                <Button size="sm" onClick={writeSql} disabled={pending || metrics.length === 0}>
                  Write the SQL
                </Button>
              </div>
            )}
          </Step>

          {setup && (
            <>
              <Step n={2} title="Run this SQL in your database">
                <p className="text-sm text-muted-foreground">
                  Supabase: open{" "}
                  <ExternalLink href={`https://supabase.com/dashboard/project/${projectRef ?? "_"}/sql/new`}>SQL Editor</ExternalLink>, paste it and click Run. Other
                  Postgres: run it with psql as the database owner. If a table or column name is wrong, Postgres says which; fix it above and write the SQL again.
                </p>
                <div className="relative">
                  <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{setup.sql}</pre>
                  <Button size="sm" variant="outline" className="absolute top-2 right-2" onClick={copy}>
                    <CopyIcon /> Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">It includes the read-only login&apos;s password. Running it again later is safe: it updates the view and keeps the login.</p>
              </Step>

              <Step n={3} title="Paste your connection string">
                <Input
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  placeholder={conn ? "Leave empty to keep the saved database" : "postgresql://postgres.abcd…:[YOUR-PASSWORD]@aws-0-….pooler.supabase.com:6543/postgres"}
                  aria-label="Connection string"
                />
                <p className="text-xs text-muted-foreground">
                  Supabase: <strong>Connect</strong> at the top of your project → <strong>Transaction pooler</strong>. Leave <code>[YOUR-PASSWORD]</code> as it is:
                  Startica only keeps the host and project, signs in as <code>startica_reader</code> with the password from the SQL, and never stores yours. It
                  refuses any login that can change data.
                </p>
              </Step>
            </>
          )}
        </div>

        {setup && (
          <DialogFooter>
            <Button onClick={connect} disabled={pending || (!conn && !connectionString.trim())}>
              {pending ? "Testing…" : "I ran it: test and save"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

const urlFields: Field[] = [
  { name: "view", label: "View", type: "text", required: true, placeholder: "startica.daily_metrics" },
  { name: "secret", label: "Connection URL of a read-only login", type: "password", placeholder: "postgresql://…" },
];

function ProductDb({ productId, conn }: { productId: string; conn?: ConnectionRow }) {
  return (
    <Row
      title="Product database"
      what="Product numbers like signups and active users, through a read-only login that sees daily totals only. Works with Supabase and any Postgres."
      conn={conn}
      actions={
        <>
          <ProductDbSetup productId={productId} conn={conn} />
          <FormDialog
            trigger={
              <Button size="sm" variant="ghost">
                Use a URL instead
              </Button>
            }
            title="Connect with a connection URL"
            description="Advanced: if you made your own view and read-only login. The view must return (day date, metric text, value numeric). Startica tests the login first and refuses one that can change data."
            fields={urlFields}
            values={{ view: typeof conn?.config.view === "string" ? conn.config.view : "startica.daily_metrics" }}
            submitLabel="Test and save"
            action={(fd) => saveConnection(productId, "product_db", fd)}
          />
        </>
      }
    >
      {conn && Array.isArray(conn.config.metrics) && (
        <p className="text-xs text-muted-foreground">
          Tracking: {(conn.config.metrics as Metric[]).map((m) => m.name).join(", ")}
          {typeof conn.config.host === "string" ? ` · ${conn.config.host}` : ""}
        </p>
      )}
    </Row>
  );
}

export function Connections({ productId, connections }: { productId: string; connections: ConnectionRow[] }) {
  const [pending, run] = useAction();
  const find = (kind: ConnectionKind) => connections.find((c) => c.kind === kind);

  return (
    <div className="grid gap-3">
      <Ga4 productId={productId} conn={find("ga4")} />
      <Umami productId={productId} conn={find("umami")} />
      <SearchConsole productId={productId} conn={find("search_console")} ga4={find("ga4")} />
      <Bing productId={productId} conn={find("bing_webmaster")} />
      <Stripe productId={productId} conn={find("stripe")} />
      <ProductDb productId={productId} conn={find("product_db")} />
      {connections.length > 0 && (
        <div>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => syncConnections(productId), "Syncing…")}>
            <RefreshCwIcon />
            Sync now
          </Button>
          <span className="ml-3 text-xs text-muted-foreground">Syncs run automatically every day at 08:15 (local time) while Startica is open.</span>
        </div>
      )}
    </div>
  );
}
