// Read API for content_freshness — the weekly "is this page going stale?"
// snapshot written by lib/cron/phase-10-gsc-ga4-weekly.ts (runFreshness).
//
// The table was WRITE-ONLY until now: the cron persisted decay_pct/status and
// auto-created "Refresh content: {page}" tasks, but nothing ever read it back, so
// the decay signal was invisible to users. This reader powers the Analytics
// "Pages going stale" section.
//
// Surfacing floor: the writer marks a page "decaying" at a baseline as low as
// ~1 view/day. That's fine for storage but far too twitchy to nag a user about,
// so we only surface pages whose 90-day baseline cleared a real-traffic floor —
// a page that mattered and is now fading. Real data only; an empty result is an
// honest "nothing decaying" state, never a fabricated row.

import { createClient } from "@/lib/supabase/server";

export interface ContentFreshnessRow {
  page_path: string;
  views_last_7d: number;
  views_prior_30d: number;
  views_prior_90d: number;
  /** Negative = losing traffic vs the 90-day baseline; positive = gaining. */
  decay_pct: number;
  status: "fresh" | "stable" | "declining" | "decaying";
}

// views_prior_90d >= 150 ≈ 1.6 views/day sustained over the baseline window —
// the point below which a percentage decay is noise on a low-traffic page.
const SURFACE_FLOOR = 150;

/**
 * Pages that are actively fading (declining / decaying) and had enough baseline
 * traffic to be worth flagging, worst decay first. RLS-scoped to the caller's
 * project membership via the table's `has_project_access` policy.
 */
export async function getContentFreshness(projectId: string): Promise<ContentFreshnessRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("content_freshness")
    .select("page_path, views_last_7d, views_prior_30d, views_prior_90d, decay_pct, status")
    .eq("project_id", projectId)
    .in("status", ["declining", "decaying"])
    .gte("views_prior_90d", SURFACE_FLOOR)
    .order("decay_pct", { ascending: true }); // most-negative (worst) first

  return (data ?? []) as ContentFreshnessRow[];
}
