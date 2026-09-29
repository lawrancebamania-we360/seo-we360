"use client";

// Blog Clusters (Ticket 2 UI): "New cluster" paste-import dialog. Paste the
// tab-separated block straight from Google Sheets/Excel (header row +
// data rows) under a cluster name - see lib/actions/blog-clusters.ts for
// the exact expected header set and parsing rules.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { importClusterPaste } from "@/lib/actions/blog-clusters";

export function NewClusterButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clusterName, setClusterName] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!clusterName.trim() || !pasted.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await importClusterPaste({ project_id: projectId, cluster_name: clusterName.trim(), pasted_text: pasted });
    setBusy(false);
    if (!r.ok || !r.clusterId) { setError(r.error ?? "Could not import that cluster."); return; }
    toast.success(`Imported ${r.itemsCreated ?? 0} post${(r.itemsCreated ?? 0) === 1 ? "" : "s"}${r.itemsSkipped ? ` (${r.itemsSkipped} row${r.itemsSkipped === 1 ? "" : "s"} skipped - missing a title)` : ""}.`);
    setOpen(false);
    setClusterName(""); setPasted("");
    router.push(`/dashboard/blog-clusters/${r.clusterId}`);
  };

  return (
    <>
      <Button size="sm" variant="brand" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> New cluster
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Paste a cluster from your planning sheet</DialogTitle>
            <DialogDescription>
              Select the header row + every data row in your sheet, copy, and paste below. Columns are matched by name, so order doesn't matter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="cluster-name">Cluster name</label>
              <Input id="cluster-name" value={clusterName} onChange={(e) => setClusterName(e.target.value)}
                placeholder="e.g. Workforce Analytics" maxLength={160} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="cluster-paste">Pasted rows</label>
              <textarea
                id="cluster-paste"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Content Title	Category	Blog Category	Funnel Stage	..."
                className="h-64 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-primary/40"
              />
            </div>
            {error && <p className="text-xs text-error-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="brand" onClick={submit} disabled={busy || !clusterName.trim() || !pasted.trim()} className="gap-1.5">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
