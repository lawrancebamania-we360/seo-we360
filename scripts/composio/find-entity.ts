// Find the entity_id / user_id Composio expects in tool execution requests.
// Hits the connected_accounts endpoint and dumps everything.
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = "https://backend.composio.dev/api/v3.1";
const KEY = process.env.COMPOSIO_API_KEY!;

(async () => {
  if (!KEY) { console.error("COMPOSIO_API_KEY not set"); process.exit(1); }

  // Try a few endpoints to find connected accounts info
  const endpoints = [
    "/connected_accounts",
    "/connected_accounts?limit=20",
    "/connections",
    "/users",
    "/entities",
  ];

  for (const path of endpoints) {
    console.log(`\n==== GET ${BASE}${path} ====`);
    const resp = await fetch(`${BASE}${path}`, {
      headers: { "x-api-key": KEY },
    });
    console.log(`Status: ${resp.status}`);
    const text = await resp.text();
    try {
      const parsed = JSON.parse(text);
      console.log(JSON.stringify(parsed, null, 2).slice(0, 2000));
    } catch {
      console.log(text.slice(0, 800));
    }
  }
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
