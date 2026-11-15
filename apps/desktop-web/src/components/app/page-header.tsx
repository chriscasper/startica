import { Suspense } from "react";
import { PageIcon, pageIconChip } from "./page-icon";

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      {/* Reads the path, so it sits in its own Suspense: dynamic routes can still prerender. */}
      <Suspense fallback={<span className={pageIconChip} aria-hidden />}>
        <PageIcon />
      </Suspense>
      <div className="grid min-w-0 gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}
