// Grant Dinesh (the developer) view access on every section of the
// we360.ai project. Dev needs to inspect what the team sees across all
// dashboards, but doesn't need edit/delete rights on content sections.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const SECTIONS = [
  "overview", "tasks", "keywords", "competitors",
  "sprint", "seo_gaps", "wins", "articles", "team",
] as const;

(async () => {
  const { data: dinesh } = await admin
    .from("profiles")
    .select("id, name")
    .eq("email", "dinesh.neede@we360.ai")
    .single();
  if (!dinesh) {
    console.error("Dinesh not found");
    process.exit(1);
  }
  const id = (dinesh as { id: string; name: string }).id;
  const name = (dinesh as { id: string; name: string }).name;
  console.log(`Granting view-everything to ${name} (${id}) on project ${PROJECT_ID}\n`);

  // Make sure he's a project member so getUserContext surfaces the project.
  await admin
    .from("project_memberships")
    .upsert(
      { user_id: id, project_id: PROJECT_ID },
      { onConflict: "user_id,project_id" }
    );

  // Set view-only across every section. He's the developer — he inspects,
  // he doesn't write content. Keeps add/edit/delete off.
  for (const section of SECTIONS) {
    const { error } = await admin
      .from("member_permissions")
      .upsert(
        {
          user_id: id,
          project_id: PROJECT_ID,
          section,
          can_view: true,
          can_add: false,
          can_edit: false,
          can_complete: false,
          can_delete: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id,section" }
      );
    if (error) console.error(`  ✗ ${section}: ${error.message}`);
    else console.log(`  ✓ ${section}: view`);
  }

  console.log("\nDone. Ask Dinesh to refresh his dashboard.");
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
