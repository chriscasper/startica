"use client";

import { useRef, useState, useTransition, type ReactElement } from "react";
import { ImageIcon, Loader2Icon, PencilIcon, PlusIcon, RefreshCwIcon, SparklesIcon, SquareIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { TEMPLATE_LABEL } from "@startica/core/ads/templates";
import { TemplatePreview as Preview, useDataUrl } from "@/components/app/template-preview";
import type { AdCreativeColors, AdCreativeText, AdTemplate } from "@startica/db/schema";
import type { ActionResult } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteLogo, drawAgain, newCreative, removeCreative, renderAgain, saveCreative, stopCreativeWork, suggestIdeas, uploadLogo } from "./actions";

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

const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export type CreativeValues = {
  id?: string;
  concept: string;
  text: AdCreativeText;
  template: AdTemplate;
  colors: AdCreativeColors;
  adId: string | null;
  useLogo: boolean;
  /** The current picture's URL, if it has one. */
  picture: string | null;
};

const BLANK: CreativeValues = {
  concept: "",
  text: { headline: "" },
  template: "overlay",
  colors: { background: "#111827", text: "#ffffff", accent: "#f59e0b" },
  adId: null,
  useLogo: true,
  picture: null,
};

export function CreativeDialog({
  campaignId,
  trigger,
  values = BLANK,
  ads,
  estimate,
  canDraw,
  logoUrl,
}: {
  campaignId: string;
  trigger: ReactElement;
  values?: CreativeValues;
  ads: { id: string; label: string }[];
  estimate: string;
  canDraw: boolean;
  logoUrl: string | null;
}) {
  const editing = Boolean(values.id);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [source, setSource] = useState<string>(editing && values.picture ? "keep" : canDraw ? "ai" : "upload");
  const [text, setText] = useState(values.text);
  const [template, setTemplate] = useState(values.template);
  const [colors, setColors] = useState(values.colors);
  const [useLogo, setUseLogo] = useState(values.useLogo);
  const [upload, setUpload] = useState<File | null>(null);
  // The preview shows the picture the ad will use: the upload, the current one, or none.
  const uploadData = useDataUrl(open ? upload : null);
  const currentData = useDataUrl(open && source === "keep" ? values.picture : null);
  const logoData = useDataUrl(open && useLogo ? logoUrl : null);
  const picture = source === "upload" ? uploadData : source === "keep" ? currentData : null;

  function submit(formData: FormData) {
    startTransition(async () => {
      const { error } = await (editing ? saveCreative(values.id!, formData) : newCreative(campaignId, formData));
      if (error) return void toast.error(error);
      setOpen(false);
      toast.success(formData.get("image_source") === "ai" ? "Drawing the picture: about a minute" : "Rendering every size");
    });
  }

  const textField = (name: keyof AdCreativeText, label: string, max: number, placeholder: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`c-${name}`}>{label}</Label>
      <Input id={`c-${name}`} name={name} maxLength={max} placeholder={placeholder} value={text[name] ?? ""} onChange={(e) => setText({ ...text, [name]: e.target.value })} />
    </div>
  );
  const colorField = (key: keyof AdCreativeColors, name: string, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="color" name={name} value={colors[key]} onChange={(e) => setColors({ ...colors, [key]: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent" />
      {label}
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-3xl">
        <form action={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit creative" : "New creative"}</DialogTitle>
            <DialogDescription>The AI draws the picture (or you upload one); the template adds your words, logo and button, in every size the platform takes.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-5 overflow-y-auto pr-1 md:grid-cols-[1fr_240px]">
            <div className="grid content-start gap-4">
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Picture</legend>
                {editing && values.picture && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="image_source" value="keep" checked={source === "keep"} onChange={() => setSource("keep")} /> Keep the current picture
                  </label>
                )}
                <label className={`flex items-center gap-2 text-sm ${canDraw ? "" : "text-muted-foreground"}`}>
                  <input type="radio" name="image_source" value="ai" disabled={!canDraw} checked={source === "ai"} onChange={() => setSource("ai")} />
                  {editing && values.picture ? "Draw a new one with AI" : "Draw it with AI"} <span className="text-muted-foreground">({canDraw ? estimate : "needs an OpenAI key in Settings"})</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="image_source" value="upload" checked={source === "upload"} onChange={() => setSource("upload")} /> Upload my own
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="image_source" value="none" checked={source === "none"} onChange={() => setSource("none")} /> No picture, just the words
                </label>
              </fieldset>
              {source === "ai" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="c-concept">What the picture shows</Label>
                  <Textarea id="c-concept" name="concept" rows={3} defaultValue={values.concept} placeholder="e.g. A field researcher's notebook and coffee on a sunlit wooden table, soft morning light" />
                  <p className="text-xs text-muted-foreground">Describe the scene, not the words: no text, logos, other brands or real people (the prompt asks the model to leave them out).</p>
                </div>
              )}
              {source !== "ai" && <input type="hidden" name="concept" value={values.concept} />}
              {source === "upload" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="c-image">Image (PNG, JPEG or WebP, up to 20 MB)</Label>
                  <Input
                    id="c-image"
                    name="image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => setUpload(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">Square or larger works best: each size crops from the middle. Only use images you have the rights to.</p>
                </div>
              )}
              {textField("headline", "Headline", 80, "e.g. Notes that write themselves")}
              {textField("subline", "Supporting line (optional)", 140, "e.g. Turn interviews into searchable notes")}
              <div className="grid grid-cols-2 gap-3">
                {textField("cta", "Button (optional)", 24, "e.g. Try it free")}
                {textField("price", "Price or offer (optional)", 24, "e.g. $9/mo")}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="c-template">Template</Label>
                <select id="c-template" name="template" value={template} onChange={(e) => setTemplate(e.target.value as AdTemplate)} className={selectClass}>
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
                {colorField("accent", "accent", "Button")}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="use_logo" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} className="size-4 accent-foreground" />
                Add the logo {logoUrl ? "" : <span className="text-muted-foreground">(upload one first, under Logo)</span>}
              </label>
              {ads.length > 0 && (
                <div className="grid gap-1.5">
                  <Label htmlFor="c-ad">For ad (optional)</Label>
                  <select id="c-ad" name="ad_id" defaultValue={values.adId ?? ""} className={selectClass}>
                    <option value="">The whole campaign</option>
                    {ads.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Preview values={{ text, template, colors }} picture={picture} logo={useLogo ? logoData : null} />
              <p className="text-xs text-muted-foreground">
                {source === "ai" ? "The picture appears after it's drawn." : "Square preview; every size is rendered when you save."}
              </p>
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

export function NewCreativeButton(props: Omit<Parameters<typeof CreativeDialog>[0], "trigger" | "values">) {
  return (
    <CreativeDialog
      {...props}
      trigger={
        <Button>
          <PlusIcon /> New creative
        </Button>
      }
    />
  );
}

export function SuggestIdeasButton({ campaignId, busy, disabled }: { campaignId: string; busy: boolean; disabled?: boolean }) {
  const [pending, run] = useAction();
  return (
    <Button variant="outline" disabled={pending || busy || disabled} onClick={() => run(() => suggestIdeas(campaignId), "Thinking up three ideas")}>
      {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} {busy ? "Suggesting…" : "Suggest ideas"}
    </Button>
  );
}

export function CreativeButtons({
  creative,
  dialog,
  estimate,
  canDraw,
}: {
  creative: { id: string; status: string; concept: string; hasPicture: boolean; imageSource: string };
  dialog: Omit<Parameters<typeof CreativeDialog>[0], "trigger">;
  estimate: string;
  canDraw: boolean;
}) {
  const [pending, run] = useAction();
  const busy = creative.status === "generating" || creative.status === "rendering";
  if (busy)
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => stopCreativeWork(creative.id))}>
        <SquareIcon /> Stop
      </Button>
    );
  return (
    <div className="flex flex-wrap items-center gap-1">
      {creative.status === "idea" ? (
        <>
          <Button size="sm" disabled={pending || !canDraw} onClick={() => run(() => drawAgain(creative.id), "Drawing the picture")} title={canDraw ? undefined : "Needs an OpenAI key in Settings"}>
            <ImageIcon /> Draw it ({estimate})
          </Button>
          <CreativeDialog
            {...dialog}
            trigger={
              <Button size="sm" variant="outline">
                <PencilIcon /> Edit or upload
              </Button>
            }
          />
        </>
      ) : (
        <>
          <CreativeDialog
            {...dialog}
            trigger={
              <Button size="sm" variant="outline">
                <PencilIcon /> Edit
              </Button>
            }
          />
          {creative.imageSource === "ai" && canDraw && creative.concept && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => confirm(`Draw a new picture? It costs ${estimate}.`) && run(() => drawAgain(creative.id), "Drawing a new picture")}>
              <SparklesIcon /> Draw again
            </Button>
          )}
          {(creative.hasPicture || creative.imageSource === "none") && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => renderAgain(creative.id), "Rendering again")} aria-label="Render again">
              <RefreshCwIcon />
            </Button>
          )}
        </>
      )}
      <Button size="sm" variant="ghost" aria-label="Delete creative" disabled={pending} onClick={() => confirm("Delete this creative and its images?") && run(() => removeCreative(creative.id))}>
        <Trash2Icon />
      </Button>
    </div>
  );
}

export function LogoControls({ campaignId, logoUrl }: { campaignId: string; logoUrl: string | null }) {
  const [pending, run] = useAction();
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="Your logo" className="h-8 max-w-32 rounded border bg-muted object-contain p-1" />
      ) : (
        <span className="text-muted-foreground">No logo yet</span>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => picker.current?.click()}>
        <UploadIcon /> {logoUrl ? "Replace logo" : "Upload logo"}
      </Button>
      {logoUrl && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteLogo(campaignId))}>
          Remove
        </Button>
      )}
      <input
        ref={picker}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.set("logo", file);
          run(() => uploadLogo(campaignId, fd), "Logo saved: render a creative again to use it");
          e.target.value = "";
        }}
      />
    </div>
  );
}
