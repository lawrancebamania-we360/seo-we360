"use client";

// Blog Clusters (Ticket 5): assignee picker for a cluster row. Two modes,
// same look:
//   - no task yet -> picking someone CREATES the task (assignClusterItem)
//     and links it back to this row, in one action
//   - already promoted -> picking someone just reassigns the linked task
//     (reuses updateTask, same as Sprint's own AssigneePicker)

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials } from "@/lib/ui-helpers";
import { assignClusterItem } from "@/lib/actions/blog-clusters";
import { updateTask } from "@/lib/actions/tasks";
import type { Member } from "@/components/sections/assignee-picker";

export function ClusterItemAssignee({ itemId, taskId, currentAssignee, members }: {
  itemId: string;
  taskId: string | null;
  currentAssignee: string | null;
  members: Member[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const current = members.find((m) => m.id === currentAssignee) ?? null;

  const pick = async (id: string | null) => {
    if (pending) return;
    setPending(true);
    try {
      if (taskId) {
        await updateTask(taskId, { team_member_id: id });
      } else {
        const r = await assignClusterItem({ item_id: itemId, team_member_id: id });
        if (!r.ok) throw new Error(r.error ?? "Could not assign this row.");
      }
      const next = id ? members.find((m) => m.id === id)?.name ?? "member" : null;
      toast.success(id ? `Assigned to ${next}${!taskId ? " — task created in Blog Sprint" : ""}` : "Unassigned");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign");
    } finally {
      setPending(false);
    }
  };

  const title = current ? `Assigned to ${current.name} — click to change` : taskId ? "Assign to team member" : "Assign to team member (creates a Sprint task)";

  const trigger = (
    <Button
      size="icon-sm"
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
          {taskId ? "Assign to" : "Assign to (creates a task)"}
        </div>
        <button type="button" onClick={() => pick(null)} disabled={pending}
          className={cn("w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted flex items-center gap-2 disabled:opacity-50", !currentAssignee && "bg-muted")}>
          <User className="size-3.5 text-muted-foreground" /> Unassigned
        </button>
        <div className="my-1 h-px bg-border" />
        {members.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No team members yet — invite from Team → Invite.</div>
        ) : (
          members.map((m) => (
            <button key={m.id} type="button" onClick={() => pick(m.id)} disabled={pending}
              className={cn("w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted flex items-center gap-2 disabled:opacity-50", currentAssignee === m.id && "bg-muted")}>
              <Avatar className="size-5"><AvatarFallback className="text-[9px]">{initials(m.name)}</AvatarFallback></Avatar>
              <span className="truncate">{m.name}</span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
