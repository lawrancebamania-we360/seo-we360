import { createClient } from "@/lib/supabase/server";

export interface HealthSnapshot {
  score: number | null;
  lastAudited: string | null;
  trend: "up" | "down" | "stable" | null;
}

// Returns the average of the 5 latest pillar scores (SEO/AEO/GEO/SXO/AIO)
// plus a trend versus the previous snapshot.
export async function getOverallHealth(projectId: string | null): Promise<HealthSnapshot> {
  if (!projectId) return { score: null, lastAudited: null, trend: null };
  const supabase = await createClient();

  const { data } = await supabase
    .from("pillar_scores")
    .select("pillar, score, captured_at")
    .eq("project_id", projectId)
    .order("captured_at", { ascending: false })
    .limit(30);

  if (!data || data.length === 0) return { score: null, lastAudited: null, trend: null };

  const pillars: ("SEO" | "AEO" | "GEO" | "SXO" | "AIO")[] = ["SEO", "AEO", "GEO", "SXO", "AIO"];
  const rows = data as Array<{ pillar: string; score: number; captured_at: string }>;

  // Latest score per pillar
  const latest: Record<string, number> = {};
  const previous: Record<string, number> = {};
  for (const r of rows) {
    if (latest[r.pillar] === undefined) latest[r.pillar] = r.score;
    else if (previous[r.pillar] === undefined) previous[r.pillar] = r.score;
  }

  const latestValues = pillars.map((p) => latest[p]).filter((v) => typeof v === "number");
  if (latestValues.length === 0) return { score: null, lastAudited: null, trend: null };
  const avg = Math.round(latestValues.reduce((s, v) => s + v, 0) / latestValues.length);

  const prevValues = pillars.map((p) => previous[p]).filter((v) => typeof v === "number");
  let trend: HealthSnapshot["trend"] = null;
  if (prevValues.length === latestValues.length) {
    const prevAvg = prevValues.reduce((s, v) => s + v, 0) / prevValues.length;
    if (avg > prevAvg + 1) trend = "up";
    else if (avg < prevAvg - 1) trend = "down";
    else trend = "stable";
  }

  return { score: avg, lastAudited: rows[0].captured_at, trend };
}
