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
    .select("id, title, url")
    .eq("project_id", "11111111-1111-4111-8111-000000000001")
    .eq("kind", "blog_task")
    .ilike("title", "Update %")
    .not("url", "is", null);

  const rows = (data ?? []) as Array<{ id: string; title: string; url: string }>;
  console.log(`${rows.length} update tasks with URLs\n`);
  for (const r of rows) {
    const path = (() => { try { return new URL(r.url).pathname; } catch { return r.url; } })();
    console.log(`${r.id.slice(0, 8)}\t${path}\t${r.title.slice(0, 60)}`);
  }
})();
