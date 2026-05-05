import { getUserList } from "@/lib/data/admin-metrics";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, User, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { UserAdminActions } from "@/components/admin/user-admin-actions";

export const metadata = { title: "Users · Admin" };

export default async function UsersPage() {
  const users = await getUserList();

  const platformAdmins = users.filter((u) => u.platform_admin);
  const regular = users.filter((u) => !u.platform_admin);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          {users.length} total · {platformAdmins.length} platform admin{platformAdmins.length === 1 ? "" : "s"}
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-semibold p-3">User</th>
                <th className="text-left font-semibold p-3">Role</th>
                <th className="text-left font-semibold p-3">Platform admin</th>
                <th className="text-left font-semibold p-3">Signed up</th>
                <th className="text-left font-semibold p-3">Last active</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...platformAdmins, ...regular].map((u) => (
                <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-full bg-muted">
                        <User className="size-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate max-w-[220px]">{u.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3"><Badge variant="outline" className="capitalize text-[10px]">{u.role.replace("_", " ")}</Badge></td>
                  <td className="p-3">
                    {u.platform_admin ? (
                      <Badge className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 border text-[10px] gap-0.5">
                        <ShieldCheck className="size-2.5" /> Yes
                      </Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}</td>
                  <td className="p-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(u.last_active), { addSuffix: true })}</td>
                  <td className="p-3 text-right">
                    <UserAdminActions userId={u.id} email={u.email} platformAdmin={u.platform_admin} />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground text-sm">
                    <Users className="size-6 mx-auto mb-2 opacity-50" />
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
