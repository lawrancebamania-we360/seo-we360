import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);
(async () => {
  const { data, error } = await admin
    .from("tasks")
    .select("id, status, reviewed_by_id, reviewed_at")
    .eq("kind", "blog_task")
    .eq("status", "review")
    .limit(1);
  console.log("Done-column sample:");
  if (error) console.log("  ERROR:", error.message);
  else console.log(JSON.stringify(data, null, 2));
})().catch((e) => { console.error("Crash:", e.message); process.exit(1); });
