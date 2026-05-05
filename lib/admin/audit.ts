import type { SupabaseClient } from "@supabase/supabase-js";

// Append-only audit log for platform-admin actions. Anything that mutates a plan,
// subscription, setting, or user role goes through here. Reading in /admin/audit-trail.

export interface AuditEntry {
  actor_id: string;
  action: string;
  target_type?: string;
  target_id?: string;
  diff?: Record<string, unknown>;
  ip?: string | null;
}

export async function logAudit(supabase: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from("billing_audit_trail").insert({
    actor_id: entry.actor_id,
    action: entry.action,
    target_type: entry.target_type ?? null,
    target_id: entry.target_id ?? null,
    diff: entry.diff ?? {},
    ip: entry.ip ?? null,
  });
  if (error) console.error("audit log insert failed", error);
}
