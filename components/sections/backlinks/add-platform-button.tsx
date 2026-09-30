"use client";

// Backlinks (Ticket 14): companion to NewSubmissionsButton - adds a platform
// with zero submissions so the team's standing list can grow without a
// submissions-paste to back it. One name per line; no header row needed.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { addBacklinkWebsites } from "@/lib/actions/backlinks";

export function AddPlatformButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!names.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await addBacklinkWebsites({ project_id: projectId, names });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not add those platforms."); return; }
    const skippedNote = r.websitesSkipped ? ` (${r.websitesSkipped} already on the list or blank)` : "";
    toast.success(`Added ${r.websitesCreated ?? 0} platform${(r.websitesCreated ?? 0) === 1 ? "" : "s"}${skippedNote}.`);
    setOpen(false);
    setNames("");
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <ListPlus className="size-3.5" /> Add platform
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Add a platform</DialogTitle>
            <DialogDescription>
              One name per line - a plain name is fine (e.g. &quot;Substack&quot;), no need for a URL. Each shows up as a row with 0 submissions until you log activity against it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <textarea
              value={names}
              onChange={(e) => setNames(e.target.value)}
              placeholder={"Substack\nMedium\nQuora"}
              className="h-40 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-primary/40"
            />
            {error && <p className="text-xs text-error-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="brand" onClick={submit} disabled={busy || !names.trim()} className="gap-1.5">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ListPlus className="size-3.5" />} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
