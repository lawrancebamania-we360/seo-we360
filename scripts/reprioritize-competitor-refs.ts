#!/usr/bin/env tsx
// The Apify SERP scraper pulled the actual top-ranking organic URLs for each
// SP1-SP6 keyword and merged them into brief.competitor_refs. BUT the merge
// logic in enrich-blog-tasks-apify.ts puts existing refs first (the 3 generic
// ActivTrak/Teramind/Hubstaff URLs I hand-seeded). After slice(0,8) the top
// of each list is the generic stuff — and the real top-ranking competitors
// for these emerging AI categories (Productiv, BetterCloud, Glean for AI
// tools tracking; Visier, Lattice for retention; etc.) get pushed down.
//
// This script:
//   1. Inspects each SP1-SP6 brief
//   2. Splits competitor_refs into "Apify-fetched" (real top-ranking) vs
//      "hand-seeded" (the 3 generic workforce-monitoring URLs)
//   3. Re-orders: Apify-fetched first, then the 2-3 best generic as anchor
//      refs at the bottom
//   4. Caps at 8 total
//
// Output also dumps each SP's final ref list so we can sanity-check.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim());
const PID = "11111111-1111-4111-8111-000000000001";

// The 3 generic refs I seeded in the initial import. Used to detect what's
// hand-loaded vs Apify-pulled.
const HAND_SEEDED = new Set<string>([
  "https://www.activtrak.com/solutions/",
  "https://www.teramind.co/solutions/",
  "https://www.hubstaff.com/employee-monitoring",
]);

async function main() {
  for (const k of ["SP1", "SP2", "SP3", "SP4", "SP5", "SP6"]) {
    const { data } = await a
      .from("tasks")
      .select("id, title, brief")
      .eq("project_id", PID)
      .ilike("title", `%[${k}]`)
      .limit(1);
    const t = (data ?? [])[0] as { id: string; title: string; brief: Record<string, unknown> } | undefined;
    if (!t) { console.log(`  ${k}  NOT FOUND`); continue; }
    const b = (t.brief ?? {}) as { competitor_refs?: string[] } & Record<string, unknown>;
    const all = b.competitor_refs ?? [];
    const apifyFetched = all.filter((u) => !HAND_SEEDED.has(u));
    const handSeeded = all.filter((u) => HAND_SEEDED.has(u));

    // Re-prioritise: Apify-fetched first (these are the real top-ranking),
    // then 2 hand-seeded anchors as visual-style references. Cap at 8.
    const reordered = [
      ...apifyFetched.slice(0, 6),
      ...handSeeded.slice(0, 2),
    ].slice(0, 8);

    const merged = { ...b, competitor_refs: reordered };
    const { error } = await a.from("tasks").update({ brief: merged }).eq("id", t.id);
    if (error) { console.error(`  ❌ ${k}: ${error.message}`); continue; }

    console.log(`\n${k} · ${t.title.slice(0, 70)}`);
    console.log(`  Apify-fetched: ${apifyFetched.length}, hand-seeded: ${handSeeded.length}, reordered total: ${reordered.length}`);
    for (let i = 0; i < reordered.length; i++) {
      const tag = HAND_SEEDED.has(reordered[i]) ? "[seed]  " : "[apify] ";
      console.log(`  ${String(i + 1).padStart(2)}. ${tag} ${reordered[i]}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
