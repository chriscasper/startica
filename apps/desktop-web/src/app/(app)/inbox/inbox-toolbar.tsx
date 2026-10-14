"use client";

import { useTransition } from "react";
import { LinkIcon, Loader2Icon, RadarIcon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog } from "@/components/app/form-dialog";
import { refreshScanActivity, StopButton, useScanActivity } from "@/components/app/scan-activity";
import { Button } from "@/components/ui/button";
import { importLink, scanNow } from "./actions";
import { ScoringDialog, type ScoringSettings } from "./scoring-dialog";

export function InboxToolbar({ productId, scoring }: { productId: string; scoring: ScoringSettings }) {
  const [pending, startTransition] = useTransition();
  const { scan } = useScanActivity(productId);
  const scanning = pending || Boolean(scan);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={scanning}
        onClick={() =>
          startTransition(async () => {
            const { error } = await scanNow(productId);
            refreshScanActivity();
            if (error) toast.error(error);
            else toast.success("Scan started. Reddit allows about one request a minute, so a full scan can take up to 15 minutes; follow it at the top of the window, and results appear here as they're scored.");
          })
        }
      >
        {scanning ? <Loader2Icon className="animate-spin" /> : <RadarIcon />}
        {scan && !scan.running ? "Scan queued" : scanning ? "Scanning…" : "Scan now"}
      </Button>
      {scan && <StopButton target={{ job: scan.jobId }} label="Stop scan" />}
      <ScoringDialog key={`${scoring.relevance}-${scoring.intent}`} productId={productId} settings={scoring} />
      <FormDialog
        trigger={
          <Button size="sm">
            <LinkIcon />
            Paste a link
          </Button>
        }
        title="Reply to a conversation"
        description="Paste a link to any post. Reddit, Hacker News, Bluesky, Mastodon and Discourse links are read automatically (Reddit can take up to a minute), and X links too with an X API token. For LinkedIn, Facebook and other sites, paste the post's text as well."
        fields={[
          { name: "url", label: "Link", type: "url", required: true, placeholder: "https://" },
          { name: "text", label: "Post text", type: "textarea", rows: 6, placeholder: "Optional for links Startica can read" },
          { name: "community", label: "Community (optional)", type: "text", placeholder: "e.g. startups for r/startups" },
        ]}
        submitLabel="Draft a reply"
        action={(fd) => importLink(productId, fd)}
      />
    </div>
  );
}
