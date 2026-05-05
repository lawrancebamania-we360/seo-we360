import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  // Show one fully enriched task and one partially enriched
  const { data } = await admin
    .from("tasks")
    .select("id, title, target_keyword, brief")
    .eq("project_id", "11111111-1111-4111-8111-000000000001")
    .eq("kind", "blog_task")
    .ilike("title", "Employee Monitoring Software%")
    .limit(2);

  for (const t of (data ?? []) as Array<{ id: string; title: string; target_keyword: string; brief: any }>) {
    console.log(`\n=== ${t.title} (kw: ${t.target_keyword}) ===`);
    console.log(`H2 (${t.brief?.recommended_h2s?.length ?? 0}):`, JSON.stringify(t.brief?.recommended_h2s?.slice(0, 5) ?? []));
    console.log(`H3 (${t.brief?.recommended_h3s?.length ?? 0}):`, JSON.stringify(t.brief?.recommended_h3s?.slice(0, 5) ?? []));
    console.log(`PAA (${t.brief?.paa_questions?.length ?? 0}):`, JSON.stringify(t.brief?.paa_questions?.slice(0, 5) ?? []));
    console.log(`Sec KW (${t.brief?.secondary_keywords?.length ?? 0}):`, JSON.stringify(t.brief?.secondary_keywords?.slice(0, 5) ?? []));
    console.log(`Comp (${t.brief?.competitor_refs?.length ?? 0}):`, JSON.stringify(t.brief?.competitor_refs?.slice(0, 5) ?? []));
    console.log(`Notes (${t.brief?.writer_notes?.length ?? 0}):`, JSON.stringify(t.brief?.writer_notes?.slice(0, 4) ?? []));
  }
})();
