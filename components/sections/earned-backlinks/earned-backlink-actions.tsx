"use client";

// Earned Backlinks row actions - trimmed from Backlink Submissions'
// BacklinkSubmissionActions: assignee popover + delete-confirm only. No
// AI-verification button here - that feature specifically checks a live
// page against a logged Topic, and there's no "topic" concept for an
// inbound link we received (not something we asked someone to write about).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials } from "@/lib/ui-helpers";
import { deleteEarnedBacklink, assignEarnedBacklink } from "@/lib/actions/earned-backlinks";
import type { Member } from "@/components/sections/assignee-picker";

export function EarnedBacklinkActions({
  projectId, backlinkId, assignedTo, members, canManage,
}: {
  projectId: string;
  backlinkId: string;
  assignedTo: string | null;
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const currentAssignee = members.find((m) => m.id === assignedTo) ?? null;

  const pickAssignee = async (id: string | null) => {
    if (assigning) return;
    setAssigning(true);
    const r = await assignEarnedBacklink({ project_id: projectId, backlink_id: backlinkId, team_member_id: id });
    setAssigning(false);
    if (!r.ok) { toast.error(r.error ?? "Could not assign this backlink."); return; }
    toast.success(id ? `Assigned to ${members.find((m) => m.id === id)?.name ?? "member"}` : "Unassigned");
    setAssignOpen(false);
    router.refresh();
  };

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const r = await deleteEarnedBacklink({ project_id: projectId, backlink_id: backlinkId });
    setDeleting(false);
    if (!r.ok) { toast.error(r.error ?? "Could not delete that backlink."); return; }
    toast.success("Backlink deleted.");
    router.refresh();
  };

  if (!canManage) {
    return currentAssignee ? (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Avatar className="size-5"><AvatarFallback className="text-[9px]">{initials(currentAssignee.name)}</AvatarFallback></Avatar>
        {currentAssignee.name}
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  if (confirmingDelete) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-[11.5px] text-error-600">Delete?</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11.5px]" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Cancel</Button>
        <Button variant="destructive" size="sm" className="h-6 gap-1 px-2 text-[11.5px]" onClick={confirmDelete} disabled={deleting}>
          {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Delete
        </Button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Popover open={assignOpen} onOpenChange={setAssignOpen}>
        <PopoverTrigger render={
          <button
            type="button"
            disabled={assigning}
            title={currentAssignee ? `Assigned to ${currentAssignee.name} - click to change` : "Assign to team member"}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            {currentAssignee ? (
              <>
                <Avatar className="size-4"><AvatarFallback className="text-[8px]">{initials(currentAssignee.name)}</AvatarFallback></Avatar>
                <span className="text-[11.5px]">{currentAssignee.name}</span>
              </>
            ) : (
              <>
                <User className="size-3.5" />
                <span className="text-[11.5px]">Unassigned</span>
              </>
            )}
          </button>
        } />
        <PopoverContent className="w-56 p-1" align="end">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Assign to</div>
          <button type="button" onClick={() => pickAssignee(null)} disabled={assigning}
            className={cn("w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted flex items-center gap-2 disabled:opacity-50", !assignedTo && "bg-muted")}>
            <User className="size-3.5 text-muted-foreground" /> Unassigned
          </button>
          <div className="my-1 h-px bg-border" />
          {members.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No team members yet.</div>
          ) : (
            members.map((m) => (
              <button key={m.id} type="button" onClick={() => pickAssignee(m.id)} disabled={assigning}
                className={cn("w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted flex items-center gap-2 disabled:opacity-50", assignedTo === m.id && "bg-muted")}>
                <Avatar className="size-5"><AvatarFallback className="text-[9px]">{initials(m.name)}</AvatarFallback></Avatar>
                <span className="truncate">{m.name}</span>
              </button>
            ))
          )}
        </PopoverContent>
      </Popover>

      <Button variant="ghost" size="icon-sm" onClick={() => setConfirmingDelete(true)} title="Delete this backlink">
        <Trash2 className="size-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}
