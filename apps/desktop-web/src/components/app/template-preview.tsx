"use client";

import { useEffect, useMemo, useState } from "react";
import { templateHtml } from "@startica/core/ads/templates";
import type { AdCreativeColors, AdCreativeText, AdTemplate } from "@startica/db/schema";

/** An image as a data: URL, so the sandboxed preview can show it without the app's session. */
export function useDataUrl(src: string | Blob | null): string | null {
  const [data, setData] = useState<{ src: string | Blob; url: string } | null>(null);
  useEffect(() => {
    if (!src) return;
    let live = true;
    (async () => {
      const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
      const reader = new FileReader();
      reader.onload = () => live && typeof reader.result === "string" && setData({ src, url: reader.result });
      reader.readAsDataURL(blob);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [src]);
  return src && data?.src === src ? data.url : null;
}

/**
 * A template (ads/templates.ts) drawn live in a sandboxed frame while editing, at 1080×1080 scaled
 * down. Shared by ad creatives and Content Studio post images.
 */
export function TemplatePreview({
  values,
  picture,
  logo,
}: {
  values: { template: AdTemplate; text: AdCreativeText; colors: AdCreativeColors };
  picture: string | null;
  logo: string | null;
}) {
  const size = { width: 1080, height: 1080 };
  const html = useMemo(
    () => templateHtml({ template: values.template, width: size.width, height: size.height, text: values.text, colors: values.colors, image: picture, logo }),
    [values, picture, logo, size.width, size.height],
  );
  const box = 240;
  return (
    <div className="overflow-hidden rounded-md border" style={{ width: box, height: box }} aria-label="Preview">
      <iframe
        title="Image preview"
        sandbox="allow-scripts"
        srcDoc={html}
        style={{ width: size.width, height: size.height, transform: `scale(${box / size.width})`, transformOrigin: "0 0", border: 0, pointerEvents: "none" }}
      />
    </div>
  );
}
