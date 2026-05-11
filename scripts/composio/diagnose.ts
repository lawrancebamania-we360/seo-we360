// Single raw request to Composio to see exactly what's coming back.
// Tries a few tool slug variants so we can identify which works.
import { config } from "dotenv";
config({ path: ".env.local" });

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1";
const KEY = process.env.COMPOSIO_API_KEY!;

async function tryRaw(toolSlug: string, body: Record<string, unknown>) {
  const url = `${COMPOSIO_BASE}/tools/execute/${toolSlug}`;
  console.log(`\n==== POST ${url} ====`);
  console.log("Body:", JSON.stringify(body, null, 2));
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  console.log(`Status: ${resp.status} ${resp.statusText}`);
  console.log("Response headers:", Object.fromEntries(resp.headers.entries()));
  console.log("Body:");
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text.slice(0, 1500));
  }
}

(async () => {
  if (!KEY) { console.error("COMPOSIO_API_KEY not set"); process.exit(1); }
  console.log(`Using API key: ${KEY.slice(0, 8)}...${KEY.slice(-4)}\n`);

  // 1. Try GET /tools list — verifies auth + base URL are right.
  console.log("==== GET /api/v3.1/tools?toolkits=google_analytics ====");
  const listResp = await fetch(`${COMPOSIO_BASE}/tools?toolkits=google_analytics&limit=10`, {
    headers: { "x-api-key": KEY },
  });
  const listText = await listResp.text();
  console.log(`Status: ${listResp.status}`);
  try {
    const json = JSON.parse(listText) as { items?: Array<{ slug?: string; name?: string }> };
    console.log(`First 10 google_analytics tools:`);
    for (const t of json.items ?? []) console.log(`  • ${t.slug ?? t.name}`);
  } catch {
    console.log(listText.slice(0, 800));
  }

  // 2. Try executing different slug variants
  const variants = [
    "GOOGLE_ANALYTICS_RUN_REPORT",
    "GOOGLEANALYTICS_RUN_REPORT",
    "GOOGLE_ANALYTICS_BATCH_RUN_REPORTS",
    "googleanalytics_run_report",
  ];
  for (const slug of variants) {
    await tryRaw(slug, {
      arguments: {
        property: "properties/273620287",
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "sessions" }],
        limit: 5,
      },
    });
  }
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
