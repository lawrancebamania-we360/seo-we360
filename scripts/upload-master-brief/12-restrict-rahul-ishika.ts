#!/usr/bin/env tsx
/**
 * One-shot: revoke Rahul + Ishika's access to Overview, Web Tasks, Competitors,
 * and Blog Audit (the user wants them focused on Timeline / Keywords / Blog
 * Sprint only). Lokesh keeps full access.
 *
 * Mapping (DB section → nav route):
 *   overview     → /dashboard/overview
 *   tasks        → /dashboard/tasks       (Web Tasks)
 *   competitors  → /dashboard/competitors
 *   seo_gaps     → /dashboard/blog-audit  (closest existing section)
 *
 * Their other permissions (sprint, keywords) are LEFT untouched — this script
 * only flips can_view to false for the four restricted sections.
 *
 * Usage:
 *   npx tsx scripts/upload-master-brief/12-restrict-rahul-ishika.ts            # dry run
 *   npx tsx scripts/upload-master-brief/12-restrict-rahul-ishika.ts --execute  # apply
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const EXECUTE = process.argv.includes("--execute");

const TARGET_EMAILS = ["rahul.deswal@we360.ai", "ishika.takhtani@we360.ai"];
const REVOKE_SECTIONS = ["overview", "tasks", "competitors", "seo_gaps"] as const;

async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);

  // Resolve user IDs from emails
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, email")
    .in("email", TARGET_EMAILS);

  if (!profiles || profiles.length === 0) {
    console.error("No matching profiles found.");
    process.exit(1);
  }

  for (const profile of profiles) {
    console.log(`--- ${profile.name} <${profile.email}> ---`);
    for (const section of REVOKE_SECTIONS) {
      const row = {
        user_id: profile.id,
        project_id: PROJECT_ID,
        section,
        can_view: false,
        can_add: false,
        can_edit: false,
        can_complete: false,
        can_delete: false,
        updated_at: new Date().toISOString(),
      };
      console.log(`  ${section.padEnd(12)} → can_view=false`);
      if (EXECUTE) {
        const { error } = await admin
          .from("member_permissions")
          .upsert(row, { onConflict: "user_id,project_id,section" });
        if (error) console.error(`    ✗ ${error.message}`);
      }
    }
    console.log();
  }

  if (!EXECUTE) console.log("(Dry run — re-run with --execute to apply)");
  else console.log("✅ Permissions updated. Rahul + Ishika now see only: Timeline, Keywords, Blog Sprint.");
}
main().catch((e) => { console.error(e); process.exit(1); });
