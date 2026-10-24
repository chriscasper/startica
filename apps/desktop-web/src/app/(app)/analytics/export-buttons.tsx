"use client";

import { useTransition } from "react";
import { DownloadIcon, FileTextIcon, PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { saveAnalyticsPdf } from "./export-actions";

/** Export the selected period: Markdown, a printable page, or (desktop app) a PDF. No AI involved. */
export function ExportButtons({ productId, range, pdf }: { productId: string; range: number; pdf: boolean }) {
  const [pending, start] = useTransition();
  const q = `product=${productId}&range=${range}`;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Export this period">
      <a href={`/analytics/report/download?${q}`} download className={buttonVariants({ size: "sm", variant: "outline" })}>
        <DownloadIcon />
        Markdown
      </a>
      <a href={`/analytics/report/print?${q}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
        <PrinterIcon />
        Printable page
      </a>
      {pdf && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const { error } = await saveAnalyticsPdf(productId, range);
              if (error) toast.error(error);
              else toast.success("Choose where to save the PDF.");
            })
          }
        >
          <FileTextIcon />
          Save as PDF
        </Button>
      )}
    </div>
  );
}
