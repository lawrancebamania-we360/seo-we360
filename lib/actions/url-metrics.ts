"use server";

import { createClient } from "@/lib/supabase/server";
import type { UrlMetric } from "@/lib/types/url-metrics";

// Read the live GSC + GA4 metrics for a given URL across all three windows.
// Used by the live-performance panel inside the task detail dialog.
export async function getLiveMetricsForUrl(url: string): Promise<Record<string, UrlMetric | null>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("url_metrics_latest")
    .select("*")
    .eq("url", url);

  const out: Record<string, UrlMetric | null> = { "30d": null, "60d": null, "90d": null };
  for (const row of (data ?? []) as UrlMetric[]) {
    out[row.period] = row;
  }
  return out;
}

// Same but for use during task creation — pulls the 90d row only and
// returns the formatted data_backing string (or null if no data yet).
export async function getDataBackingForUrl(url: string, period: "30d" | "60d" | "90d" = "90d"): Promise<UrlMetric | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("url_metrics_latest")
    .select("*")
    .eq("url", url)
    .eq("period", period)
    .maybeSingle();
  return (data as UrlMetric | null) ?? null;
}
