import type { Metadata } from "next";
import { Suspense } from "react";
import { StarticaLogo } from "@startica/brand/react";
import { activeProvider, monthlyBudgetUsd } from "@startica/core/ai/client";
import { setupStatus } from "@startica/core/setup/status";
import { getSetting } from "@startica/db/bootstrap";
import { LiveRefresh } from "@/components/app/live-refresh";
import { Skeleton } from "@/components/ui/skeleton";
import { getActiveProduct, getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import { POSTING_SETTINGS, type PostingSettings } from "@/lib/posting";
import { WelcomeFlow } from "./welcome-flow";

export const metadata: Metadata = { title: "Welcome" };

/** First-run setup: the essentials in three steps, then the Getting started checklist on Today. */
export default function WelcomePage() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-2xl content-center gap-6 p-6">
      <div className="grid gap-1">
        <StarticaLogo title={null} className="mb-4 h-8 w-auto justify-self-start" />
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Startica</h1>
        <p className="text-muted-foreground">Your AI marketing co-founder. Two minutes of setup, and Startica starts learning about your product.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <Welcome />
      </Suspense>
    </main>
  );
}

async function Welcome() {
  const [workspace, product, budget, posting, provider] = await Promise.all([getWorkspace(), getActiveProduct(), monthlyBudgetUsd(), getSetting<PostingSettings>(POSTING_SETTINGS), activeProvider()]);
  const status = await setupStatus(workspace.id, product?.id ?? null);
  const app = desktopApp();
  return (
    <>
      <LiveRefresh tables={["products", "jobs"]} />
      <WelcomeFlow
        status={{ hasKey: status.hasKey, hasProduct: status.hasProduct, intel: status.intel }}
        product={product ? { name: product.name } : null}
        budget={budget}
        provider={provider}
        mastodonServer={posting?.mastodonServer ?? ""}
        desktop={{ electron: app.electron, packaged: app.packaged }}
      />
    </>
  );
}
