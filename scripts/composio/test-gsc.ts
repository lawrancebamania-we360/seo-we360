import { config } from "dotenv";
config({ path: ".env.local" });
import { gscSearchAnalytics } from "@/lib/integrations/composio";

(async () => {
  console.log("Testing GSC: site=https://we360.ai/, last 30d, top queries\n");
  const result = await gscSearchAnalytics({
    siteUrl: "https://we360.ai/",
    startDaysAgo: 30,
    dimensions: ["query"],
    rowLimit: 5,
  });
  console.log("\nGSC response:");
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => { console.error("Failed:", e instanceof Error ? e.message : e); process.exit(1); });
