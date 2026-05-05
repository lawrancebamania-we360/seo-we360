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

  const rows = (data ?? []) as Array<{
    id: string; title: string;
    brief: {
      recommended_h2s?: string[];
      recommended_h3s?: string[];
      paa_questions?: string[];
      secondary_keywords?: string[];
      competitor_refs?: string[];
      writer_notes?: string[];
    } | null;
  }>;

  let total = 0, enriched = 0;
  let sumH2 = 0, sumH3 = 0, sumPaa = 0, sumSecKw = 0, sumComp = 0, sumNotes = 0;
  let countH2 = 0, countH3 = 0, countPaa = 0, countSecKw = 0, countComp = 0, countNotes = 0;
  const samples: string[] = [];

  for (const t of rows) {
    if (/^update /i.test(t.title)) continue;
    total++;
    const h2 = t.brief?.recommended_h2s?.length ?? 0;
    const h3 = t.brief?.recommended_h3s?.length ?? 0;
    const paa = t.brief?.paa_questions?.length ?? 0;
    const sec = t.brief?.secondary_keywords?.length ?? 0;
    const comp = t.brief?.competitor_refs?.length ?? 0;
    const notes = t.brief?.writer_notes?.length ?? 0;
    const isEnriched = h2 >= 3;
    if (isEnriched) {
      enriched++;
      sumH2 += h2; if (h2 > 0) countH2++;
      sumH3 += h3; if (h3 > 0) countH3++;
      sumPaa += paa; if (paa > 0) countPaa++;
      sumSecKw += sec; if (sec > 0) countSecKw++;
      sumComp += comp; if (comp > 0) countComp++;
      sumNotes += notes; if (notes > 0) countNotes++;
      if (samples.length < 3) {
        samples.push(`\n  ${t.title.slice(0, 65)}\n    H2: ${h2} | H3: ${h3} | PAA: ${paa} | secondary kw: ${sec} | competitor refs: ${comp} | writer notes: ${notes}`);
      }
    }
  }

  console.log(`\nEnriched ${enriched} / ${total} new tasks (${total - enriched} remaining)`);
  console.log(`\nField fill across enriched tasks:`);
  console.log(`  H2 sections     : ${countH2}/${enriched} populated, avg ${enriched ? (sumH2 / enriched).toFixed(1) : 0} per task`);
  console.log(`  H3 subsections  : ${countH3}/${enriched} populated, avg ${enriched ? (sumH3 / enriched).toFixed(1) : 0} per task`);
  console.log(`  PAA / FAQs      : ${countPaa}/${enriched} populated, avg ${enriched ? (sumPaa / enriched).toFixed(1) : 0} per task`);
  console.log(`  Secondary kws   : ${countSecKw}/${enriched} populated, avg ${enriched ? (sumSecKw / enriched).toFixed(1) : 0} per task`);
  console.log(`  Competitor refs : ${countComp}/${enriched} populated, avg ${enriched ? (sumComp / enriched).toFixed(1) : 0} per task`);
  console.log(`  Writer notes    : ${countNotes}/${enriched} populated, avg ${enriched ? (sumNotes / enriched).toFixed(1) : 0} per task`);
  console.log(`\nSamples:${samples.join("")}`);
})();
