// Correct earlier over-broad grant. Dinesh only needs Blog Sprint view,
// not view on every section. Sets sprint=view, everything else=none.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const ALL_SECTIONS = [
  "overview", "tasks", "keywords", "competitors",
  "sprint", "seo_gaps", "wins", "articles", "team",
] as const;

(async () => {
  const { data: dinesh } = await admin
    .from("profiles")
    .select("id, name")
    .eq("email", "dinesh.neede@we360.ai")
    .single();
  if (!dinesh) { console.error("Dinesh not found"); process.exit(1); }
  const id = (dinesh as { id: string }).id;
  console.log(`Correcting ${(dinesh as { name: string }).name}'s permissions on ${PROJECT_ID}\n`);

  for (const section of ALL_SECTIONS) {
    const canView = section === "sprint";
    const { error } = await admin
      .from("member_permissions")
      .upsert(
        {
          user_id: id,
          project_id: PROJECT_ID,
          section,
          can_view: canView,
          can_add: false,
          can_edit: false,
          can_complete: false,
          can_delete: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id,section" }
      );
    if (error) console.error(`  ✗ ${section}: ${error.message}`);
    else console.log(`  ${canView ? "✓" : "·"} ${section}: ${canView ? "view" : "none"}`);
  }
  console.log("\nDone. Tell Dinesh to refresh.");
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
