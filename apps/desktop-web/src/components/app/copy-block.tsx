"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * A block of text to copy as a whole (corrected HTML, a suggested alt text, a snippet).
 * `document`: a long text shown in full (a fix plan), with the copy button showing on hover or focus.
 */
export function CopyBlock({ text, label, className, document = false }: { text: string; label: string; className?: string; document?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`group relative min-w-0 ${className ?? ""}`}>
      <pre className={`overflow-auto rounded-md bg-muted font-mono text-xs whitespace-pre-wrap ${document ? "p-4 pr-14 leading-relaxed" : "max-h-96 p-3 pr-12"}`}>{text}</pre>
      <Button
        size="icon-sm"
        variant="outline"
        // A document's button shows on hover or keyboard focus, and stays while it says "copied".
        className={`absolute top-2 right-2 ${document && !copied ? "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" : ""}`}
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

