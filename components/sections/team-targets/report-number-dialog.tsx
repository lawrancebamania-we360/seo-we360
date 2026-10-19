"use client";

// Team Targets: the person (or an admin) enters what was achieved for the week.
// Saving always puts the number in the queue to be verified, including when it
// changes one that was already verified, so the dialog says so up front.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { reportTeamTargetNumber } from "@/lib/actions/team-targets";
import { safely } from "@/lib/team-targets/safely";
import { FREQUENCY_LABEL } from "@/lib/team-targets/types";
import { formatWeekRange } from "@/lib/team-targets/week";
import type { TargetRow } from "@/lib/data/team-targets";

export function ReportNumberDialog({
  row, projectId, weekStart, onClose,
}: {
  row: TargetRow;
  projectId: string;
  weekStart: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [achieved, setAchieved] = useState(row.entry ? String(row.entry.achieved) : "");
  const [proof, setProof] = useState(row.entry?.proofUrl ?? "");
  const [note, setNote] = useState(row.entry?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^\d+$/.test(achieved.trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const r = await safely(reportTeamTargetNumber({
      project_id: projectId,
      target_id: row.id,
      week_start: weekStart,
      achieved: Number(achieved.trim()),
      note: note.trim() || undefined,
      proof_url: proof.trim() || undefined,
    }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not save that number."); return; }
    toast.success("Saved. It now waits for an admin to verify it.");
    router.refresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{row.entry ? "Edit" : "Report"}: {row.task}</DialogTitle>
          <DialogDescription>
            {formatWeekRange(weekStart)}. Goal: {row.target.toLocaleString()} {FREQUENCY_LABEL[row.frequency]}
            {row.expectedThisWeek != null && row.frequency === "daily" ? ` (${row.expectedThisWeek.toLocaleString()} for the week)` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="tt-achieved">
              How many did you complete this week?
            </label>
            <Input
              id="tt-achieved" type="number" inputMode="numeric" min={0} max={1000000} step={1} autoFocus
              value={achieved} onChange={(e) => setAchieved(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              className="h-9"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="tt-proof">Proof link (optional)</label>
            <Input id="tt-proof" maxLength={2000} value={proof} onChange={(e) => setProof(e.target.value)} placeholder="Sheet, folder or post link" className="h-9" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="tt-note">Note (optional)</label>
            <Textarea id="tt-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          {row.entry?.status === "verified" && (
            <p className="rounded-md border border-warning-300/60 bg-warning-500/5 px-2.5 py-2 text-xs text-warning-700 dark:text-warning-400">
              This number is already verified. Saving a change sends it back to be verified again.
            </p>
          )}
          {error && <p className="text-xs text-error-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" variant="brand" onClick={submit} disabled={!valid || busy} className="gap-1.5">
            {busy && <Loader2 className="size-3.5 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
