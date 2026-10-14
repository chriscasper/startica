"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** A block of text to copy as a whole (corrected HTML, a suggested alt text, a snippet). */
export function CopyBlock({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`relative min-w-0 ${className ?? ""}`}>
      <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 pr-12 font-mono text-xs whitespace-pre-wrap">{text}</pre>
      <Button
        size="icon-sm"
        variant="outline"
        className="absolute top-2 right-2"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("Couldn't copy; select the text and copy it instead.");
          }
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}
