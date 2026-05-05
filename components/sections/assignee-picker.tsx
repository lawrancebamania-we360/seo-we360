"use client";

import { useState } from "react";
import { User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { updateTask } from "@/lib/actions/tasks";
import { initials } from "@/lib/ui-helpers";
import type { Profile } from "@/lib/types/database";

export type Member = Pick<Profile, "id" | "name" | "avatar_url">;

interface Props {
  taskId: string;
  currentAssignee: string | null;
  members: Member[];
  onChanged?: (nextId: string | null, nextMember: Member | null) => void;
  size?: "sm" | "md";
}

export function AssigneePicker({ taskId, currentAssignee, members, onChanged, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const current = members.find((m) => m.id === currentAssignee) ?? null;

  const pick = async (id: string | null) => {
    if (pending) return;
    setPending(true);
    try {
      await updateTask(taskId, { team_member_id: id });
      const next = id ? members.find((m) => m.id === id) ?? null : null;
      onChanged?.(id, next);
      toast.success(id ? `Assigned to ${next?.name ?? "member"}` : "Unassigned");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign");
    } finally {
      setPending(false);
    }
  };

  const title = current ? `Assigned to ${current.name} — click to change` : "Assign to team member";

  const trigger = (
    <Button
      size={size === "sm" ? "icon-sm" : "icon"}
      variant="outline"
      aria-label={title}
      title={title}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
    >
      {current ? (
        <Avatar className="size-5">
          <AvatarFallback className="text-[9px]">{initials(current.name)}</AvatarFallback>
        </Avatar>
      ) : (
        <User className="size-3.5" />
      )}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-56 p-1" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Assign to
        </div>
        <button
          type="button"
          onClick={() => pick(null)}
          disabled={pending}
          className={cn(
            "w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted flex items-center gap-2 disabled:opacity-50",
            !currentAssignee && "bg-muted"
          )}
        >
          <User className="size-3.5 text-muted-foreground" />
          Unassigned
        </button>
        <div className="my-1 h-px bg-border" />
        {members.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No team members yet — invite from Team → Invite.
          </div>
        ) : (
          members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m.id)}
              disabled={pending}
              className={cn(
                "w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted flex items-center gap-2 disabled:opacity-50",
                currentAssignee === m.id && "bg-muted"
              )}
            >
              <Avatar className="size-5">
                <AvatarFallback className="text-[9px]">{initials(m.name)}</AvatarFallback>
              </Avatar>
              <span className="truncate">{m.name}</span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
