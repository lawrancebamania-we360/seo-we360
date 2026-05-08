// Assign every blog_task with team_member_id = null to Ishaan. He's the
// newest writer and had 0 tasks; the unassigned tasks are all recent
// news/trend pieces queued for May 2026 — natural onboarding workload.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  const { data: ishaan } = await admin
    .from("profiles")
    .select("id, name")
    .eq("email", "ishaan.mathur@we360.ai")
    .single();
  const ishaanId = (ishaan as { id: string; name: string } | null)?.id;
  if (!ishaanId) throw new Error("Ishaan not found");

  const { data: targets } = await admin
    .from("tasks")
    .select("id, title")
    .eq("kind", "blog_task")
    .is("team_member_id", null);

  const ids = (targets ?? []).map((t) => (t as { id: string }).id);
  if (ids.length === 0) {
    console.log("No unassigned tasks to update.");
    return;
  }

  const { error } = await admin
    .from("tasks")
    .update({ team_member_id: ishaanId })
    .in("id", ids);
  if (error) throw error;

  console.log(`Assigned ${ids.length} blog tasks to Ishaan:`);
  for (const t of (targets ?? []) as Array<{ id: string; title: string }>) {
    console.log(`  - ${t.title}`);
  }
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
