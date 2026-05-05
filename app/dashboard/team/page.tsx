import { requireAdmin } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/ui-helpers";
import { InviteDialog } from "./invite-dialog";
import { MemberActions } from "./member-actions";
import type { Profile, Project } from "@/lib/types/database";
import { formatDistanceToNow } from "date-fns";

export const metadata = { title: "Team" };

const ROLE_CLASS: Record<string, string> = {
  super_admin: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
  admin: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
  member: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
};

export default async function TeamPage() {
  const ctx = await requireAdmin();
  const supabase = await createClient();
  const [{ data: profiles }, { data: projects }] = await Promise.all([
    supabase.from("profiles").select("*").order("role").order("name"),
    supabase.from("projects").select("*").eq("is_active", true).order("name"),
  ]);

  const members = (profiles ?? []) as Profile[];
  const allProjects = (projects ?? []) as Project[];
  const isSuper = ctx.profile.role === "super_admin";

  return (
    <div className="flex-1 px-6 py-8 lg:px-10 space-y-6 max-w-[1300px] w-full mx-auto">
      <PageHeader
        title="Team"
        description="Manage agency and client users. Members get granular per-section permissions per project."
        actions={<InviteDialog projects={allProjects} canInviteAdmin={isSuper} />}
      />
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_140px_100px] gap-2 border-b p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div>User</div>
          <div>Role</div>
          <div>Last active</div>
          <div></div>
        </div>
        {members.map((m) => (
          <div
            key={m.id}
            className="grid grid-cols-[1fr_120px_140px_100px] gap-2 items-center p-4 border-b last:border-b-0 hover:bg-muted/30"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="size-9">
                <AvatarFallback>{initials(m.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-medium truncate">{m.name}</div>
                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
              </div>
            </div>
            <div>
              <Badge className={ROLE_CLASS[m.role]}>
                {m.role.replace("_", " ")}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(m.last_active), { addSuffix: true })}
            </div>
            <div>
              {isSuper && m.id !== ctx.profile.id && (
                <MemberActions member={m} />
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
