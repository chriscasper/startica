"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enqueuePing } from "./actions";

export function RunPingButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const { error } = await enqueuePing();
          if (error) toast.error(error);
          else toast.success("Ping queued. The worker picks it up within a few seconds.");
        })
      }
    >
      {pending ? "Queuing…" : "Run test job"}
    </Button>
  );
}
