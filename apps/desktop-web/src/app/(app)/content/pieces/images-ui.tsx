"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { CopyIcon, PencilIcon, PlusIcon, RefreshCwIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { TEMPLATE_LABEL } from "@startica/core/ads/templates";
import type { AdCreativeColors, AdTemplate } from "@startica/db/schema";
import { TemplatePreview, useDataUrl } from "@/components/app/template-preview";
import type { ActionResult } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { newContentImage, removeContentImage, renderContentImageAgain, saveContentImage, stopContentImageWork } from "./actions";

export type ImageValues = {
  id?: string;
  concept: string;
  headline: string;
  subline: string;
  template: AdTemplate;
  colors: AdCreativeColors;
  useLogo: boolean;
  picture: string | null;
};

const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>, ok?: string) =>
    startTransition(async () => {
      const { error } = await fn();
      if (error) toast.error(error);
      else if (ok) toast.success(ok);
    });
  return [pending, run] as const;
}

/** New or edit: the AI draws the picture (or you upload one, or none), the template adds the words. */
export function ImageDialog({ pieceId, trigger, values, estimate, canDraw, logoUrl }: { pieceId: string; trigger: ReactElement; values: ImageValues; estimate: string; canDraw: boolean; logoUrl: string | null }) {
  const editing = Boolean(values.id);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [source, setSource] = useState<string>(editing && values.picture ? "keep" : canDraw ? "ai" : "upload");
  const [headline, setHeadline] = useState(values.headline);
  const [subline, setSubline] = useState(values.subline);
  const [template, setTemplate] = useState(values.template);
  const [colors, setColors] = useState(values.colors);
  const [useLogo, setUseLogo] = useState(values.useLogo);
  const [upload, setUpload] = useState<File | null>(null);
  const uploadData = useDataUrl(open ? upload : null);
  const currentData = useDataUrl(open && source === "keep" ? values.picture : null);
  const logoData = useDataUrl(open && useLogo ? logoUrl : null);
  const picture = source === "upload" ? uploadData : source === "keep" ? currentData : null;

  function submit(formData: FormData) {
    startTransition(async () => {
      const { error } = await (editing ? saveContentImage(values.id!, formData) : newContentImage(pieceId, formData));
      if (error) return void toast.error(error);
      setOpen(false);
      toast.success(formData.get("image_source") === "ai" ? "Drawing the picture: about a minute" : "Rendering every size");
    });
  }
  const colorField = (key: keyof AdCreativeColors, name: string, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="color" name={name} value={colors[key]} onChange={(e) => setColors({ ...colors, [key]: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent" />
      {label}
    </label>
  );
  const radio = (value: string, label: ReactNode, disabled = false) => (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "text-muted-foreground" : ""}`}>
      <input type="radio" name="image_source" value={value} disabled={disabled} checked={source === value} onChange={() => setSource(value)} /> {label}
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-3xl">
        <form action={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit image" : "New image"}</DialogTitle>
            <DialogDescription>The AI draws the picture (or you upload one); the template adds your words, in every size this channel shows.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-5 overflow-y-auto pr-1 md:grid-cols-[1fr_240px]">
            <div className="grid content-start gap-4">
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Picture</legend>
                {editing && values.picture && radio("keep", "Keep the current picture")}
                {radio("ai", <>Draw it with AI <span className="text-muted-foreground">({canDraw ? estimate : "needs an OpenAI key in Settings"})</span></>, !canDraw)}
                {radio("upload", "Upload my own")}
                {radio("none", "No picture, just the words")}
              </fieldset>
              {source === "ai" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="i-concept">What the picture shows</Label>
                  <Textarea id="i-concept" name="concept" rows={3} defaultValue={values.concept} placeholder="e.g. A field notebook and a rugged tablet on a mossy rock by a stream, overcast light" />
                  <p className="text-xs text-muted-foreground">Describe the scene, not the words: no text, logos, other brands or real people.</p>
                </div>
              ) : (
                <input type="hidden" name="concept" value={values.concept} />
              )}
              {source === "upload" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="i-image">Image (PNG, JPEG or WebP, up to 20 MB)</Label>
                  <Input id="i-image" name="image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setUpload(e.target.files?.[0] ?? null)} />
                  <p className="text-xs text-muted-foreground">Square or larger works best: each size crops from the middle. Only use images you have the rights to.</p>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="i-headline">Words on the image</Label>
                <Input id="i-headline" name="headline" maxLength={80} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Field notes that survive the rain" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="i-subline">Supporting line (optional)</Label>
                <Input id="i-subline" name="subline" maxLength={140} value={subline} onChange={(e) => setSubline(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="i-template">Template</Label>
                <select id="i-template" name="template" value={template} onChange={(e) => setTemplate(e.target.value as AdTemplate)} className={selectClass}>
                  {Object.entries(TEMPLATE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.name}: {v.description}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-4">
                {colorField("background", "background", "Background")}
                {colorField("text", "text_color", "Words")}
                {colorField("accent", "accent", "Accent")}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="use_logo" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} className="size-4 accent-foreground" />
                Add the logo {logoUrl ? "" : <span className="text-muted-foreground">(upload one under Ads → Creatives → Logo)</span>}
              </label>
            </div>
            <div className="grid content-start gap-2">
              <TemplatePreview values={{ template, colors, text: { headline, subline: subline || undefined } }} picture={picture} logo={useLogo ? logoData : null} />
              <p className="text-xs text-muted-foreground">{source === "ai" ? "The picture appears after it's drawn." : "Square preview; every size is rendered when you save."}</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : source === "ai" ? "Draw and render" : "Render"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewImageButton(props: Omit<Parameters<typeof ImageDialog>[0], "trigger">) {
  return (
    <ImageDialog
      {...props}
      trigger={
        <Button>
          <PlusIcon /> New image
        </Button>
      }
    />
  );
}

export function ImageButtons({ image, dialog }: { image: { id: string; status: string; hasPicture: boolean; imageSource: string }; dialog: Omit<Parameters<typeof ImageDialog>[0], "trigger"> }) {
  const [pending, run] = useAction();
  if (image.status === "generating" || image.status === "rendering")
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => stopContentImageWork(image.id))}>
        <SquareIcon /> Stop
      </Button>
    );
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ImageDialog
        {...dialog}
        trigger={
          <Button size="sm" variant="outline">
            <PencilIcon /> Edit
          </Button>
        }
      />
      {(image.hasPicture || image.imageSource === "none") && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => renderContentImageAgain(image.id), "Rendering again")} aria-label="Render again">
          <RefreshCwIcon />
        </Button>
      )}
      <Button size="sm" variant="ghost" aria-label="Delete image" disabled={pending} onClick={() => confirm("Delete this image?") && run(() => removeContentImage(image.id))}>
        <Trash2Icon />
      </Button>
    </div>
  );
}

/** Copies a rendered size to the clipboard (as PNG, which every browser's clipboard takes), to paste into the post. */
export function CopyImageButton({ src, label }: { src: string; label: string }) {
  async function copy() {
    try {
      const blob = await (await fetch(src)).blob();
      const png =
        blob.type === "image/png"
          ? blob
          : await new Promise<Blob>((resolve, reject) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext("2d")!.drawImage(img, 0, 0);
                canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png");
              };
              img.onerror = reject;
              img.src = URL.createObjectURL(blob);
            });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      toast.success(`${label} copied: paste it into the post`);
    } catch {
      toast.error("Couldn't copy the image; download it instead");
    }
  }
  return (
    <Button size="sm" variant="ghost" onClick={copy} aria-label={`Copy ${label}`}>
      <CopyIcon />
    </Button>
  );
}
