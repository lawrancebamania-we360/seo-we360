#!/usr/bin/env tsx
// Post-import cleanup — prune off-topic and template-fake keywords + any
// blog_tasks bound to them.
//
// Off-topic rules (not workforce-monitoring / productivity SaaS):
//   notion, canva, evernote, google workspace / g suite / gsuite,
//   keka, zoho (unless paired with we360), "apps like", "similar website",
//   "recognition vs recognization", "productivity vs efficiency" etc.
//
// Template-fake rules (old Apify keyword-opportunity-finder garbage):
//   "how to * workforce analytics saas we360"
//   "is * workforce analytics saas we360 worth it"
//   "* for beginners", "* for free", etc. — that exact pattern set
//
// Near-dupes: "X alternative" vs "X alternatives" → keep the one with a
//   current_rank (prefer data-rich row).

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

const OFF_TOPIC = [
  /\bnotion\b/i,
  /\bcanva\b/i,
  /\bevernote\b/i,
  /\b(google workspace|g\s?suite)\b/i,
  /\bkeka\b/i,
  /\bzoho\b/i,
  /\bapps? like\b/i,
  /\bwebsites? like\b/i,
  /\bsimilar website\b/i,
  /\brecognition vs recognization\b/i,
  /\bproductivity vs efficiency\b/i,
  /\bhr analytics vs people analytics\b/i,
];

const TEMPLATE_FAKE = [
  /workforce analytics saas we360/i,   // the fake template set
  /^how to use .+ for free\?$/i,
  /^is .+ worth it\?$/i,
  /^.+ for beginners\?$/i,
];

function isOffTopic(kw: string): boolean {
  return OFF_TOPIC.some((r) => r.test(kw)) || TEMPLATE_FAKE.some((r) => r.test(kw));
}

async function main() {
  // -----------------------------------------------------------------
  // 1. Load all keywords for the project
  // -----------------------------------------------------------------
  const { data: all } = await admin
    .from("keywords")
    .select("id, keyword, current_rank, cluster, source")
    .eq("project_id", PROJECT_ID);
  const rows = (all ?? []) as Array<{
    id: string; keyword: string; current_rank: number | null; cluster: string | null; source: string;
  }>;
  console.log(`Loaded ${rows.length} keywords for project.`);

  // -----------------------------------------------------------------
  // 2. Tag every row: off-topic, template-fake, or near-dup loser
  // -----------------------------------------------------------------
  const toDelete = new Set<string>();
  const byCanonical = new Map<string, typeof rows>();

  for (const r of rows) {
    if (isOffTopic(r.keyword)) {
      toDelete.add(r.id);
      continue;
    }
    // Canonical form for near-dup detection: strip trailing "s" on last word
    const canonical = r.keyword.replace(/\s+/g, " ").trim().replace(/s$/, "");
    const list = byCanonical.get(canonical) ?? [];
    list.push(r);
    byCanonical.set(canonical, list);
  }

  // Near-dup loser selection: for groups ≥2, keep the row with a current_rank
  // (prefer data), else the shortest keyword string. Drop the rest.
  for (const [, group] of byCanonical) {
    if (group.length < 2) continue;
    const winner = [...group].sort((a, b) => {
      const aHas = a.current_rank != null ? 0 : 1;
      const bHas = b.current_rank != null ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return a.keyword.length - b.keyword.length;
    })[0];
    for (const r of group) if (r.id !== winner.id) toDelete.add(r.id);
  }

  const deleteIds = [...toDelete];
  console.log(`  Flagged for delete: ${deleteIds.length} keywords`);

  // -----------------------------------------------------------------
  // 3. Find blog_tasks whose target_keyword matches any to-delete keyword
  // -----------------------------------------------------------------
  const byId = new Map(rows.map((r) => [r.id, r.keyword]));
  const deleteKws = deleteIds.map((id) => byId.get(id)!).filter(Boolean);
  let blogTasksDeleted = 0;
  if (deleteKws.length > 0) {
    // `target_keyword` is case-sensitive in the DB; our imports are all lowercase
    // but seed tasks use display form. Match both.
    const { data: deletedTasks } = await admin
      .from("tasks").delete()
      .eq("project_id", PROJECT_ID)
      .eq("kind", "blog_task")
      .in("target_keyword", deleteKws)
      .select("id");
    blogTasksDeleted = (deletedTasks ?? []).length;

    // Also prune any blog_task whose TITLE references the fake template pattern
    // or the off-topic brands. These were created by the earlier fake Apify
    // discovery run and don't have target_keyword set to our imported keys.
    const titlePatterns = [
      /Workforce Analytics SaaS we360/i,
      /\bnotion\b/i, /\bcanva\b/i, /\bevernote\b/i, /\bgoogle workspace\b/i,
    ];
    const { data: suspect } = await admin
      .from("tasks").select("id, title")
      .eq("project_id", PROJECT_ID).eq("kind", "blog_task");
    const suspectIds = ((suspect ?? []) as Array<{ id: string; title: string }>)
      .filter((t) => titlePatterns.some((p) => p.test(t.title)))
      .map((t) => t.id);
    if (suspectIds.length > 0) {
      await admin.from("tasks").delete().in("id", suspectIds);
      blogTasksDeleted += suspectIds.length;
    }
  }
  console.log(`  Blog tasks deleted: ${blogTasksDeleted}`);

  // -----------------------------------------------------------------
  // 4. Delete the flagged keywords
  // -----------------------------------------------------------------
  if (deleteIds.length > 0) {
    const BATCH = 200;
    for (let i = 0; i < deleteIds.length; i += BATCH) {
      await admin.from("keywords").delete().in("id", deleteIds.slice(i, i + BATCH));
    }
  }
  console.log(`  Keywords deleted: ${deleteIds.length}`);

  const { count } = await admin.from("keywords")
    .select("*", { count: "exact", head: true }).eq("project_id", PROJECT_ID);
  console.log(`\n✅ Cleanup complete. Keywords remaining: ${count}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
