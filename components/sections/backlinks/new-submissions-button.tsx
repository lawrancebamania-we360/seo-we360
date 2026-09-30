"use client";

// Backlinks (Ticket 5): paste-import dialog, same shape as Blog Clusters'
// NewClusterButton - paste the tab-separated block straight from your
// tracking sheet (header row + data rows); see lib/actions/backlinks.ts for
// the exact expected headers and matching rules.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { importBacklinksPaste } from "@/lib/actions/backlinks";

export function NewSubmissionsButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!pasted.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await importBacklinksPaste({ project_id: projectId, pasted_text: pasted });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not import that batch."); return; }
    const skippedNote = r.itemsSkipped ? ` (${r.itemsSkipped} row${r.itemsSkipped === 1 ? "" : "s"} skipped)` : "";
    const websitesNote = r.websitesCreated ? ` across ${r.websitesCreated} new website${r.websitesCreated === 1 ? "" : "s"}` : "";
    toast.success(`Imported ${r.itemsCreated ?? 0} submission${(r.itemsCreated ?? 0) === 1 ? "" : "s"}${websitesNote}${skippedNote}.`);
    setOpen(false);
    setPasted("");
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="brand" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> New submissions
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Paste submissions from your tracking sheet</DialogTitle>
            <DialogDescription>
              Select the header row + every data row in your sheet, copy, and paste below. Columns are matched by name, so order doesn&apos;t matter. Expected columns: Website, Submission Date, Submission Link, Blog Post, Topic.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"Website\tSubmission Date\tSubmission Link\tBlog Post\tTopic"}
              className="h-64 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-primary/40"
            />
            {error && <p className="text-xs text-error-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="brand" onClick={submit} disabled={busy || !pasted.trim()} className="gap-1.5">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
