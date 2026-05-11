import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = "https://backend.composio.dev/api/v3.1";
const KEY = process.env.COMPOSIO_API_KEY!;

(async () => {
  for (const path of ["/auth_configs", "/auth-configs"]) {
    console.log(`\n==== GET ${BASE}${path} ====`);
    const resp = await fetch(`${BASE}${path}`, { headers: { "x-api-key": KEY } });
    console.log(`Status: ${resp.status}`);
    const text = await resp.text();
    try { console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, 2000)); }
    catch { console.log(text.slice(0, 800)); }
  }
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
