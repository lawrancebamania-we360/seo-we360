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
    .select("id, title, brief")
    .eq("project_id", "11111111-1111-4111-8111-000000000001")
    .eq("kind", "blog_task");

  let total = 0, enriched = 0;
  const enrichedSamples: string[] = [];
  for (const t of (data ?? []) as Array<{ id: string; title: string; brief: { recommended_h2s?: string[] } | null }>) {
    if (/^update /i.test(t.title)) continue;
    total++;
    const h2s = t.brief?.recommended_h2s ?? [];
    if (h2s.length >= 3) {
      enriched++;
      if (enrichedSamples.length < 5) enrichedSamples.push(`${t.title.slice(0, 60)} → ${h2s.length} H2s`);
    }
  }
  console.log(`Enriched: ${enriched} / ${total} new tasks (${total - enriched} remaining)`);
  for (const s of enrichedSamples) console.log(`  ✓ ${s}`);
})();
