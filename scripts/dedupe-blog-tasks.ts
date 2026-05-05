#!/usr/bin/env tsx
/**
 * After importing the 100K plan we have 126 blog tasks in the DB but the
 * import only inserted 77 — the other ~49 are pre-existing tasks that duplicate
 * the new plan (e.g. "we360 vs Hubstaff" from earlier Apify runs).
 *
 * This script:
 *   1. Lists every blog task NOT prefixed with `[B...]` (the new-plan key)
 *   2. For each, tries to match it to a new-plan task by target_keyword OR
 *      keyword overlap in title — if matched, prints "DUPE -> delete pre-existing,
 *      keep new"
 *   3. For items that don't match anything in the new plan, prints "ORPHAN" so
 *      the user can decide
 *   4. With --execute flag, deletes the matched dupes
 *
 * Default is dry-run.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

const EXECUTE = process.argv.includes("--execute");

// Normalize a string for comparison: lowercase, strip punctuation, collapse spaces
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

interface TaskRow {
  id: string;
  title: string;
  target_keyword: string | null;
  scheduled_date: string | null;
  status: string;
  created_at: string;
}

async function main() {
  const { data, error } = await admin
    .from("tasks")
    .select("id, title, target_keyword, scheduled_date, status, created_at")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task")
    .order("created_at", { ascending: true });
  if (error) { console.error(error); process.exit(1); }
  const all = (data ?? []) as TaskRow[];

  // Split into "new plan" (has [B...] or [K...] prefix) and "legacy"
  const newPlan = all.filter((t) => /^\[[BK][0-9.\-A-Za-z]+\]/.test(t.title));
  const legacy = all.filter((t) => !/^\[[BK][0-9.\-A-Za-z]+\]/.test(t.title));

  console.log(`\nTotal blog tasks: ${all.length}`);
  console.log(`  - New plan (prefixed [B/K…]): ${newPlan.length}`);
  console.log(`  - Legacy (pre-existing): ${legacy.length}\n`);

  // Build lookups for new-plan tasks
  const newByKw = new Map<string, TaskRow>();
  const newBySlug = new Map<string, TaskRow>();   // /vs/<slug>, /alternative/<slug>, /integrations/<slug>, /industries/<slug>, /in/<slug>
  for (const t of newPlan) {
    if (t.target_keyword) newByKw.set(normalize(t.target_keyword), t);
    // Pull slug out of title via regex on `/<scope>/<slug>`
    const slugMatch = t.title.match(/\/(vs|alternative|integrations|industries|in)\/([a-z0-9-]+)/);
    if (slugMatch) newBySlug.set(`${slugMatch[1]}/${slugMatch[2]}`, t);
  }

  // Helper: pull slug from a legacy title like "Write integration page: slack"
  // or "Write industry page: industries/it-services"
  function legacySlug(title: string): { scope: string; slug: string } | null {
    let m = title.match(/(vs-competitor|alternative-to|integration|industry|India)\s*page:\s*([a-z0-9\-/]+)/i);
    if (!m) return null;
    const kind = m[1].toLowerCase();
    const raw = m[2].replace(/^industries\//, ""); // strip leading "industries/" if present
    if (kind === "vs-competitor") return { scope: "vs", slug: raw };
    if (kind === "alternative-to") return { scope: "alternative", slug: raw.replace(/-alternative$/, "-alternative") };
    if (kind === "integration") return { scope: "integrations", slug: raw };
    if (kind === "industry") return { scope: "industries", slug: raw };
    if (kind === "india") return { scope: "in", slug: raw };
    return null;
  }

  // Industry slug aliases — map legacy variants to plan slugs
  const industryAliases: Record<string, string> = {
    "bpo-kpo": "bpo",
    "banking-finance": "banking",
    "it-services": "it-services",
    "healthcare": "healthcare",
    "manufacturing": "manufacturing",
    "agencies": "agencies",
    "edtech": "edtech",
    "insurance": "insurance",
    "saas": "saas",
    "retail": "retail",
  };

  // For each legacy task, try to match by target_keyword, then by title kw, then by slug
  const dupes: TaskRow[] = [];
  const orphans: TaskRow[] = [];
  for (const l of legacy) {
    let match: TaskRow | undefined;
    if (l.target_keyword) {
      match = newByKw.get(normalize(l.target_keyword));
    }
    if (!match) {
      const lt = normalize(l.title);
      for (const [kw, np] of newByKw.entries()) {
        if (kw.length < 8) continue;
        if (lt.includes(kw)) { match = np; break; }
      }
    }
    if (!match) {
      // Slug-based match: /vs/we360-vs-hubstaff, /integrations/slack, etc.
      const ls = legacySlug(l.title);
      if (ls) {
        let slug = ls.slug;
        if (ls.scope === "industries") slug = industryAliases[slug] ?? slug;
        match = newBySlug.get(`${ls.scope}/${slug}`);
        // For alternatives, the legacy might use "<comp>-alternative" while the plan uses same
        if (!match && ls.scope === "alternative") {
          match = newBySlug.get(`alternative/${slug}`);
        }
      }
    }
    if (match) {
      dupes.push(l);
      console.log(`DUPE     "${l.title}" (kw=${l.target_keyword ?? "—"})\n         → matches "${match.title}"\n`);
    } else {
      orphans.push(l);
    }
  }

  console.log(`\n${dupes.length} duplicates found, ${orphans.length} orphans (no match in new plan)\n`);

  if (orphans.length > 0) {
    console.log("ORPHANS (kept regardless — review manually):");
    for (const o of orphans) {
      console.log(`  - "${o.title}" (kw=${o.target_keyword ?? "—"}, status=${o.status}, date=${o.scheduled_date ?? "—"})`);
    }
    console.log();
  }

  if (!EXECUTE) {
    console.log("DRY RUN — pass --execute to delete the duplicates.");
    return;
  }

  if (dupes.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // Before deleting, MIGRATE any human-set fields from the legacy task to the
  // new task: assignee, status (if not 'todo'), supporting_links, reference_images,
  // brief (if richer than the new one).
  let migratedFields = 0;
  for (const l of dupes) {
    const { data: legacyFull } = await admin
      .from("tasks")
      .select("team_member_id, status, supporting_links, reference_images, brief, article_id, completed_at, done")
      .eq("id", l.id)
      .single();
    if (!legacyFull) continue;
    const matchKw = l.target_keyword ? normalize(l.target_keyword) : null;
    const newTask = matchKw ? newByKw.get(matchKw) : undefined;
    if (!newTask) continue;
    const patch: Record<string, unknown> = {};
    if (legacyFull.team_member_id) patch.team_member_id = legacyFull.team_member_id;
    if (legacyFull.status && legacyFull.status !== "todo") {
      patch.status = legacyFull.status;
      patch.done = legacyFull.done;
      patch.completed_at = legacyFull.completed_at;
    }
    if (legacyFull.supporting_links?.length) patch.supporting_links = legacyFull.supporting_links;
    if (legacyFull.reference_images?.length) patch.reference_images = legacyFull.reference_images;
    if (legacyFull.article_id) patch.article_id = legacyFull.article_id;
    if (Object.keys(patch).length > 0) {
      await admin.from("tasks").update(patch).eq("id", newTask.id);
      migratedFields++;
    }
  }

  // Delete the dupes
  const dupeIds = dupes.map((d) => d.id);
  const { error: delErr } = await admin.from("tasks").delete().in("id", dupeIds);
  if (delErr) { console.error(delErr); process.exit(1); }
  console.log(`✅ Deleted ${dupes.length} duplicate blog tasks (migrated fields from ${migratedFields} of them first).`);

  const { count } = await admin.from("tasks").select("*", { count: "exact", head: true }).eq("project_id", PROJECT_ID).eq("kind", "blog_task");
  console.log(`Final blog task count: ${count}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
