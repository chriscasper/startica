"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { leaveDemo } from "@/lib/setup-actions";

/** Shown on every page in demo mode: the sample product, in its own data folder. */
export function DemoBanner() {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted px-4 py-2 text-sm">
      <span>
        <span className="font-medium">Demo:</span> you&apos;re looking at Fieldnote, a sample product. Scans, AI and posting are off, and your own data is
        untouched.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="ml-auto"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const { error } = await leaveDemo();
            if (error) toast.error(error);
            else toast.success("Leaving the demo: Startica restarts with your own data.");
          })
        }
      >
        Leave demo
      </Button>
    </div>
  );
}
