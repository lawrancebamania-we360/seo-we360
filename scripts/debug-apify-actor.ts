#!/usr/bin/env tsx
// Ping the apify/google-search-scraper actor with a single query and dump the
// raw dataset items so we can see the current response schema and rebuild our
// mapper to match. Usage:
//   npx tsx scripts/debug-apify-actor.ts "hubstaff alternative"

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!.trim());

async function main() {
  const kw = process.argv[2] ?? "hubstaff alternative";
  // Pull the live Apify token from integrations table (same source our secrets helper uses)
  const { data: cfg } = await admin
    .from("integrations").select("config").eq("provider", "apify").is("project_id", null).maybeSingle();
  const token = ((cfg?.config as Record<string, string> | null)?.api_token) ?? process.env.APIFY_TOKEN ?? "";
  if (!token) { console.error("No Apify token"); process.exit(1); }

  const actor = "apify~google-search-scraper";
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`;
  console.log(`POST ${url.replace(token, "<redacted>")}`);
  const body = {
    queries: kw,
    countryCode: "in",
    maxPagesPerQuery: 1,
    resultsPerPage: 10,
    mobileResults: false,
    saveHtml: false,
    includeUnfilteredResults: false,
  };
  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  console.log(`HTTP ${res.status} in ${Date.now() - start}ms`);
  if (!res.ok) {
    console.error(await res.text());
    process.exit(1);
  }
  const items = await res.json();
  console.log(`Dataset items: ${Array.isArray(items) ? items.length : typeof items}`);
  if (Array.isArray(items) && items[0]) {
    const first = items[0];
    console.log("\nTop-level keys:", Object.keys(first));
    console.log("\nFull first item (truncated to 4KB):");
    const s = JSON.stringify(first, null, 2);
    console.log(s.length > 4000 ? s.slice(0, 4000) + "\n… [truncated]" : s);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
