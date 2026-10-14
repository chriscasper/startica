"use client";

import { useRef, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// hint: a short line under the field. fileAccept (textarea): adds "Choose file…", which loads a text file into it.
export type Field =
  | { name: string; label: string; type: "text" | "url" | "password" | "date" | "number"; placeholder?: string; required?: boolean; hint?: ReactNode }
  | { name: string; label: string; type: "textarea"; placeholder?: string; rows?: number; hint?: ReactNode; fileAccept?: string }
  // One item per line; submitted as newline-separated text.
  | { name: string; label: string; type: "lines"; placeholder?: string; rows?: number }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[] }
  // Submitted as "on" when ticked; nothing when not. `required` blocks saving until ticked.
  | { name: string; label: string; type: "checkbox"; required?: boolean };

export type FieldValues = Record<string, string | string[] | null | undefined>;

export type ActionResult = { error: string | null };

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function initial(value: FieldValues[string]): string {
  if (Array.isArray(value)) return value.join("\n");
  return value ?? "";
}

export function FormDialog({
  trigger,
  title,
  description,
  fields,
  values = {},
  submitLabel = "Save",
  steps,
  footnote,
  action,
}: {
  trigger: ReactElement;
  title: string;
  description?: string;
  /** Numbered setup steps shown above the fields. */
  steps?: ReactNode[];
  /** A short note under the fields (e.g. how the value is stored). */
  footnote?: ReactNode;
  fields: Field[];
  values?: FieldValues;
  submitLabel?: string;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const { error } = await action(formData);
      if (error) {
        toast.error(error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <form action={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
            {steps && steps.length > 0 && (
              <ol className="grid gap-2 text-sm">
                {steps.map((step, i) => (
                  <li key={i} className="grid grid-cols-[1.5rem_1fr] items-baseline gap-1">
                    <span className="grid size-5 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums">{i + 1}</span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            )}
            {fields.map((field) =>
              field.type === "checkbox" ? (
                <label key={field.name} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    id={field.name}
                    name={field.name}
                    required={field.required}
                    defaultChecked={initial(values[field.name]) === "on"}
                    className="mt-0.5 size-4 accent-foreground"
                  />
                  <span>{field.label}</span>
                </label>
              ) : (
                <div key={field.name} className="grid gap-2">
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.type === "lines" && <span className="font-normal text-muted-foreground"> (one per line)</span>}
                  </Label>
                  {field.type === "select" ? (
                    <select id={field.name} name={field.name} defaultValue={initial(values[field.name])} className={selectClass}>
                      {field.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "textarea" && field.fileAccept ? (
                    <FileTextarea field={field} defaultValue={initial(values[field.name])} />
                  ) : field.type === "textarea" || field.type === "lines" ? (
                    <Textarea
                      id={field.name}
                      name={field.name}
                      rows={field.rows ?? (field.type === "lines" ? 4 : 3)}
                      placeholder={field.placeholder}
                      defaultValue={initial(values[field.name])}
                    />
                  ) : (
                    <Input
                      id={field.name}
                      name={field.name}
                      type={field.type}
                      required={field.required}
                      placeholder={field.placeholder}
                      defaultValue={initial(values[field.name])}
                    />
                  )}
                  {"hint" in field && field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                </div>
              ),
            )}
            {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A textarea that can also be filled from a file (e.g. a downloaded .json key), so nothing has to be copied by hand. */
function FileTextarea({ field, defaultValue }: { field: Extract<Field, { type: "textarea" }>; defaultValue: string }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => picker.current?.click()}>
          Choose file…
        </Button>
        <span className="truncate text-xs text-muted-foreground">{loaded ? `Loaded ${loaded}` : "or paste it below"}</span>
        <input
          ref={picker}
          type="file"
          accept={field.fileAccept}
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !area.current) return;
            area.current.value = await file.text();
            setLoaded(file.name);
            e.target.value = "";
          }}
        />
      </div>
      <Textarea ref={area} id={field.name} name={field.name} rows={field.rows ?? 3} placeholder={field.placeholder} defaultValue={defaultValue} className="font-mono text-xs" />
    </div>
  );
}
