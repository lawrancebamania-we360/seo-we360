import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/types/database";
import { getPagespeedKey } from "@/lib/integrations/secrets";
import { HTTP } from "@/lib/constants";

/**
 * Phase 4 — PageSpeed Insights for mobile + desktop. Writes to cwv_snapshots.
 */
export async function runPageSpeed(
  supabase: SupabaseClient,
  project: Project
): Promise<{ mobile: number | null; desktop: number | null; skipped?: string }> {
  const apiKey = await getPagespeedKey();
  if (!apiKey) return { mobile: null, desktop: null, skipped: "PAGESPEED_API_KEY missing" };

  const url = `https://${project.domain}/`;
  const results: { mobile: number | null; desktop: number | null } = { mobile: null, desktop: null };

  for (const device of ["mobile", "desktop"] as const) {
    try {
      const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${device}&category=PERFORMANCE&key=${apiKey}`;
      const res = await fetch(psUrl, { cache: "no-store", signal: AbortSignal.timeout(HTTP.PAGESPEED_TIMEOUT_MS) });
      if (!res.ok) continue;
      const data = await res.json();
      const lh = data.lighthouseResult;
      const score = Math.round((lh?.categories?.performance?.score ?? 0) * 100);
      const audits = lh?.audits ?? {};

      const parseNumeric = (key: string): number | null => {
        const v = audits[key]?.numericValue;
        return typeof v === "number" ? v : null;
      };

      await supabase.from("cwv_snapshots").insert({
        project_id: project.id,
        url,
        device,
        score,
        lcp: parseNumeric("largest-contentful-paint") != null ? (parseNumeric("largest-contentful-paint")! / 1000) : null,
        cls: parseNumeric("cumulative-layout-shift"),
        inp: parseNumeric("interaction-to-next-paint"),
        ttfb: parseNumeric("server-response-time") != null ? (parseNumeric("server-response-time")! / 1000) : null,
        si: parseNumeric("speed-index") != null ? (parseNumeric("speed-index")! / 1000) : null,
        tbt: parseNumeric("total-blocking-time"),
        fcp: parseNumeric("first-contentful-paint") != null ? (parseNumeric("first-contentful-paint")! / 1000) : null,
      });

      results[device] = score;
    } catch {
      // Skip device on failure
    }
  }

  return results;
}
