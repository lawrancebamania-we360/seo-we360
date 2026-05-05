#!/usr/bin/env tsx
// Quick inspection: what SEO Gaps data lives in this project?
// Used to decide how to bucket findings into web_task vs blog_task before
// running migrate-seo-gaps-to-tasks.ts.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

async function main() {
  console.log("\n=== AUDIT FINDINGS ===\n");

  const { data, error } = await admin
    .from("audit_findings")
    .select("skill, check_name, status, priority, pillar, url, message")
    .eq("project_id", PROJECT_ID)
    .neq("status", "ok");

  if (error) { console.error(error); process.exit(1); }
  const rows = (data ?? []) as Array<{
    skill: string; check_name: string; status: string;
    priority: string | null; pillar: string | null;
    url: string; message: string | null;
  }>;
  console.log(`Total non-OK findings: ${rows.length}\n`);

  // Skill distribution
  const bySkill = new Map<string, number>();
  for (const r of rows) bySkill.set(r.skill, (bySkill.get(r.skill) ?? 0) + 1);
  console.log("Findings by skill:");
  for (const [k, v] of [...bySkill.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }

  console.log("\nFindings by (skill, check_name) — top 30:");
  const byPair = new Map<string, { count: number; urls: Set<string>; sample: string | null; priority: string | null; pillar: string | null }>();
  for (const r of rows) {
    const key = `${r.skill}::${r.check_name}`;
    const e = byPair.get(key) ?? { count: 0, urls: new Set(), sample: r.message, priority: r.priority, pillar: r.pillar };
    e.count++;
    e.urls.add(r.url);
    byPair.set(key, e);
  }
  const pairs = [...byPair.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [k, v] of pairs.slice(0, 30)) {
    console.log(`  ${k.padEnd(60)} ${String(v.count).padStart(4)} findings · ${v.urls.size} urls · pri=${v.priority ?? "-"} pillar=${v.pillar ?? "-"}`);
  }

  console.log("\n=== SEO_GAPS LEGACY ROWS ===\n");
  const { count: gapCount } = await admin
    .from("seo_gaps")
    .select("*", { count: "exact", head: true })
    .eq("project_id", PROJECT_ID);
  console.log(`Total seo_gaps rows: ${gapCount}`);

  // Sample some legacy status counts
  const { data: gaps } = await admin
    .from("seo_gaps")
    .select("title_status, meta_status, h1_status, canonical_status, og_status, schema_status, robots_status, images_status")
    .eq("project_id", PROJECT_ID);
  type GapRow = Record<string, "ok" | "warn" | "fail" | "missing" | null>;
  const cols = ["title_status", "meta_status", "h1_status", "canonical_status", "og_status", "schema_status", "robots_status", "images_status"];
  console.log("\nLegacy 8-check failures (fail+missing per col):");
  for (const c of cols) {
    const failed = (gaps ?? []).filter((g: GapRow) => g[c] === "fail" || g[c] === "missing").length;
    console.log(`  ${c.padEnd(20)} ${failed}`);
  }

  console.log("\n=== EXISTING PSI TASKS (to avoid duplicates) ===\n");
  const { data: tasks } = await admin
    .from("tasks")
    .select("title")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "web_task")
    .ilike("title", "PSI · %");
  console.log(`PSI tasks already in db: ${(tasks ?? []).length}`);
  for (const t of (tasks ?? []) as Array<{ title: string }>) {
    console.log(`  - ${t.title}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
