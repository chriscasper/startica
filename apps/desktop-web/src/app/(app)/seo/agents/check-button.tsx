"use client";

import { useTransition } from "react";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { checkNow } from "./actions";

export function CheckNowButton({ siteId, running, disabled }: { siteId: string; running: boolean; disabled?: string | null }) {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending || running || Boolean(disabled)}
      title={disabled ?? undefined}
      onClick={() =>
        start(async () => {
          const { error } = await checkNow(siteId);
          if (error) toast.error(error);
          else toast.success("Checking…");
        })
      }
    >
      {pending || running ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} {running ? "Checking…" : "Check now"}
    </Button>
  );
}
