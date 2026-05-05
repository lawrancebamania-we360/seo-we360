import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  // Found via Chrome auth as lawrance.bamania@we360.ai:
  // - GSC: URL-prefix property "https://we360.ai/"
  // - GA4: property id 273620287 (account 179648190)
  const { error } = await admin
    .from("projects")
    .update({
      gsc_property_url: "https://we360.ai/",
      ga4_property_id: "273620287",
      updated_at: new Date().toISOString(),
    })
    .eq("id", "11111111-1111-4111-8111-000000000001");
  if (error) { console.error("✗", error.message); process.exit(1); }

  const { data } = await admin
    .from("projects")
    .select("name, domain, gsc_property_url, ga4_property_id")
    .eq("id", "11111111-1111-4111-8111-000000000001")
    .single();
  console.log("✓ Project updated:");
  console.log(JSON.stringify(data, null, 2));
})();
