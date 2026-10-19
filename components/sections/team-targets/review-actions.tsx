"use client";

// Team Targets: the admin's two answers to a reported number. Verify is one
// click; sending it back needs a reason, which the person sees next to the
// number so they know what to fix before reporting again.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { reviewTeamTargetEntry } from "@/lib/actions/team-targets";
import { safely } from "@/lib/team-targets/safely";
import type { TargetRow } from "@/lib/data/team-targets";

export function VerifyButton({ projectId, entryId }: { projectId: string; entryId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    if (busy) return;
    setBusy(true);
    const r = await safely(reviewTeamTargetEntry({ project_id: projectId, entry_id: entryId, decision: "verify" }));
    setBusy(false);
    if (!r.ok) { toast.error(r.error ?? "Could not verify that number."); return; }
    toast.success("Verified.");
    router.refresh();
  };

  return (
    <Button type="button" size="sm" variant="outline" onClick={verify} disabled={busy} className="h-7 gap-1 px-2 text-xs">
      {busy ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3 text-success-600" />} Verify
    </Button>
  );
}

export function SendBackDialog({ row, projectId, onClose }: { row: TargetRow; projectId: string; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!row.entry || !reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await safely(reviewTeamTargetEntry({ project_id: projectId, entry_id: row.entry.id, decision: "send_back", note: reason.trim() }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not send that back."); return; }
    toast.success("Sent back with your note.");
    router.refresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Send back: {row.task}</DialogTitle>
          <DialogDescription>
            {row.ownerName ?? "The owner"} reported {row.entry?.achieved.toLocaleString()}. Say what needs fixing. They will see this and can report again.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="For example: the proof link is empty, or the count includes last week."
        />
        {error && <p className="text-xs text-error-600">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={!reason.trim() || busy} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />} Send back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
