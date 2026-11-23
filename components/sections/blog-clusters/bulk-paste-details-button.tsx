"use client";

// GC-7: bulk paste details into the cluster's existing posts. Same format as the
// cluster import / Export (header row + one row per post); rows match posts by
// title, else URL slug. Only non-empty cells are written; unmatched rows are listed.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardPaste, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { bulkPasteClusterDetails } from "@/lib/actions/blog-clusters";

export function BulkPasteDetailsButton({ projectId, clusterId }: { projectId: string; clusterId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  const close = () => { if (!saving) { setOpen(false); setText(""); setUnmatched([]); } };

  const save = async () => {
    if (saving || !text.trim()) return;
    setSaving(true);
    try {
      const r = await bulkPasteClusterDetails({ project_id: projectId, cluster_id: clusterId, pasted_text: text });
      if (!r.ok) { toast.error(r.error ?? "Could not paste the details."); return; }
      toast.success(`Updated ${r.updated} post${r.updated === 1 ? "" : "s"}.`);
      router.refresh();
      if (r.unmatched?.length) { setUnmatched(r.unmatched); return; } // keep the dialog open to show them
      close();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setOpen(true)}>
        <ClipboardPaste className="size-3.5" /> Bulk paste details
      </Button>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Bulk paste post details</DialogTitle>
            <DialogDescription>
              Copy rows from your planning sheet - the header row first, then one row per post (same columns as the cluster import and Export).
              Rows are matched to posts by Content Title, else URL Slug. Empty cells leave the saved value as it is.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={"Content Title\tPrimary Keyword\tSupporting Keyword 1\tVolume 1\tH2 Candidates\t..."} className="font-mono text-[12px]" />
          {unmatched.length > 0 && (
            <div className="rounded-md border border-warning-300 bg-warning-50/50 p-2.5 text-[12px] dark:bg-warning-500/10">
              <div className="font-semibold text-foreground">{unmatched.length} row{unmatched.length === 1 ? "" : "s"} didn&apos;t match a post - check the title or URL slug:</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">{unmatched.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close} disabled={saving}>{unmatched.length ? "Done" : "Cancel"}</Button>
            <Button type="button" variant="brand" onClick={save} disabled={saving || !text.trim()} className="gap-1.5">
              {saving && <Loader2 className="size-3.5 animate-spin" />} Update posts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
