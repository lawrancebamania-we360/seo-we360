// Single GA4 call to verify the connection works end-to-end.
import { config } from "dotenv";
config({ path: ".env.local" });
import { ga4RunReport } from "@/lib/integrations/composio";

(async () => {
  console.log("Testing GA4 with entity_id=lawrance, property=273620287, last 30d\n");
  const result = await ga4RunReport({
    propertyId: "273620287",
    startDaysAgo: 30,
    dimensions: ["pagePath"],
    metrics: ["sessions", "engagedSessions"],
    limit: 5,
  });
  console.log("\nGA4 response:");
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => { console.error("Failed:", e instanceof Error ? e.message : e); process.exit(1); });
