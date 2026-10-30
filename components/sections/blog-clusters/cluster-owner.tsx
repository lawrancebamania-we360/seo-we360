"use client";

// Ticket 3: cluster owner / point of contact. Shown at the top of a cluster.
// Managers can set, change or clear it from the project's team (same people as
// row assignees); everyone else sees it read-only. Degrades to a one-line notice
// until the owner_id migration (20261030000001) is applied.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials } from "@/lib/ui-helpers";
import { setClusterOwner } from "@/lib/actions/blog-clusters";
import type { Member } from "@/components/sections/assignee-picker";

function OwnerLabel() {
  return <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cluster owner</span>;
}

export function ClusterOwner({ projectId, clusterId, ownerId, ownerReady, members, canManage }: {
  projectId: string;
  clusterId: string;
  ownerId: string | null;
  ownerReady: boolean;
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const current = members.find((m) => m.id === ownerId) ?? null;

  if (!ownerReady) {
    return (
      <div className="flex items-center gap-2">
        <OwnerLabel />
        <span className="text-[12px] text-muted-foreground/80">needs the 20261030000001 migration applied</span>
      </div>
    );
  }

  const pick = async (id: string | null) => {
    if (pending) return;
    setPending(true);
    try {
      const r = await setClusterOwner({ project_id: projectId, cluster_id: clusterId, owner_id: id });
      if (!r.ok) { toast.error(r.error ?? "Could not set the owner."); return; }
      toast.success(id ? `Owner set to ${members.find((m) => m.id === id)?.name ?? "member"}` : "Owner cleared");
      setOpen(false);
      router.refresh();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setPending(false); }
  };

  const face = current ? (
    <span className="inline-flex items-center gap-1.5">
      <Avatar className="size-5"><AvatarFallback className="text-[9px]">{initials(current.name)}</AvatarFallback></Avatar>
      <span className="text-[13px] font-medium text-foreground">{current.name}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground"><User className="size-3.5" /> Unassigned</span>
  );

  if (!canManage) {
    return <div className="flex items-center gap-2"><OwnerLabel /> {face}</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <OwnerLabel />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button type="button" disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 transition-colors hover:bg-muted disabled:opacity-60">
              {face}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          }
        />
        <PopoverContent className="w-56 p-1" align="start">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Set owner</div>
          <button type="button" onClick={() => pick(null)} disabled={pending}
            className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50", !ownerId && "bg-muted")}>
            <User className="size-3.5 text-muted-foreground" /> Unassigned
          </button>
          <div className="my-1 h-px bg-border" />
          {members.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No team members yet — invite from Team → Invite.</div>
          ) : (
            members.map((m) => (
              <button key={m.id} type="button" onClick={() => pick(m.id)} disabled={pending}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50", ownerId === m.id && "bg-muted")}>
                <Avatar className="size-5"><AvatarFallback className="text-[9px]">{initials(m.name)}</AvatarFallback></Avatar>
                <span className="truncate">{m.name}</span>
              </button>
            ))
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
