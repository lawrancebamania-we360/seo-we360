#!/usr/bin/env tsx
// SEO Gaps page is being removed from the dashboard. The audit_findings table
// has 284 non-OK rows but 283 of them are already represented in the existing
// 17 PSI web_tasks (redirects, unused-js, unused-css, etc.). The only
// uncovered finding is `speed::unminified-javascript` (1 page). This script
// adds that one as a web_task so we have 100% coverage before deleting the
// SEO Gaps UI.
//
// Idempotent — bails if the task already exists.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

const LEFTOVER_TITLE = "PSI · Minify the lone unminified JS file (cleanup)";

async function main() {
  // Resolve a creator (first super_admin / platform_admin)
  const { data: prof } = await admin
    .from("profiles")
    .select("id")
    .or("platform_admin.eq.true,role.eq.super_admin,role.eq.admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const superAdminId = (prof as { id?: string } | null)?.id ?? null;
  if (!superAdminId) { console.error("No admin profile found"); process.exit(1); }

  // Skip if already inserted
  const { data: existing } = await admin
    .from("tasks")
    .select("id")
    .eq("project_id", PROJECT_ID)
    .eq("title", LEFTOVER_TITLE)
    .maybeSingle();
  if (existing) {
    console.log("Already inserted, skipping.");
    return;
  }

  // Pull the affected page so we can include it in the task
  const { data: rows } = await admin
    .from("audit_findings")
    .select("url, message, details")
    .eq("project_id", PROJECT_ID)
    .eq("skill", "speed")
    .eq("check_name", "unminified-javascript");
  const urls = [...new Set((rows ?? []).map((r: { url: string }) => r.url))];

  if (urls.length === 0) {
    console.log("No unminified-javascript findings — nothing to migrate.");
    return;
  }

  await admin.from("tasks").insert({
    project_id: PROJECT_ID,
    title: LEFTOVER_TITLE,
    kind: "web_task",
    priority: "low",
    pillar: "SXO",
    source: "manual",
    scheduled_date: "2026-05-11",
    status: "todo",
    issue: `PSI flags one JS file as unminified on ${urls.length} page${urls.length === 1 ? "" : "s"}. Tiny win individually but easy to close out so the SEO Gaps backlog is empty.`,
    impl: `Affected page${urls.length === 1 ? "" : "s"}:\n${urls.map((u) => `  - ${u}`).join("\n")}\n\n1. Identify the offending JS file via DevTools → Network on the page above.\n2. If it's a Webflow-bundled file, check Project Settings → Advanced → ensure JS minification is ON.\n3. If it's a 3rd-party include (HubSpot, Clarity, GTM, etc.), there's nothing to do — third-party hosts control their own minification.\n4. If it's a custom script in site-wide head, swap to a minified version.\n\nTEST 1: PSI re-run on the affected page — \`unminified-javascript\` opportunity should be gone or under the threshold.\nTEST 2: Site behaviour unchanged.\nEXPECTED: 1 PSI opportunity cleared, ~5–20ms FCP saved (nominal).`,
    created_by: superAdminId,
  });

  console.log(`✅ Inserted "${LEFTOVER_TITLE}" — covers ${urls.length} page(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
