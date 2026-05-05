"use client";

import { useTransition } from "react";
import { MoreHorizontal, Trash2, Shield, Crown, User as UserIcon, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateMemberRole, removeMember } from "@/lib/actions/team";
import type { Profile, UserRole } from "@/lib/types/database";

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  member: "Member",
  client: "Client",
};

const ROLE_ICONS: Record<UserRole, typeof UserIcon> = {
  super_admin: Crown,
  admin: Shield,
  member: UserIcon,
  client: UserCog,
};

export function MemberActions({ member }: { member: Profile }) {
  const [pending, start] = useTransition();

  const changeRole = (next: UserRole) => {
    if (next === member.role) return;
    if (!confirm(`Change ${member.name} from ${ROLE_LABELS[member.role]} to ${ROLE_LABELS[next]}?`)) return;
    start(async () => {
      try {
        await updateMemberRole(member.id, next);
        toast.success(`${member.name} is now ${ROLE_LABELS[next]}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const remove = () => {
    if (!confirm(`Remove ${member.name}? This deletes their account permanently.`)) return;
    start(async () => {
      try {
        await removeMember(member.id);
        toast.success("Removed");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const roles: UserRole[] = ["super_admin", "admin", "member", "client"];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label="Actions">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Change role
        </div>
        {roles.map((r) => {
          const Icon = ROLE_ICONS[r];
          const selected = r === member.role;
          return (
            <DropdownMenuItem
              key={r}
              onClick={() => changeRole(r)}
              disabled={selected || pending}
              className={selected ? "opacity-60" : undefined}
            >
              <Icon className="size-4 mr-2" />
              {ROLE_LABELS[r]}
              {selected && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={remove} className="text-rose-600 focus:text-rose-600">
          <Trash2 className="size-4 mr-2" />
          Remove member
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
