"use client";

// Ticket 1: "Add post" — add a single planned post to an existing cluster via
// the shared structured form (Title/meta/slug/primary keyword required, the rest
// optional). Appends to the end of the cluster.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ClusterPostForm, EMPTY_POST, isPostValid, toPostInput, type PostFormValues } from "@/components/sections/blog-clusters/cluster-post-form";
import { addClusterItem } from "@/lib/actions/blog-clusters";

export function AddClusterPostButton({ projectId, clusterId }: { projectId: string; clusterId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PostFormValues>(EMPTY_POST);
  const [saving, setSaving] = useState(false);

  const close = () => { if (!saving) { setOpen(false); setValues(EMPTY_POST); } };

  const save = async () => {
    if (saving || !isPostValid(values)) return;
    setSaving(true);
    try {
      const r = await addClusterItem({ project_id: projectId, cluster_id: clusterId, ...toPostInput(values) });
      if (!r.ok) { toast.error(r.error ?? "Could not add the post."); return; }
      toast.success("Post added to the cluster.");
      setOpen(false);
      setValues(EMPTY_POST);
      router.refresh();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Button type="button" variant="brand" size="sm" className="gap-1.5 shrink-0" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Add post
      </Button>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add a post</DialogTitle>
            <DialogDescription>Title, meta, URL and primary keyword are required. Everything else is optional.</DialogDescription>
          </DialogHeader>
          <ClusterPostForm values={values} onChange={setValues} idPrefix="addpost" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
            <Button type="button" variant="brand" onClick={save} disabled={saving || !isPostValid(values)} className="gap-1.5">
              {saving && <Loader2 className="size-3.5 animate-spin" />} Add post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
