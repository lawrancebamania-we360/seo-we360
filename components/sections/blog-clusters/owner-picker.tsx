"use client";

// Shared owner / point-of-contact picker, used for a cluster (cluster-owner.tsx)
// and for a single post (item-owner.tsx). Managers pick/change/clear from the
// team; others see it read-only. Compact mode is for cards / table rows (it stops
// the click from bubbling to a surrounding link or row). `onPick` does the server
// write and returns ok/error; this component owns the open + pending + toast +
// refresh. Not ready (its column's migration unapplied) → a one-line notice
// (full) or nothing (compact).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, User, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials } from "@/lib/ui-helpers";
import type { Member } from "@/components/sections/assignee-picker";

export function OwnerPicker({ label, ownerId, ownerName, ready, members, canManage, compact = false, onPick }: {
  label: string;
  ownerId: string | null;
  /** Fallback display name when `members` isn't supplied (read-only surfaces). */
  ownerName: string | null;
  ready: boolean;
  members: Member[];
  canManage: boolean;
  compact?: boolean;
  onPick: (id: string | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const current = members.find((m) => m.id === ownerId) ?? (ownerId && ownerName ? { id: ownerId, name: ownerName } : null);

  if (!ready) {
    if (compact) return null;
    return (
      <div className="flex items-center gap-2">
        <LabelText>{label}</LabelText>
        <span className="text-[12px] text-muted-foreground/80">needs the owner migration applied</span>
      </div>
    );
  }

  const pick = async (id: string | null) => {
    if (pending) return;
    setPending(true);
    try {
      const r = await onPick(id);
      if (!r.ok) { toast.error(r.error ?? "Could not set the owner."); return; }
      toast.success(id ? `Owner set to ${members.find((m) => m.id === id)?.name ?? "member"}` : "Owner cleared");
      setOpen(false);
      router.refresh();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setPending(false); }
  };

  const face = current ? (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar className={compact ? "size-4" : "size-5"}><AvatarFallback className="text-[9px]">{initials(current.name)}</AvatarFallback></Avatar>
      <span className={cn("truncate font-medium text-foreground", compact ? "max-w-[130px] text-[12px]" : "text-[13px]")}>{current.name}</span>
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1.5 text-muted-foreground", compact ? "text-[12px]" : "text-[13px]")}>
      {compact ? <UserPlus className="size-3.5" /> : <User className="size-3.5" />} {compact ? "Add owner" : "Unassigned"}
    </span>
  );

  if (!canManage) {
    if (compact) return current ? face : null;
    return <div className="flex items-center gap-2"><LabelText>{label}</LabelText> {face}</div>;
  }

  const picker = (
    // Inside a card link / clickable row: stop the trigger click from navigating.
    <span onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} className="inline-flex max-w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button type="button" disabled={pending}
              className={cn("inline-flex max-w-full items-center gap-1.5 rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-60", compact ? "px-1.5 py-0.5" : "px-2 py-1")}>
              {face}
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          }
        />
        <PopoverContent className="w-56 p-1" align="start" onClick={(e) => e.stopPropagation()}>
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
    </span>
  );

  if (compact) return picker;
  return <div className="flex items-center gap-2"><LabelText>{label}</LabelText> {picker}</div>;
}

function LabelText({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>;
}
