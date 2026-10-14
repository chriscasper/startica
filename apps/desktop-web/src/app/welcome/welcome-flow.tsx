"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAiSettings } from "@/app/(app)/settings/actions";
import { PROVIDERS, type AiProvider } from "@startica/core/ai/models";
import { addFirstProduct, enterDemo, finishWelcome, saveSetupExtras } from "@/lib/setup-actions";

const DOCS = "https://docs.mystartica.com";
type Step = "key" | "product" | "extras";
const STEPS: Step[] = ["key", "product", "extras"];

type Props = {
  status: { hasKey: boolean; hasProduct: boolean; intel: "none" | "building" | "ready" | "failed" };
  product: { name: string } | null;
  budget: number;
  provider: AiProvider;
  mastodonServer: string;
  desktop: { electron: boolean; packaged: boolean };
};

const checkboxClass = "size-4 accent-foreground";

export function WelcomeFlow({ status, product, budget, provider: initialProvider, mastodonServer, desktop }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(!status.hasKey ? "key" : !status.hasProduct ? "product" : "extras");
  const [pending, start] = useTransition();
  const [hasKey, setHasKey] = useState(status.hasKey);
  const [provider, setProvider] = useState<AiProvider>(initialProvider);

  const run = (fn: () => Promise<{ error: string | null }>, then: () => void) =>
    start(async () => {
      const { error } = await fn();
      if (error) toast.error(error);
      else then();
    });

  const done = () => run(finishWelcome, () => router.push("/today"));
  // With a product already saved ("Run setup again"), the product step is skipped: the wizard never adds a second one.
  const afterKey: Step = status.hasProduct ? "extras" : "product";

  return (
    <div className="grid gap-4">
      <ol className="flex gap-2 text-sm" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${s === step ? "font-medium text-foreground" : "text-muted-foreground"}`} aria-current={s === step ? "step" : undefined}>
            <span className={`grid size-6 place-items-center rounded-full border text-xs ${STEPS.indexOf(step) > i ? "bg-foreground text-background" : ""}`}>
              {STEPS.indexOf(step) > i ? <CheckIcon className="size-3" /> : i + 1}
            </span>
            {{ key: "AI", product: "Your product", extras: "Extras" }[s]}
            {i < STEPS.length - 1 && <span className="mx-1 text-muted-foreground">·</span>}
          </li>
        ))}
      </ol>

      {step === "key" && (
        <Card>
          <CardHeader>
            <CardTitle>Connect AI</CardTitle>
            <CardDescription>
              Startica uses AI to research your product, score conversations and write drafts, with your own API key from Claude or OpenAI (step
              by step:{" "}
              <a className="underline" href={`${DOCS}/credentials/${provider}/`} target="_blank" rel="noreferrer">
                the guide
              </a>
              ). It&apos;s stored encrypted on this computer, and Startica stops calling AI when the month&apos;s budget is spent.
            </CardDescription>
          </CardHeader>
          <form action={(fd) => run(() => saveAiSettings(fd), () => (setHasKey(true), setStep(afterKey)))}>
            <CardContent className="grid gap-4">
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">Provider</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(PROVIDERS) as AiProvider[]).map((p) => (
                    <label key={p} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${provider === p ? "border-foreground" : ""}`}>
                      <input type="radio" name="provider" value={p} checked={provider === p} onChange={() => setProvider(p)} className={checkboxClass} />
                      {PROVIDERS[p].label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-1">
                <Label htmlFor="api_key">{PROVIDERS[provider].keyLabel}</Label>
                <Input key={provider} id="api_key" name={`${provider}_key`} type="password" placeholder={`${PROVIDERS[provider].keyPrefix}…`} autoComplete="off" required />
                <p className="text-xs text-muted-foreground">
                  Create one at{" "}
                  <a className="underline" href={PROVIDERS[provider].keyUrl} target="_blank" rel="noreferrer">
                    {new URL(PROVIDERS[provider].keyUrl).host}
                  </a>
                  . You can add the other provider&apos;s key later in Settings → General → AI.
                </p>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="budget">Monthly budget (USD)</Label>
                <Input id="budget" name="budget" type="number" min={1} defaultValue={budget} required className="w-32" />
                <p className="text-xs text-muted-foreground">A typical month for one product is a few dollars; building intel costs under $1.</p>
              </div>
            </CardContent>
            <CardFooter className="mt-4 flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2Icon className="animate-spin" />} Save and continue
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep(afterKey)}>
                Skip for now
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "product" && !status.hasProduct && (
        <Card>
          <CardHeader>
            <CardTitle>What are you marketing?</CardTitle>
            <CardDescription>Startica reads the website and researches the market to learn who it&apos;s for and where those people talk.</CardDescription>
          </CardHeader>
          <form
            action={(fd) =>
              run(
                () => addFirstProduct(fd),
                () => {
                  setStep("extras");
                  router.refresh();
                },
              )
            }
          >
            <CardContent className="grid gap-4">
              <div className="grid gap-1">
                <Label htmlFor="name">Product name</Label>
                <Input id="name" name="name" required placeholder="Fieldnote" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="url">Website</Label>
                <Input id="url" name="url" required placeholder="https://example.com" />
              </div>
              {hasKey ? (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="build_intel" defaultChecked className={`${checkboxClass} mt-0.5`} />
                  <span>
                    Start building intel now: the AI reads the site and researches the market (about 3–4 minutes, under $1). You can keep setting up
                    meanwhile.
                  </span>
                </label>
              ) : (
                <p className="text-sm text-muted-foreground">Without an AI key there&apos;s no intel yet: add one later, then click Build intel on Today&apos;s checklist.</p>
              )}
            </CardContent>
            <CardFooter className="mt-4 flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2Icon className="animate-spin" />} Continue
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep("key")}>
                Back
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "extras" && (
        <Card>
          <CardHeader>
            <CardTitle>A few extras</CardTitle>
            <CardDescription>
              {status.intel === "building" && (
                <span className="flex items-center gap-2">
                  <Loader2Icon className="size-4 animate-spin" /> Building intel for {product?.name ?? "your product"}… (3–4 minutes)
                </span>
              )}
              {status.intel === "ready" && <span>Intel for {product?.name ?? "your product"} is ready.</span>}
              {status.intel === "failed" && <span className="text-destructive">Intel didn&apos;t finish; you can retry it from Today.</span>}
              {status.intel === "none" && <span>All optional; you can change these later in Settings.</span>}
            </CardDescription>
          </CardHeader>
          <form action={(fd) => run(() => saveSetupExtras(fd), done)}>
            <CardContent className="grid gap-5">
              {desktop.packaged && <input type="hidden" name="launch_at_login_shown" value="1" />}
              {desktop.packaged && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="launch_at_login" defaultChecked className={`${checkboxClass} mt-0.5`} />
                  <span>
                    Open Startica when I log in (it waits in the menu bar or tray), so scans and engagement checks keep running.
                  </span>
                </label>
              )}
              <div className="grid gap-1">
                <Label htmlFor="mastodon_server">Your Mastodon server (optional)</Label>
                <Input id="mastodon_server" name="mastodon_server" defaultValue={mastodonServer} placeholder="mastodon.social" className="max-w-xs" />
                <p className="text-xs text-muted-foreground">Only if you post on Mastodon: replies go out from your own server.</p>
              </div>
              <div className="grid gap-1 text-sm">
                <span className="font-medium">See what works (later)</span>
                <span className="text-muted-foreground">
                  Connect Google Analytics, Stripe or your product&apos;s database to see visits, signups and revenue from what you post. Each takes 5–30
                  minutes, so it&apos;s on Today&apos;s checklist rather than here:{" "}
                  <a className="underline" href={`${DOCS}/credentials/google/`} target="_blank" rel="noreferrer">
                    Google
                  </a>
                  ,{" "}
                  <a className="underline" href={`${DOCS}/credentials/stripe/`} target="_blank" rel="noreferrer">
                    Stripe
                  </a>
                  ,{" "}
                  <a className="underline" href={`${DOCS}/credentials/supabase/`} target="_blank" rel="noreferrer">
                    Supabase
                  </a>
                  .
                </span>
              </div>
            </CardContent>
            <CardFooter className="mt-4 flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2Icon className="animate-spin" />} Finish
              </Button>
              {/* With a product already saved (e.g. "Run setup again"), Back goes to the AI step, not to a second product. */}
              <Button type="button" variant="ghost" onClick={() => setStep(status.hasProduct ? "key" : "product")}>
                Back
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {desktop.electron && (
          <button
            type="button"
            className="underline underline-offset-4 hover:text-foreground"
            disabled={pending}
            onClick={() => run(enterDemo, () => toast.success("Opening the demo: Startica restarts with a sample product."))}
          >
            Look around with a sample product first
          </button>
        )}
        <button type="button" className="underline underline-offset-4 hover:text-foreground" disabled={pending} onClick={done}>
          Skip setup
        </button>
        <a className="ml-auto underline underline-offset-4 hover:text-foreground" href={`${DOCS}/getting-started/first-run/`} target="_blank" rel="noreferrer">
          Help with setup
        </a>
      </div>
    </div>
  );
}
