#!/usr/bin/env tsx
/**
 * Phase 2: Add Lokesh, Ishika, Rahul as team members in Supabase.
 *
 *   - Creates auth.users entries (idempotent — skips if email already exists)
 *   - The handle_new_user trigger auto-creates the profiles row with role='member'
 *   - Inserts project_memberships for the we360.ai project
 *   - Inserts member_permissions: can_view + can_add + can_edit + can_complete = true
 *     for every section. can_delete = false (per user direction).
 *
 * Idempotent — safe to re-run. Existing users / memberships / permissions are skipped.
 *
 * Usage:
 *   npx tsx scripts/upload-master-brief/02-add-team-members.ts                  # dry run
 *   npx tsx scripts/upload-master-brief/02-add-team-members.ts --execute        # actually write
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());

const EXECUTE = process.argv.includes("--execute");

const TEAM = [
  { name: "Lokesh",  email: "lokesh.kumar@we360.ai" },
  { name: "Ishika",  email: "ishika.takhtani@we360.ai" },
  { name: "Rahul",   email: "rahul.deswal@we360.ai" },
];

const SECTIONS = [
  "overview", "tasks", "seo_gaps", "keywords", "technical",
  "competitors", "sprint", "wins", "articles", "team",
] as const;

async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE (will write to DB)" : "DRY RUN (read-only)"}\n`);

  // 1. Resolve project_id for we360.ai
  const { data: projects, error: pErr } = await admin
    .from("projects")
    .select("id, name, domain")
    .eq("domain", "we360.ai")
    .limit(1);
  if (pErr) { console.error("Error reading projects:", pErr); process.exit(1); }
  if (!projects?.length) {
    console.error("No project with domain='we360.ai' found. Run the seed migration first.");
    process.exit(1);
  }
  const project = projects[0];
  console.log(`Project: ${project.name} (${project.id})\n`);

  for (const member of TEAM) {
    console.log(`--- ${member.name} <${member.email}> ---`);

    // 2. Check if auth user already exists
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existing = existingUsers?.users.find((u) => u.email?.toLowerCase() === member.email.toLowerCase());

    let userId: string;
    if (existing) {
      console.log(`  ✓ auth user already exists (${existing.id})`);
      userId = existing.id;
    } else {
      console.log(`  + creating auth user...`);
      if (!EXECUTE) { console.log(`    [dry-run] would call auth.admin.createUser`); continue; }
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: member.email,
        email_confirm: true,                 // mark verified so they can sign in immediately
        user_metadata: { name: member.name },
      });
      if (cErr) { console.error(`  ✗ createUser failed:`, cErr.message); continue; }
      userId = created.user!.id;
      console.log(`    created user ${userId}`);
    }

    // 3. Ensure profile row exists (the trigger should have created it, but be safe)
    const { data: profile } = await admin
      .from("profiles")
      .select("id, name, role")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      console.log(`  + profile row missing — inserting`);
      if (EXECUTE) {
        const { error: prErr } = await admin
          .from("profiles")
          .insert({ id: userId, email: member.email, name: member.name, role: "member" });
        if (prErr) console.error(`  ✗ profile insert:`, prErr.message);
      }
    } else {
      // Backfill name if blank or differs
      if (profile.name !== member.name) {
        console.log(`  ~ updating name: "${profile.name}" → "${member.name}"`);
        if (EXECUTE) {
          await admin.from("profiles").update({ name: member.name }).eq("id", userId);
        }
      } else {
        console.log(`  ✓ profile already exists, role=${profile.role}`);
      }
    }

    // 4. Project membership (upsert)
    const { data: existingMembership } = await admin
      .from("project_memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("project_id", project.id)
      .maybeSingle();
    if (existingMembership) {
      console.log(`  ✓ project membership already exists`);
    } else {
      console.log(`  + adding project membership`);
      if (EXECUTE) {
        const { error: mErr } = await admin
          .from("project_memberships")
          .insert({ user_id: userId, project_id: project.id });
        if (mErr) console.error(`  ✗ membership insert:`, mErr.message);
      }
    }

    // 5. Permissions for every section (all-but-delete)
    let added = 0, updated = 0, unchanged = 0;
    for (const section of SECTIONS) {
      const { data: existingPerm } = await admin
        .from("member_permissions")
        .select("id, can_view, can_add, can_edit, can_complete, can_delete")
        .eq("user_id", userId)
        .eq("project_id", project.id)
        .eq("section", section)
        .maybeSingle();

      const want = { can_view: true, can_add: true, can_edit: true, can_complete: true, can_delete: false };

      if (existingPerm) {
        const same = existingPerm.can_view === want.can_view
          && existingPerm.can_add === want.can_add
          && existingPerm.can_edit === want.can_edit
          && existingPerm.can_complete === want.can_complete
          && existingPerm.can_delete === want.can_delete;
        if (same) { unchanged++; continue; }
        if (EXECUTE) {
          await admin.from("member_permissions").update(want).eq("id", existingPerm.id);
        }
        updated++;
      } else {
        if (EXECUTE) {
          await admin.from("member_permissions").insert({
            user_id: userId, project_id: project.id, section, ...want,
          });
        }
        added++;
      }
    }
    console.log(`  permissions: ${added} added, ${updated} updated, ${unchanged} unchanged`);
    console.log();
  }

  if (!EXECUTE) console.log("\n(Dry run — re-run with --execute to apply)\n");
  else console.log("\n✅ Team members ready.\n");
}
main().catch((e) => { console.error(e); process.exit(1); });
