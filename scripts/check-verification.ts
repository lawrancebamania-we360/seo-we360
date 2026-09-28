import { createAdminClient } from "@/lib/supabase/admin";

(async () => {
  const s = createAdminClient();
  const { data } = await s
    .from("tasks")
    .select("id, title, status, supporting_links, ai_verification_status, ai_verification_summary, ai_verification_id")
    .ilike("title", "%Pillar #2%Employee Monitoring%")
    .limit(3);

  console.log("Matching tasks:");
  for (const t of (data ?? []) as Array<{
    id: string; title: string; status: string;
    supporting_links: string[] | null;
    ai_verification_status: string | null;
    ai_verification_summary: string | null;
    ai_verification_id: string | null;
  }>) {
    console.log(`\nid: ${t.id}`);
    console.log(`title: ${t.title}`);
    console.log(`status: ${t.status}`);
    console.log(`supporting_links: ${JSON.stringify(t.supporting_links)}`);
    console.log(`ai_verification_status: ${t.ai_verification_status}`);
    console.log(`ai_verification_summary: ${t.ai_verification_summary}`);
    console.log(`ai_verification_id: ${t.ai_verification_id}`);

    // Now check the actual verification row(s)
    const { data: verifs } = await s
      .from("task_verifications")
      .select("id, status, source_type, source_url, trigger_status, queued_at, completed_at, retry_count, overall_score")
      .eq("task_id", t.id)
      .order("queued_at", { ascending: false })
      .limit(5);
    console.log(`Verification rows (${verifs?.length ?? 0}):`);
    for (const v of (verifs ?? []) as Array<{
      id: string; status: string; source_type: string | null; source_url: string | null;
      trigger_status: string | null; queued_at: string; completed_at: string | null;
      retry_count: number; overall_score: number | null;
    }>) {
      console.log(`  ${v.queued_at} | ${v.status} | trigger=${v.trigger_status} | src=${v.source_type} | url=${v.source_url ? v.source_url.slice(0, 60) : "null"} | retries=${v.retry_count} | score=${v.overall_score}`);
    }
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
