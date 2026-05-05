import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
  );
  const { data } = await admin.from("integrations").select("config").eq("provider", "apify").is("project_id", null).maybeSingle();
  const token = (data?.config as Record<string, string> | null)?.api_token!;
  const kws = ["hubstaff alternative", "time doctor alternative", "activtrak alternatives"];
  console.log("Testing clearpath/google-ai-overview…");
  const res = await fetch(`https://api.apify.com/v2/acts/clearpath~google-ai-overview/run-sync-get-dataset-items?token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ queries: kws, country: "IN" }),
    signal: AbortSignal.timeout(90000),
  });
  console.log(`HTTP ${res.status}`);
  const body = await res.text();
  if (!res.ok) { console.error(body.slice(0, 800)); return; }
  const items = JSON.parse(body) as Array<Record<string, unknown>>;
  console.log(`Items: ${items.length}`);
  if (items[0]) {
    console.log("Keys:", Object.keys(items[0]));
    console.log("Sample:", JSON.stringify(items[0], null, 2).slice(0, 1500));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
