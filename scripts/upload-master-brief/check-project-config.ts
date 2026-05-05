import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  const { data, error } = await admin
    .from("projects")
    .select("id, name, domain, gsc_property_url, ga4_property_id")
    .eq("id", "11111111-1111-4111-8111-000000000001")
    .single();
  if (error) console.error("err:", error);
  else console.log(JSON.stringify(data, null, 2));
})();
