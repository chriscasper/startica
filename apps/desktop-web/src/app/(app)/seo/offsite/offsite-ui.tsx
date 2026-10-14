"use client";

import { useTransition } from "react";
import { EyeIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import type { ActionResult } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import { checkPages, watch } from "./actions";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, ok: string) =>
    start(async () => {
      const { error } = await fn();
      if (error) toast.error(error);
      else toast.success(ok);
    });
  return [pending, run] as const;
}

export function CheckPagesButton({ productId, running, disabled }: { productId: string; running: boolean; disabled?: string | null }) {
  const [pending, run] = useAction();
  return (
    <Button variant="outline" disabled={pending || running || Boolean(disabled)} title={disabled ?? undefined} onClick={() => run(() => checkPages(productId), "Reading the cited pages…")}>
      {pending || running ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} {running ? "Reading pages…" : "Read the pages again"}
    </Button>
  );
}

export function WatchButton({ productId, name }: { productId: string; name: string }) {
  const [pending, run] = useAction();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => watch(productId, name), `Watching r/${name}: the Inbox scans it from now on`)}>
      <EyeIcon /> Watch r/{name}
    </Button>
  );
}
