// Quick check: does the whole-site GA4 monthly query work? Mirrors what
// getMonthlyTrafficComparison() does, standalone (no request context).

import { config } from "dotenv";
config({ path: ".env.local" });
import { executeAction, type GA4Metric } from "@/lib/integrations/composio";

const GA4_PROPERTY_ID = "273620287";

async function siteSessions(start: string, end: string): Promise<number> {
  const result = await executeAction<GA4Metric>("GOOGLE_ANALYTICS_RUN_REPORT", {
    property: `properties/${GA4_PROPERTY_ID}`,
    dateRanges: [{ startDate: start, endDate: end }],
    metrics: [{ name: "sessions" }],
  });
  return parseInt(result.data.rows?.[0]?.metricValues?.[0]?.value ?? "0", 10) || 0;
}

(async () => {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const thisStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));

  console.log(`Last month: ${iso(lastStart)} -> ${iso(lastEnd)}`);
  console.log(`This month: ${iso(thisStart)} -> ${iso(now)}`);

  const last = await siteSessions(iso(lastStart), iso(lastEnd));
  const thisM = await siteSessions(iso(thisStart), iso(now));
  console.log(`\nLast month site sessions:  ${last.toLocaleString()}`);
  console.log(`This month site sessions:  ${thisM.toLocaleString()}`);
  console.log("GA4 monthly call: OK");
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
