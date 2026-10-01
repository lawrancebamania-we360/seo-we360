"use client";

// Blog Clusters: delete the whole cluster - same confirm-dialog shape as
// TaskDetailDialog's "Delete this task?" (rose trash icon, explicit
// consequence line, destructive button). Items cascade-delete with it;
// any row already promoted to a real Sprint task keeps that task untouched.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { deleteBlogCluster } from "@/lib/actions/blog-clusters";

export function DeleteClusterButton({ projectId, clusterId, clusterName }: { projectId: string; clusterId: string; clusterName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const doDelete = () => {
    start(async () => {
      const r = await deleteBlogCluster({ project_id: projectId, cluster_id: clusterId });
      if (!r.ok) { toast.error(r.error ?? "Could not delete this cluster."); return; }
      toast.success(`"${clusterName}" deleted.`);
      setOpen(false);
      router.push("/dashboard/blog-clusters");
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" /> Delete cluster
      </Button>
      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                <Trash2 className="size-4" />
              </div>
              Delete this cluster?
            </DialogTitle>
            <DialogDescription>
              This removes &quot;{clusterName}&quot; and every planned row in it permanently. Rows already assigned to a writer keep their Sprint task - only this plan goes away.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={doDelete} disabled={pending} className="bg-rose-600 hover:bg-rose-700 text-white">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete cluster
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
