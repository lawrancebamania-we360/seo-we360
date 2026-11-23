"use client";

// GC-7: "Add details" on a post - the same structured form as Add post,
// prefilled with the post's current brief, saved in place.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ClusterPostForm, isPostValid, toPostInput, type PostFormValues } from "@/components/sections/blog-clusters/cluster-post-form";
import { updateClusterItem } from "@/lib/actions/blog-clusters";
import type { BlogClusterItemRow } from "@/lib/data/blog-clusters";

function valuesFromItem(it: BlogClusterItemRow): PostFormValues {
  return {
    title: it.title,
    metaDescription: it.metaDescription ?? "",
    urlSlug: it.urlSlug ?? "",
    primaryKeyword: it.targetKeyword ?? "",
    supportingKeywords: it.supportingKeywords.map((s) => (s.volume != null ? `${s.keyword}, ${s.volume}` : s.keyword)).join("\n"),
    category: it.category ?? "",
    funnelStage: it.funnelStage ?? "",
    contentType: it.contentType ?? "",
    volMo: it.volMo != null ? String(it.volMo) : "",
    serpVerdict: it.serpVerdict ?? "",
    h2: it.outline.join("\n"),
    faq: it.faqCandidates.join("\n"),
    interlinksTo: it.interlinksTo.join("\n"),
    interlinksFrom: it.interlinksFrom.join("\n"),
    primaryCta: it.primaryCta ?? "",
  };
}

export function ClusterItemDetailsButton({ projectId, item }: { projectId: string; item: BlogClusterItemRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PostFormValues>(() => valuesFromItem(item));
  const [saving, setSaving] = useState(false);

  const openDialog = () => { setValues(valuesFromItem(item)); setOpen(true); };
  const close = () => { if (!saving) setOpen(false); };

  const save = async () => {
    if (saving || !isPostValid(values)) return;
    setSaving(true);
    try {
      const r = await updateClusterItem({ project_id: projectId, item_id: item.id, ...toPostInput(values) });
      if (!r.ok) { toast.error(r.error ?? "Could not save the details."); return; }
      toast.success("Details saved.");
      setOpen(false);
      router.refresh();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={openDialog}>
        <PencilLine className="size-3.5" /> Add details
      </Button>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Post details</DialogTitle>
            <DialogDescription>Title, meta, URL and primary keyword are required. Everything else is optional - one item per line.</DialogDescription>
          </DialogHeader>
          <ClusterPostForm values={values} onChange={setValues} idPrefix={`details-${item.id}`} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
            <Button type="button" variant="brand" onClick={save} disabled={saving || !isPostValid(values)} className="gap-1.5">
              {saving && <Loader2 className="size-3.5 animate-spin" />} Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
