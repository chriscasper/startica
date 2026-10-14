"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { runSetupAgain } from "@/lib/setup-actions";
import { FormDialog, type Field } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import { modelLabel, modelsFor, PROVIDERS, type AiProvider } from "@startica/core/ai/models";
import { openDataFolder, removeAiKey, removeXToken, setLaunchAtLoginAction, saveAiModel, saveAiSettings, savePostingSettings, saveProduct, saveXSettings } from "./actions";

const productFields: Field[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "url", label: "Website", type: "url", required: true, placeholder: "https://" },
  { name: "one_liner", label: "One-liner", type: "text", placeholder: "What it is, in one sentence" },
  {
    name: "stage",
    label: "Stage",
    type: "select",
    options: [
      { value: "idea", label: "Idea" },
      { value: "pre_launch", label: "Pre-launch" },
      { value: "launched", label: "Launched" },
      { value: "growing", label: "Growing" },
    ],
  },
];

export type ProductRow = { id: string; name: string; url: string | null; one_liner: string | null; stage: string };

export function AddProductButton() {
  return (
    <FormDialog
      trigger={
        <Button size="sm">
          <PlusIcon />
          Add product
        </Button>
      }
      title="Add a product"
      description="After adding it, open Intel to build its brief."
      fields={productFields}
      values={{ stage: "launched" }}
      submitLabel="Add product"
      action={(fd) => saveProduct(null, fd)}
    />
  );
}

export function EditProductButton({ product }: { product: ProductRow }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${product.name}`}>
          <PencilIcon />
        </Button>
      }
      title={`Edit ${product.name}`}
      fields={productFields}
      values={product}
      action={(fd) => saveProduct(product.id, fd)}
    />
  );
}

// The image task (Ads AD2) picks among image models, and its effort is the picture's quality.
const modelFields = (task: string): Field[] => {
  const models = modelsFor(task);
  return [
    {
      name: "model",
      label: "Model",
      type: "select",
      options: models.map((m) => ({ value: m.id, label: `${modelLabel(m.id)}${m.id === models[0]!.id ? " per M tokens" : ""}` })),
    },
    {
      name: "effort",
      label: task === "image" ? "Quality" : "Effort",
      type: "select",
      options: ["low", "medium", "high", "xhigh", "max"].map((e) => ({ value: e, label: e })),
    },
    { name: "max_tokens", label: "Max output tokens", type: "text" },
  ];
};

export type AiModelRow = { id: string; task: string; model: string; effort: string | null; max_tokens: number };

export function EditAiModelButton({ row }: { row: AiModelRow }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.task} model`}>
          <PencilIcon />
        </Button>
      }
      title={`Model for “${row.task}”`}
      description="Applies to the next job that runs this task."
      fields={modelFields(row.task)}
      values={{ model: row.model, effort: row.effort ?? "medium", max_tokens: String(row.max_tokens) }}
      action={(fd) => saveAiModel(row.id, fd)}
    />
  );
}

export function AiSettingsButton({ provider, keys, budget }: { provider: AiProvider; keys: Record<AiProvider, boolean>; budget: number }) {
  const keyField = (p: AiProvider): Field => ({
    name: `${p}_key`,
    label: keys[p] ? `${PROVIDERS[p].keyLabel} (leave blank to keep the saved one)` : `${PROVIDERS[p].keyLabel}${p === provider ? "" : " (optional)"}`,
    type: "password",
    placeholder: `${PROVIDERS[p].keyPrefix}…`,
  });
  return (
    <FormDialog
      trigger={<Button size="sm" variant={keys[provider] ? "outline" : "default"}>{keys[provider] ? "Change keys or budget" : "Add API key"}</Button>}
      title="AI provider"
      description="Startica works with Claude or OpenAI, using your own key. Keys are stored encrypted on this computer. Switching provider moves every task to that provider's recommended models. Startica stops calling AI when the month's spend reaches the budget."
      fields={[
        {
          name: "provider",
          label: "Use",
          type: "select",
          options: (Object.keys(PROVIDERS) as AiProvider[]).map((p) => ({ value: p, label: PROVIDERS[p].label })),
        },
        keyField("anthropic"),
        keyField("openai"),
        { name: "budget", label: "Monthly budget (USD)", type: "number", required: true },
      ]}
      values={{ provider, budget: String(budget) }}
      action={saveAiSettings}
    />
  );
}

/** Forgets a saved key (only offered for the provider not in use). */
export function RemoveAiKeyButton({ provider }: { provider: AiProvider }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const { error } = await removeAiKey(provider);
          if (error) toast.error(error);
          else router.refresh();
        })
      }
    >
      Remove {PROVIDERS[provider].label} key
    </Button>
  );
}

export function XApiButton({ hasToken, dailyReads, scanHours }: { hasToken: boolean; dailyReads: number; scanHours: number }) {
  return (
    <div className="flex gap-2">
      <FormDialog
        trigger={<Button size="sm" variant="outline">{hasToken ? "Change" : "Add token"}</Button>}
        title="X API"
        description="Create an app at console.x.com, add credits, and copy its Bearer Token (shown once). It's stored encrypted on this computer and only sent to api.x.com."
        fields={[
          { name: "token", label: hasToken ? "Bearer token (leave blank to keep the saved one)" : "Bearer token", type: "password", placeholder: "AAAA…" },
          { name: "daily_reads", label: "Most post reads per day", type: "number", required: true },
          { name: "scan_hours", label: "Scan X at most every … hours", type: "number", required: true },
        ]}
        values={{ daily_reads: String(dailyReads), scan_hours: String(scanHours) }}
        action={saveXSettings}
      />
      {hasToken && (
        <FormDialog
          trigger={<Button size="sm" variant="ghost">Remove</Button>}
          title="Remove the X API token?"
          description="Startica stops reading X; pasting X links keeps working."
          fields={[]}
          submitLabel="Remove"
          action={() => removeXToken()}
        />
      )}
    </div>
  );
}

export function PostingSettingsButton({ mastodonServer }: { mastodonServer: string }) {
  return (
    <FormDialog
      trigger={<Button size="sm" variant="outline">Edit</Button>}
      title="Posting"
      fields={[{ name: "mastodon_server", label: "Your Mastodon server", type: "text", placeholder: "mastodon.social (or you@mastodon.social)" }]}
      values={{ mastodon_server: mastodonServer }}
      action={savePostingSettings}
    />
  );
}

export function RunSetupAgainButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const { error } = await runSetupAgain();
          if (error) toast.error(error);
          else router.push("/welcome");
        })
      }
    >
      Run setup again
    </Button>
  );
}

/** Launch at login (installed app only): starts Startica in the tray when you log in, so scheduled jobs run. */
export function LaunchAtLoginToggle({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-foreground"
        checked={enabled}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const { error } = await setLaunchAtLoginAction(e.target.checked);
            if (error) toast.error(error);
          })
        }
      />
      Open Startica in the tray when I log in, so scheduled scans and syncs keep running
    </label>
  );
}

export function OpenDataFolderButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const { error } = await openDataFolder();
          if (error) toast.error(error);
        })
      }
    >
      View
    </Button>
  );
}
