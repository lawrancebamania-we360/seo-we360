// List all queued verifications. Output: JSON array of
// { id, task_id, task_title, target_keyword, source_url, retry_count }
// Used by the local skill at the start of a daily run.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  // Pull queued + previously-failed-but-retryable rows so the next-window
  // retry policy works automatically. Cap retries at 3.
  const { data, error } = await admin
    .from("task_verifications")
    .select(`
      id, task_id, status, retry_count, source_url, source_type,
      tasks!inner (title, target_keyword)
    `)
    .or("status.eq.queued,and(status.eq.failed,retry_count.lt.3)")
    .order("queued_at", { ascending: true })
    .limit(50);
  if (error) {
    console.error("Query failed:", error);
    process.exit(1);
  }

  type Row = {
    id: string; task_id: string; status: string; retry_count: number;
    source_url: string | null; source_type: string | null;
    tasks: { title: string; target_keyword: string | null };
  };
  const out = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    task_id: r.task_id,
    title: r.tasks.title,
    target_keyword: r.tasks.target_keyword,
    source_type: r.source_type,
    source_url: r.source_url,
    retry_count: r.retry_count,
    status: r.status,
  }));

  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
