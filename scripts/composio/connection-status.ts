import { config } from "dotenv";
config({ path: ".env.local" });
const KEY = process.env.COMPOSIO_API_KEY!;
(async () => {
  const r = await fetch("https://backend.composio.dev/api/v3.1/connected_accounts", {
    headers: { "x-api-key": KEY },
  });
  const j = await r.json() as { items?: Array<{ id: string; toolkit?: { slug?: string }; user_id?: string; status?: string; created_at?: string }> };
  console.log(`${j.items?.length ?? 0} connected_accounts:\n`);
  for (const item of (j.items ?? [])) {
    console.log(`  ${item.toolkit?.slug?.padEnd(25)}  user=${item.user_id?.padEnd(10)}  status=${item.status?.padEnd(10)}  id=${item.id}  created=${item.created_at}`);
  }
})();
