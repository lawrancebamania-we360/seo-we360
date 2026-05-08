// Diagnose why Ishaan can't see content despite Blog Sprint perms.
// Looks at: profile.role, project_memberships, member_permissions.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  const { data: profile } = await admin
    .from("profiles")
    .select("id, name, email, role, active_project_id")
    .eq("email", "ishaan.mathur@we360.ai")
    .single();
  console.log("\n=== profile ===");
  console.log(profile);

  if (!profile) { console.log("No profile found"); return; }

  const userId = (profile as { id: string }).id;

  const { data: memberships } = await admin
    .from("project_memberships")
    .select("project_id, projects(name)")
    .eq("user_id", userId);
  console.log("\n=== project_memberships ===");
  console.log(memberships);

  const { data: perms } = await admin
    .from("member_permissions")
    .select("section, can_view, can_add, can_edit, can_complete, can_delete, project_id")
    .eq("user_id", userId);
  console.log("\n=== member_permissions ===");
  console.table(perms);

  // Compare against everyone else's setup
  const { data: allProfiles } = await admin
    .from("profiles")
    .select("id, name, email, role")
    .order("role")
    .order("name");
  console.log("\n=== all profiles (role check) ===");
  console.table(allProfiles);

  const { data: allMemberships } = await admin
    .from("project_memberships")
    .select("user_id, project_id, profiles(name)")
    .order("user_id");
  console.log("\n=== ALL project_memberships rows ===");
  console.log(`Total rows: ${allMemberships?.length}`);
  console.table(allMemberships);
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
