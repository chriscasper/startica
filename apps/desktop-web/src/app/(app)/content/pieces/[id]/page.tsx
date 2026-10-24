import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, eq } from "drizzle-orm";
import { DownloadIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { hasAiApiKey, taskModel } from "@startica/core/ai/client";
import { providerOf } from "@startica/core/ai/models";
import { imageEstimate, logoPath } from "@startica/core/ads/creatives";
import { TEMPLATE_LABEL } from "@startica/core/ads/templates";
import { contentPicturePath, imageSpec, listContentImages, type ContentImage } from "@startica/core/content/images";
import * as schema from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { channelLabel } from "@/lib/channels";
import { db, getWorkspace } from "@/lib/dal";
import { CopyImageButton, ImageButtons, NewImageButton, type ImageValues } from "../images-ui";

export const metadata: Metadata = { title: "Post images" };

export default function PieceImagesPage(props: PageProps<"/content/pieces/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PieceImages params={props.params} />
    </Suspense>
  );
}

const STATUS: Record<ContentImage["status"], string> = { idea: "Idea", generating: "Drawing", rendering: "Rendering", ready: "Ready", failed: "Failed" };
const fileUrl = (i: { id: string }, file: string, download = false) => `/content/images/${i.id}/${file}${download ? "?download" : ""}`;
const kb = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

async function PieceImages({ params }: { params: PageProps<"/content/pieces/[id]">["params"] }) {
  const { id } = await params;
  const workspace = await getWorkspace();
  const [piece] = /^[0-9a-f-]{36}$/i.test(id)
    ? await (await db()).select().from(schema.contentPieces).where(and(eq(schema.contentPieces.id, id), eq(schema.contentPieces.workspaceId, workspace.id)))
    : [];
  if (!piece) {
    return (
      <>
        <PageHeader title="Piece not found" />
        <Link href="/content?tab=library" className="text-sm underline">
          Back to the Library
        </Link>
      </>
    );
  }
  const ctx = { workspaceId: workspace.id };
  const [images, estimate, imageModel, openaiKey] = await Promise.all([listContentImages(piece.id), imageEstimate(ctx), taskModel(ctx, "image"), hasAiApiKey("openai")]);
  const canDraw = openaiKey && providerOf(imageModel.model) === "openai";
  const estimateText = `about $${estimate.usd.toFixed(2)} at ${estimate.quality} quality`;
  const spec = imageSpec(piece.channel);
  const logoUrl = logoPath(piece.productId) ? `/ads/logo/${piece.productId}` : null;
  const blank: ImageValues = {
    concept: "",
    headline: (piece.title ?? piece.topic).slice(0, 80),
    subline: "",
    template: "overlay",
    colors: { background: "#111827", text: "#ffffff", accent: "#f59e0b" },
    useLogo: Boolean(logoUrl),
    picture: null,
  };
  const dialog = { pieceId: piece.id, estimate: estimateText, canDraw, logoUrl };

  return (
    <>
      <LiveRefresh tables={["content_images", "content_pieces"]} />
      <PageHeader title={piece.title || piece.topic} description={`Images for this ${channelLabel(piece.channel)} post: the AI draws the picture, a template adds the words, in every size the channel shows.`} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/content?tab=library" className="underline-offset-4 hover:underline">
          ← Library
        </Link>
        {piece.plannedAt && (
          <Link href={`/content/calendar?focus=piece:${piece.id}`} className="underline-offset-4 hover:underline">
            On the calendar
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <NewImageButton {...dialog} values={blank} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sizes for {channelLabel(piece.channel)}</CardTitle>
          <CardDescription>
            {spec.sizes.map((s) => `${s.size} ${s.width}×${s.height} (${s.use})`).join(" · ")}. Kept under {kb(spec.maxBytes)} each.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 text-xs text-muted-foreground">
          <p>Post… fills in the text only: download or copy the image here and attach it in the site&apos;s own composer before you press its button.</p>
          <p>
            Pictures are drawn with {imageModel.model} on your OpenAI key ({canDraw ? estimateText : "no OpenAI key yet: upload a picture, or use words only"}), and count toward your monthly AI budget.
          </p>
        </CardContent>
      </Card>

      {images.length === 0 && <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No images yet for this post.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {images.map((i) => {
          const preview = i.renders.find((r) => r.size === "1:1") ?? i.renders[0];
          const hasPicture = Boolean(contentPicturePath(i));
          const busy = i.status === "generating" || i.status === "rendering";
          const overflow = i.renders.filter((r) => r.fit === "overflow").map((r) => r.size);
          const values: ImageValues = {
            id: i.id,
            concept: i.concept,
            headline: i.text.headline,
            subline: i.text.subline ?? "",
            template: i.template,
            colors: i.colors,
            useLogo: i.useLogo,
            picture: hasPicture && i.imageFile ? fileUrl(i, i.imageFile) : null,
          };
          return (
            <Card key={i.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {i.text.headline || "Untitled"}
                  <Badge variant={i.status === "failed" ? "destructive" : "outline"}>
                    {busy && <Loader2Icon className="animate-spin" aria-hidden />}
                    {STATUS[i.status]}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {TEMPLATE_LABEL[i.template].name} · {i.imageSource === "ai" ? "Drawn by AI" : i.imageSource === "upload" ? "Your picture" : "Words only"}
                  {i.costUsd > 0 && ` · $${i.costUsd.toFixed(2)}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {i.error && <p className="text-xs text-destructive">{i.error}</p>}
                {overflow.length > 0 && !busy && (
                  <p className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-300" role="status">
                    <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                    The words don&apos;t fit at {overflow.join(", ")}: shorten them or try another template.
                  </p>
                )}
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${fileUrl(i, preview.file)}?v=${i.updatedAt.getTime()}`} alt={`${i.text.headline}, ${preview.size}`} className="max-h-80 w-auto justify-self-start rounded-md border" />
                ) : (
                  <div className="grid aspect-square max-h-64 place-items-center rounded-md border border-dashed p-4 text-center text-xs" style={{ background: i.colors.background, color: i.colors.text }}>
                    {busy ? (i.status === "generating" ? "Drawing the picture…" : "Rendering…") : "No images yet"}
                  </div>
                )}
                {i.renders.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {i.renders.map((r) => (
                      <span key={r.file} className="flex items-center">
                        <Button size="sm" variant="outline" nativeButton={false} render={<a href={fileUrl(i, r.file, true)} download />}>
                          <DownloadIcon /> {r.size} <span className="text-muted-foreground">{kb(r.bytes)}</span>
                        </Button>
                        <CopyImageButton src={fileUrl(i, r.file)} label={`The ${r.size} image`} />
                      </span>
                    ))}
                  </div>
                )}
                {i.prompt && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Prompt sent to the image model</summary>
                    <pre className="mt-1 font-sans whitespace-pre-wrap">{i.prompt}</pre>
                  </details>
                )}
                <ImageButtons image={{ id: i.id, status: i.status, hasPicture, imageSource: i.imageSource }} dialog={{ ...dialog, values }} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
