"use client";

// Team Targets: adding, editing and removing one target (admins). Bulk entry is
// the import dialog; this is for the one-off change. Removing hides a target and
// keeps every number ever reported against it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { removeTeamTarget, saveTeamTarget } from "@/lib/actions/team-targets";
import { safely } from "@/lib/team-targets/safely";
import type { DashboardTarget } from "@/lib/team-targets/types";
import type { TargetFrequency } from "@/lib/team-targets/types";

// The fields the add/edit/remove dialogs need; DashboardTarget is a superset.
type TargetRow = Pick<DashboardTarget, "id" | "task" | "ownerId" | "coOwnerId" | "coOwner2Id" | "target" | "frequency" | "ownerName" | "oneTime" | "dueDate" | "detail">;

export type MemberOption = { id: string; name: string };

const NONE = "__none__";
const FREQUENCY_ITEMS: { value: TargetFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function TargetFormDialog({
  projectId, members, target, onClose,
}: {
  projectId: string;
  members: MemberOption[];
  /** The target being edited; omit to add a new one. */
  target?: TargetRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [task, setTask] = useState(target?.task ?? "");
  const [ownerId, setOwnerId] = useState(target?.ownerId ?? "");
  const [coOwnerId, setCoOwnerId] = useState(target?.coOwnerId ?? NONE);
  const [coOwner2Id, setCoOwner2Id] = useState(target?.coOwner2Id ?? NONE);
  const [goal, setGoal] = useState(target ? String(target.target) : "");
  const [frequency, setFrequency] = useState<TargetFrequency>(target?.frequency ?? "weekly");
  const [oneTime, setOneTime] = useState(target?.oneTime ?? false);
  const [dueDate, setDueDate] = useState(target?.dueDate ?? "");
  const [detail, setDetail] = useState(target?.detail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerItems = members.map((m) => ({ value: m.id, label: m.name }));
  const coOwnerItems = [{ value: NONE, label: "No co-owner" }, ...ownerItems.filter((m) => m.value !== ownerId)];
  const coOwner2Items = [{ value: NONE, label: "No 2nd co-owner" }, ...ownerItems.filter((m) => m.value !== ownerId && m.value !== coOwnerId)];
  const valid = task.trim() && ownerId && /^\d+$/.test(goal.trim()) && Number(goal) > 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const r = await safely(saveTeamTarget({
      project_id: projectId,
      id: target?.id,
      task: task.trim(),
      owner_id: ownerId,
      co_owner_id: coOwnerId === NONE || coOwnerId === ownerId ? null : coOwnerId,
      co_owner_2_id: coOwner2Id === NONE || coOwner2Id === ownerId || coOwner2Id === coOwnerId ? null : coOwner2Id,
      target: Number(goal.trim()),
      frequency,
      one_time: oneTime,
      due_date: oneTime && dueDate ? dueDate : null,
      detail: detail.trim() || null,
    }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not save that target."); return; }
    toast.success(target ? "Target updated." : "Target added.");
    router.refresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{target ? "Edit target" : "Add a target"}</DialogTitle>
          <DialogDescription>A recurring output one person owns, for example Listicles, 4 per day.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="tt-task">Task</label>
            <Input id="tt-task" maxLength={200} value={task} onChange={(e) => setTask(e.target.value)} autoFocus className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="tt-owner">Owner</label>
              <Combobox id="tt-owner" items={ownerItems} value={ownerId} onValueChange={setOwnerId} placeholder="Pick a person" searchPlaceholder="Search people" className="h-9 w-full" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="tt-coowner">Co-owner (optional)</label>
              <Combobox id="tt-coowner" items={coOwnerItems} value={coOwnerId} onValueChange={setCoOwnerId} placeholder="No co-owner" searchPlaceholder="Search people" className="h-9 w-full" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="tt-coowner2">Second co-owner (optional)</label>
            <Combobox id="tt-coowner2" items={coOwner2Items} value={coOwner2Id} onValueChange={setCoOwner2Id} placeholder="No 2nd co-owner" searchPlaceholder="Search people" className="h-9 w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="tt-goal">Target</label>
              <Input id="tt-goal" type="number" inputMode="numeric" min={1} max={1000000} step={1} value={goal} onChange={(e) => setGoal(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="tt-frequency">How often</label>
              <Combobox id="tt-frequency" items={FREQUENCY_ITEMS} value={frequency} onValueChange={(v) => setFrequency(v as TargetFrequency)} disabled={oneTime} className="h-9 w-full" />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-2.5">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <input type="checkbox" checked={oneTime} onChange={(e) => setOneTime(e.target.checked)} className="size-3.5 accent-[#5B45E0]" />
              One-time deliverable (a deadline, not a repeating cadence)
            </label>
            {oneTime && (
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="tt-due">Due date</label>
                <Input id="tt-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9" />
                <p className="mt-1 text-[11px] text-muted-foreground">The target counts in full in the period that contains this date. “How often” is ignored.</p>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="tt-detail">Detail (optional)</label>
            <Textarea id="tt-detail" rows={2} maxLength={2000} value={detail} onChange={(e) => setDetail(e.target.value)}
              placeholder="Notes, ranges or rules — e.g. “min 7, 3 at DR 30–40, rest 40+; SaaS only”." className="text-[13px]" />
          </div>
          {error && <p className="text-xs text-error-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" variant="brand" onClick={submit} disabled={!valid || busy} className="gap-1.5">
            {busy && <Loader2 className="size-3.5 animate-spin" />} {target ? "Save" : "Add target"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveTargetDialog({ row, projectId, onClose }: { row: TargetRow; projectId: string; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    const r = await safely(removeTeamTarget({ project_id: projectId, target_id: row.id }));
    setBusy(false);
    if (!r.ok) { toast.error(r.error ?? "Could not remove that target."); return; }
    toast.success("Target removed. Past numbers are kept.");
    router.refresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Remove {row.task}{row.ownerName ? ` (${row.ownerName})` : ""}?</DialogTitle>
          <DialogDescription>
            It leaves the board and stops counting. Every number already reported for it is kept. Adding the same task for the same owner again brings it back with that history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={confirm} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddTargetButton({ projectId, members }: { projectId: string; members: MemberOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Add target
      </Button>
      {open && <TargetFormDialog projectId={projectId} members={members} onClose={() => setOpen(false)} />}
    </>
  );
}
