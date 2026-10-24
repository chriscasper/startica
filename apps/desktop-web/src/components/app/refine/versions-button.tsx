"use client";

import { useState, useTransition } from "react";
import { HistoryIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import type { ChatSubjectKind } from "@startica/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { restoreSuggestionVersion } from "./actions";
import { revisionHeadline, RevisionView } from "./revision-view";

/** A version of a suggestion, in its revision's shape (`ChatSubject.toRevision`). */
export type VersionItem = { id: string; createdAt: string; source: "suggested" | "chat" | "edited"; current: boolean; revision: Record<string, unknown> };

const SOURCE_LABEL = { suggested: "Suggested", chat: "From a chat", edited: "Edited by you" } as const;

/** Every version of a suggestion, newest first, with Restore to show an earlier one again. */
export function VersionsButton({ kind, noun, versions }: { kind: ChatSubjectKind; noun: string; versions: VersionItem[] }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (versions.length < 2) return null;
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <HistoryIcon />
        Versions ({versions.length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Versions of the {noun}</DialogTitle>
            <DialogDescription>Each suggestion, your own edits and each revision you applied from a chat, newest first. Restore shows an earlier one again; nothing is deleted.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2 text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{new Date(v.createdAt).toLocaleString()}</span>
                  <Badge variant="outline">{SOURCE_LABEL[v.source]}</Badge>
                  {v.current && <Badge variant="secondary">Showing now</Badge>}
                  <span className="ml-auto flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setShown(shown === v.id ? null : v.id)}>
                      {shown === v.id ? "Hide" : "Show"}
                    </Button>
                    {!v.current && (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const { error } = await restoreSuggestionVersion(v.id);
                            if (error) toast.error(error);
                            else {
                              toast.success("Restored.");
                              setOpen(false);
                            }
                          })
                        }
                      >
                        {pending && <Loader2Icon className="animate-spin" />}
                        Restore
                      </Button>
                    )}
                  </span>
                </div>
                {shown === v.id ? <RevisionView kind={kind} value={v.revision} /> : <p className="text-muted-foreground">{revisionHeadline(kind, v.revision)}</p>}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
