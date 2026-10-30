"use client";

// Blog Clusters: "New cluster" dialog with two ways in —
//   • Paste: a tab-separated block straight from Google Sheets/Excel (header +
//     rows); see lib/actions/blog-clusters.ts for the header set + parsing.
//   • Build manually: no spreadsheet — name the cluster and add its first post
//     with the shared structured form (Title/meta/slug/primary keyword required).
// Either way the cluster persists on the dashboard and opens on success.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { importClusterPaste, createClusterManual } from "@/lib/actions/blog-clusters";
import { ClusterPostForm, EMPTY_POST, isPostValid, toPostInput, type PostFormValues } from "@/components/sections/blog-clusters/cluster-post-form";
import { CLUSTER_KIND_LABEL, CLUSTER_KINDS, type ClusterKind } from "@/lib/content-pipeline/content-type";

export function NewClusterButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"paste" | "manual">("paste");
  const [clusterName, setClusterName] = useState("");
  const [kind, setKind] = useState<ClusterKind>("blog");
  const [pasted, setPasted] = useState("");
  const [post, setPost] = useState<PostFormValues>(EMPTY_POST);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setClusterName(""); setPasted(""); setPost(EMPTY_POST); setKind("blog"); setMode("paste"); setError(null); };
  const canSubmit = clusterName.trim() !== "" && (mode === "paste" ? pasted.trim() !== "" : isPostValid(post));

  const submit = async () => {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "paste") {
        const r = await importClusterPaste({ project_id: projectId, cluster_name: clusterName.trim(), pasted_text: pasted, kind });
        if (!r.ok || !r.clusterId) { setError(r.error ?? "Could not import that cluster."); return; }
        toast.success(`Imported ${r.itemsCreated ?? 0} post${(r.itemsCreated ?? 0) === 1 ? "" : "s"}${r.itemsSkipped ? ` (${r.itemsSkipped} row${r.itemsSkipped === 1 ? "" : "s"} skipped - missing a title)` : ""}.`);
        setOpen(false); reset();
        router.push(`/dashboard/blog-clusters/${r.clusterId}`);
      } else {
        const r = await createClusterManual({ project_id: projectId, cluster_name: clusterName.trim(), kind, ...toPostInput(post) });
        if (!r.ok || !r.clusterId) { setError(r.error ?? "Could not create the cluster."); return; }
        toast.success("Cluster created.");
        setOpen(false); reset();
        router.push(`/dashboard/blog-clusters/${r.clusterId}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="brand" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> New cluster
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (busy) return; setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>New cluster</DialogTitle>
            <DialogDescription>
              Paste a block from your planning sheet, or build one by hand with its first post.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="cluster-name">Cluster name</label>
                <Input id="cluster-name" value={clusterName} onChange={(e) => setClusterName(e.target.value)}
                  placeholder="e.g. Workforce Analytics" maxLength={160} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="cluster-kind">Type</label>
                <Combobox
                  id="cluster-kind"
                  items={CLUSTER_KINDS.map((k) => ({ value: k, label: CLUSTER_KIND_LABEL[k] }))}
                  value={kind}
                  onValueChange={(v) => setKind(v as ClusterKind)}
                  className="w-full"
                />
              </div>
            </div>

            <Tabs value={mode} onValueChange={(v) => { setMode(v as "paste" | "manual"); setError(null); }}>
              <TabsList className="w-full">
                <TabsTrigger value="paste" className="flex-1">Paste</TabsTrigger>
                <TabsTrigger value="manual" className="flex-1">Build manually</TabsTrigger>
              </TabsList>
              <TabsContent value="paste" className="mt-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="cluster-paste">Pasted rows</label>
                <textarea
                  id="cluster-paste"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="Content Title	Category	Blog Category	Funnel Stage	..."
                  className="h-64 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-primary/40"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Select the header row + every data row in your sheet and paste. Columns are matched by name, so order doesn&apos;t matter.</p>
              </TabsContent>
              <TabsContent value="manual" className="mt-3">
                <ClusterPostForm values={post} onChange={setPost} idPrefix="newcluster" />
              </TabsContent>
            </Tabs>

            {error && <p className="text-xs text-error-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={busy}>Cancel</Button>
            <Button variant="brand" onClick={submit} disabled={busy || !canSubmit} className="gap-1.5">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} {mode === "paste" ? "Import" : "Create cluster"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
