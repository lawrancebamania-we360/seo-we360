import { createAdminClient } from "@/lib/supabase/admin";

(async () => {
  const s = createAdminClient();
  const { data } = await s
    .from("task_verifications")
    .select("status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("Latest verification rows:");
  for (const r of (data ?? []) as Array<{ status: string; created_at: string }>) {
    console.log(`  ${r.created_at} | ${r.status}`);
  }
  const { count } = await s.from("task_verifications").select("*", { count: "exact", head: true });
  console.log(`Total rows: ${count}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
