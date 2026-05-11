import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim());
(async () => {
  const { data, count } = await a
    .from("url_metrics_latest")
    .select("url, period, gsc_clicks, gsc_impressions, ga_sessions", { count: "exact" })
    .order("gsc_clicks", { ascending: false })
    .limit(10);
  console.log(`url_metrics_latest has ${count} rows\n`);
  console.table(data);
})();
