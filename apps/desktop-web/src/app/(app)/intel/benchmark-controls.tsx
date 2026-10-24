"use client";

import { useTransition } from "react";
import { PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import { addBenchmark, checkBenchmarksNow, removeBenchmark } from "./benchmark-actions";

const CHANNELS = [
  { value: "bluesky", label: "Bluesky (name.bsky.social)" },
  { value: "mastodon", label: "Mastodon (@name@server)" },
  { value: "reddit", label: "Reddit user (u/name): posting frequency only" },
  { value: "hackernews", label: "Hacker News user" },
];

export function AddAccountButton({ productId, competitors }: { productId: string; competitors: { id: string; name: string }[] }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm">
          <PlusIcon />
          Add an account
        </Button>
      }
      title="Track a public account"
      description="Startica reads the account's public numbers once a day, without signing in. Add your own accounts too, to compare."
      fields={[
        { name: "competitorId", label: "Whose account", type: "select", options: [{ value: "own", label: "Yours" }, ...competitors.map((c) => ({ value: c.id, label: c.name }))] },
        { name: "channel", label: "Channel", type: "select", options: CHANNELS },
        { name: "handle", label: "Handle or profile link", type: "text", required: true, placeholder: "name.bsky.social, @name@server.example, u/name or a profile link" },
      ]}
      values={{ competitorId: "own", channel: "bluesky" }}
      footnote="X isn't offered: Startica doesn't look up accounts on X."
      submitLabel="Track"
      action={(fd) => addBenchmark(productId, fd)}
    />
  );
}

export function RemoveAccountButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Stop tracking ${label}`}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Stop tracking ${label}? Its history goes too.`)) return;
        start(async () => {
          const { error } = await removeBenchmark(id);
          if (error) toast.error(error);
        });
      }}
    >
      <Trash2Icon />
    </Button>
  );
}

export function CheckNowButton({ productId, running, disabled }: { productId: string; running: boolean; disabled?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending || running || Boolean(disabled)}
      title={disabled}
      onClick={() =>
        start(async () => {
          const { error } = await checkBenchmarksNow(productId);
          if (error) toast.error(error);
          else toast.success("Reading the accounts now. Reddit allows about one request a minute, so it can take a while.");
        })
      }
    >
      <RefreshCwIcon className={running ? "animate-spin" : undefined} />
      {running ? "Checking…" : "Check now"}
    </Button>
  );
}
