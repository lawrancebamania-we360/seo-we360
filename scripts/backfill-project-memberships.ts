// One-shot backfill: every member who has member_permissions rows for a
// project but no project_memberships row gets one created. Fixes the bug
// where "Ishaan can't see anything" because the manual scripts that seeded
// the team forgot to add project_memberships rows.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  // Find every (user, project) pair that has member_permissions but no
  // matching project_memberships row.
  const { data: perms } = await admin
    .from("member_permissions")
    .select("user_id, project_id");

  const wanted = new Set<string>();
  for (const p of (perms ?? []) as Array<{ user_id: string; project_id: string }>) {
    wanted.add(`${p.user_id}::${p.project_id}`);
  }

  const { data: existing } = await admin
    .from("project_memberships")
    .select("user_id, project_id");
  const have = new Set<string>();
  for (const m of (existing ?? []) as Array<{ user_id: string; project_id: string }>) {
    have.add(`${m.user_id}::${m.project_id}`);
  }

  const missing = [...wanted].filter((k) => !have.has(k));
  console.log(`Need to insert ${missing.length} project_memberships rows.`);

  // Use the super-admin's id as `added_by` (Lawrance).
  const { data: super_ } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "super_admin")
    .limit(1)
    .single();
  const addedBy = (super_ as { id: string } | null)?.id ?? null;

  for (const key of missing) {
    const [user_id, project_id] = key.split("::");
    // Look up name for the log
    const { data: prof } = await admin
      .from("profiles")
      .select("name")
      .eq("id", user_id)
      .single();
    const name = (prof as { name: string } | null)?.name ?? "?";

    const { error } = await admin
      .from("project_memberships")
      .insert({ user_id, project_id, added_by: addedBy });
    if (error) {
      console.error(`  FAIL ${name}: ${error.message}`);
    } else {
      console.log(`  + ${name}`);
    }
  }

  console.log("\nDone.");
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
