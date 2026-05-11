// Initiate OAuth connections for GA4 and GSC under entity_id "lawrance".
// Prints redirect URLs — open each in your browser, authorize Google,
// the connection becomes active. After that, the sync script can use
// entity_id "lawrance" for all REST calls.
//
// Run once during setup. Re-running is idempotent (Composio dedupes
// by auth_config_id + entity_id).
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = "https://backend.composio.dev/api/v3.1";
const KEY = process.env.COMPOSIO_API_KEY!;
const ENTITY_ID = "lawrance";

// Auth config IDs from the dashboard
const AUTH_CONFIGS: Array<{ name: string; id: string }> = [
  // GA4 already connected during setup — uncomment to re-initiate.
  // { name: "Google Analytics", id: "ac_pM2uV32mzDcc" },
  { name: "Google Search Console", id: "ac_Z946U9O2wbwd" },
];

async function initiateConnection(authConfigId: string): Promise<unknown> {
  const url = `${BASE}/connected_accounts`;
  const body = {
    auth_config: { id: authConfigId },
    connection: {
      user_id: ENTITY_ID,
      callback_url: "https://app.composio.dev/connected-accounts/success",
    },
  };
  console.log(`\n==== POST ${url} ====`);
  console.log(`Body: ${JSON.stringify(body, null, 2)}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  console.log(`Status: ${resp.status}`);
  try {
    return JSON.parse(text);
  } catch {
    console.log(text.slice(0, 1500));
    return null;
  }
}

(async () => {
  if (!KEY) { console.error("COMPOSIO_API_KEY not set"); process.exit(1); }

  for (const cfg of AUTH_CONFIGS) {
    console.log(`\n=== Initiating ${cfg.name} (${cfg.id}) ===`);
    const result = await initiateConnection(cfg.id) as Record<string, unknown> | null;
    if (!result) continue;
    console.log("\nResponse body:");
    console.log(JSON.stringify(result, null, 2));

    // Look for the redirect URL — Composio names it differently in different
    // API versions: `redirect_url`, `redirectUrl`, `connection_request.redirect_url`...
    const candidate =
      (result.redirect_url as string | undefined) ??
      (result.redirectUrl as string | undefined) ??
      ((result.connection_request as Record<string, unknown> | undefined)?.redirect_url as string | undefined) ??
      ((result.data as Record<string, unknown> | undefined)?.redirect_url as string | undefined);

    if (candidate) {
      console.log(`\n👉 Open this URL in your browser to authorize ${cfg.name}:`);
      console.log(`\n  ${candidate}\n`);
    }
  }
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
