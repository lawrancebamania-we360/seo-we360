"use client";

// Influencer Collabs row controls: the assignee picker (its own column) and
// the row's Edit / Delete actions (right-most column). Assign mechanics match
// components/sections/earned-backlinks/earned-backlink-actions.tsx; delete
// confirms in a small popover so the row never reflows.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { initials } from "@/lib/ui-helpers";
import { deleteInfluencerCollab, assignInfluencerCollab } from "@/lib/actions/influencer-collabs";
import type { InfluencerCollabRow } from "@/lib/data/influencer-collabs";
import type { Member } from "@/components/sections/assignee-picker";

function EmptyAvatar() {
  return <span className="grid size-5 shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/40"><User className="size-3" /></span>;
}

export function CollabAssignee({
  projectId, collabId, assignedTo, members, canManage,
}: {
  projectId: string;
  collabId: string;
  assignedTo: string | null;
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const current = members.find((m) => m.id === assignedTo) ?? null;

  const pick = async (id: string | null) => {
    if (assigning) return;
    setAssigning(true);
    const r = await assignInfluencerCollab({ project_id: projectId, collab_id: collabId, team_member_id: id });
    setAssigning(false);
    if (!r.ok) { toast.error(r.error ?? "Could not assign this collab."); return; }
    toast.success(id ? `Assigned to ${members.find((m) => m.id === id)?.name ?? "member"}` : "Unassigned");
    setOpen(false);
    router.refresh();
  };

  const face = current ? (
    <>
      <Avatar className="size-5 shrink-0"><AvatarFallback className="text-[9px]">{initials(current.name)}</AvatarFallback></Avatar>
      <span className="truncate text-foreground">{current.name}</span>
    </>
  ) : (
    <>
      <EmptyAvatar />
      <span className="truncate">Unassigned</span>
    </>
  );

  if (!canManage) {
    return <span className="inline-flex max-w-full items-center gap-1.5 text-[12.5px] text-muted-foreground" title={current?.name}>{face}</span>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <button
          type="button"
          disabled={assigning}
          title={current ? `Assigned to ${current.name} - click to change` : "Assign to team member"}
          className="-mx-1.5 inline-flex max-w-[calc(100%+12px)] items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted aria-expanded:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/60 disabled:opacity-60"
        >
          {face}
        </button>
      } />
      <PopoverContent className="w-56 p-1" align="start">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assign to</div>
        <button type="button" onClick={() => pick(null)} disabled={assigning}
          className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50", !assignedTo && "bg-muted")}>
          <User className="size-3.5 text-muted-foreground" /> Unassigned
        </button>
        <div className="my-1 h-px bg-border" />
        {members.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No team members yet.</div>
        ) : (
          members.map((m) => (
            <button key={m.id} type="button" onClick={() => pick(m.id)} disabled={assigning}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50", assignedTo === m.id && "bg-muted")}>
              <Avatar className="size-5"><AvatarFallback className="text-[9px]">{initials(m.name)}</AvatarFallback></Avatar>
              <span className="truncate">{m.name}</span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

export function CollabRowActions({ projectId, collab, onEdit }: {
  projectId: string;
  collab: InfluencerCollabRow;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const r = await deleteInfluencerCollab({ project_id: projectId, collab_id: collab.id });
      if (!r.ok) { toast.error(r.error ?? "Could not delete that collab."); return; }
      toast.success("Collab deleted.");
      setConfirmOpen(false);
      router.refresh();
    } catch {
      toast.error("Could not delete that collab.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit collab" aria-label={`Edit ${collab.influencerName}'s collab`}
        className="text-muted-foreground">
        <Pencil className="size-3.5" />
      </Button>
      <Popover open={confirmOpen} onOpenChange={(v) => { if (!deleting) setConfirmOpen(v); }}>
        <PopoverTrigger render={
          <Button variant="ghost" size="icon-sm" title="Delete collab" aria-label={`Delete ${collab.influencerName}'s collab`}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive aria-expanded:bg-destructive/10 aria-expanded:text-destructive">
            <Trash2 className="size-3.5" />
          </Button>
        } />
        <PopoverContent align="end" className="w-64 gap-2 p-3">
          <PopoverTitle className="text-[13px]">Delete this collab?</PopoverTitle>
          <PopoverDescription className="text-[12px] leading-relaxed">
            {collab.influencerName} · {collab.platform}, with its daily numbers. This can&apos;t be undone.
          </PopoverDescription>
          <div className="flex justify-end gap-1.5 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleting} className="gap-1">
              {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Delete
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
