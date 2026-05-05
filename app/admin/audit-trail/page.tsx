import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export const metadata = { title: "Audit trail · Admin" };

export default async function AuditTrailPage() {
  const admin = createAdminClient();
  const [{ data }, { data: profiles }] = await Promise.all([
    admin.from("billing_audit_trail").select("*").order("created_at", { ascending: false }).limit(200),
    admin.from("profiles").select("id, email, name"),
  ]);

  type Entry = { id: string; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; diff: Record<string, unknown>; created_at: string };
  const entries = (data ?? []) as Entry[];
  const profileById = new Map(((profiles ?? []) as Array<{ id: string; email: string; name: string }>).map((p) => [p.id, p]));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit trail</h1>
        <p className="text-sm text-muted-foreground">Last 200 platform-admin actions. Forensic record — never edit these rows.</p>
      </div>

      {entries.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground text-sm border-dashed">
          <ScrollText className="size-6 mx-auto mb-2 opacity-50" />
          No admin actions yet.
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => {
            const actor = e.actor_id ? profileById.get(e.actor_id) : null;
            return (
              <Card key={e.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-mono">{e.action}</Badge>
                    {e.target_type && (
                      <Badge variant="outline" className="text-[10px] font-mono opacity-70">{e.target_type}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    By <span className="font-medium text-foreground">{actor?.name ?? actor?.email ?? "system"}</span>
                    {e.target_id && <> · target <span className="font-mono">{e.target_id.slice(0, 8)}</span></>}
                  </div>
                  {e.diff && Object.keys(e.diff).length > 0 && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer hover:text-foreground">diff</summary>
                      <pre className="mt-1 rounded bg-muted p-2 font-mono text-[10px] overflow-x-auto">{JSON.stringify(e.diff, null, 2)}</pre>
                    </details>
                  )}
                </div>
                <div className="text-xs text-muted-foreground shrink-0 text-right" title={format(new Date(e.created_at), "PPpp")}>
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
