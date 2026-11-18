"use client";

// Influencer Collabs: edit one collab - the same fields as Add (the shared
// CollabFormFields), saved through updateInfluencerCollab. Daily engagement
// and the we360.ai links stay in the post-tracking dialog.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateInfluencerCollab } from "@/lib/actions/influencer-collabs";
import { CollabFormFields, draftFromCollab, draftToInput, isDraftComplete, type CollabDraft } from "@/components/sections/influencer-collabs/collab-form";
import type { InfluencerCollabRow } from "@/lib/data/influencer-collabs";
import type { Member } from "@/components/sections/assignee-picker";

const sameDraft = (a: CollabDraft, b: CollabDraft) =>
  (Object.keys(a) as (keyof CollabDraft)[]).every((k) => a[k] === b[k]);

export function EditInfluencerCollabDialog({ collab, projectId, members, onClose }: {
  collab: InfluencerCollabRow;
  projectId: string;
  members: Member[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [initial] = useState(() => draftFromCollab(collab));
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = !sameDraft(draft, initial);

  const save = async () => {
    if (busy || !dirty || !isDraftComplete(draft)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await updateInfluencerCollab({ project_id: projectId, collab_id: collab.id, ...draftToInput(draft) });
      if (!r.ok) { setError(r.error ?? "Could not save that collab."); return; }
      const newPost = draft.postLink.trim() !== initial.postLink.trim() && draft.postLink.trim() !== "";
      toast.success(newPost && draft.platform === "LinkedIn" ? "Collab saved. The new post's links are looked up on the next refresh." : "Collab saved.");
      onClose();
      router.refresh();
    } catch {
      setError("Could not save that collab.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit collab</DialogTitle>
          <DialogDescription>
            {collab.influencerName} · {collab.platform}. Daily engagement numbers are edited in post tracking.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <CollabFormFields draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} members={members} />
          {error && <p className="text-xs text-error-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="brand" onClick={save} disabled={busy || !dirty || !isDraftComplete(draft)} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
