import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
  );
  const { data } = await admin.from("integrations").select("config").eq("provider", "apify").is("project_id", null).maybeSingle();
  const token = (data?.config as Record<string, string> | null)?.api_token;
  if (!token) { console.error("No token"); process.exit(1); }
  const kws = ["hubstaff alternative", "time doctor alternative", "activtrak alternatives", "desktime alternative", "insightful alternative"];
  console.log(`Testing ${kws.length} queries against apify/google-search-scraper…`);
  const start = Date.now();
  const res = await fetch(`https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ queries: kws.join("\n"), countryCode: "in", resultsPerPage: 20, maxPagesPerQuery: 1, mobileResults: false }),
    signal: AbortSignal.timeout(120000),
  });
  const elapsed = Date.now() - start;
  console.log(`HTTP ${res.status} in ${elapsed}ms`);
  const items = await res.json() as Array<Record<string, unknown>>;
  console.log(`Items returned: ${items.length}`);
  if (items.length > 0) {
    console.log("first item keys:", Object.keys(items[0]).slice(0, 12));
    const first = items[0];
    console.log("searchQuery.term:", (first.searchQuery as { term?: string })?.term);
    console.log("organicResults count:", (first.organicResults as unknown[])?.length);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
