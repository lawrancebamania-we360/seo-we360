#!/usr/bin/env tsx
// Ping santhej/website-traffic-intel with a single domain (overview mode) and
// a single target-vs-competitor pair (keyword_gap mode), then dump the raw
// dataset items. The wrapper in lib/apify/competitor-intel.ts parses several
// plausible output field-name aliases since the actor's exact output schema
// isn't published — run this once against a real APIFY_TOKEN and true up
// those aliases against what actually comes back before trusting it in the
// monthly cron. Usage:
//   npx tsx scripts/debug-santhej-actor.ts overview allbirds.com
//   npx tsx scripts/debug-santhej-actor.ts gap we360.ai monitask.com

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!.trim());

async function callActor(body: object) {
  const { data: cfg } = await admin
    .from("integrations").select("config").eq("provider", "apify").is("project_id", null).maybeSingle();
  const token = ((cfg?.config as Record<string, string> | null)?.api_token) ?? process.env.APIFY_TOKEN ?? "";
  if (!token) { console.error("No Apify token"); process.exit(1); }

  const actor = "santhej~website-traffic-intel";
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`;
  console.log(`POST ${url.replace(token, "<redacted>")}`);
  console.log("Body:", JSON.stringify(body, null, 2));
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
    console.log("\nTop-level keys:", Object.keys(items[0]));
    console.log("\nFull first item (truncated to 4KB):");
    const s = JSON.stringify(items[0], null, 2);
    console.log(s.length > 4000 ? s.slice(0, 4000) + "\n… [truncated]" : s);
  }
}

async function main() {
  const mode = process.argv[2] ?? "overview";
  if (mode === "gap") {
    const target = process.argv[3] ?? "we360.ai";
    const competitor = process.argv[4] ?? "monitask.com";
    await callActor({
      mode: "keyword_gap",
      target,
      competitor,
      locationCode: "2356",
      languageCode: "en",
      maxGapKeywords: 30,
    });
  } else {
    const domain = process.argv[3] ?? "allbirds.com";
    await callActor({
      mode: "overview",
      domains: [domain],
      locationCode: "2356",
      languageCode: "en",
      maxKeywords: 30,
      maxCompetitors: 1,
    });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
