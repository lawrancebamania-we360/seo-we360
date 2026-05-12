import { createAdminClient } from "@/lib/supabase/admin";

(async () => {
  const s = createAdminClient();
  const { count: urlCount } = await s.from("url_metrics_latest").select("*", { count: "exact", head: true });
  const { data: runs } = await s.from("url_metrics_runs").select("*").order("started_at", { ascending: false }).limit(3);
  console.log("URLs in latest view:", urlCount);
  console.log("Recent runs:");
  for (const r of runs ?? []) {
    console.log(`  ${r.started_at} -> ${r.finished_at ?? "(running)"} | status=${r.status} | urls=${r.urls_synced ?? "?"} | errors=${r.errors_count ?? 0}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
