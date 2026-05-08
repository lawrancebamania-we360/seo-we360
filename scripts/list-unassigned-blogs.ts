import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);
(async () => {
  const { data } = await admin
    .from("tasks")
    .select("id, title, status, scheduled_date, target_keyword")
    .eq("kind", "blog_task")
    .is("team_member_id", null)
    .order("scheduled_date");
  console.log(`Unassigned blog tasks: ${data?.length ?? 0}`);
  console.table(data);
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
