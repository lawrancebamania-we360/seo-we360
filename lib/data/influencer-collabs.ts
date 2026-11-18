// Influencer Collabs: read API for the flat influencer_collabs table - one
// row per collaboration, no per-influencer grouping or drill-down (same
// shape as lib/data/earned-backlinks.ts) - plus each post's tracking: the
// we360.ai links found in the post / the influencer's comment, and the daily
// engagement readings (influencer_post_metrics). Tracking degrades to empty
// until migration 20261118000001 is applied.

import { createClient } from "@/lib/supabase/server";
import { isMissingColumn, isMissingTable } from "@/lib/ai-citation/run-state";
import type { BacklinkRange } from "@/lib/data/backlinks";

export type InfluencerPlatform = "YouTube" | "Instagram" | "Facebook" | "Twitter" | "LinkedIn";
export type InfluencerCollabCurrency = "USD" | "INR";

export interface PostMetricPoint {
  date: string;              // YYYY-MM-DD
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  source: "auto" | "manual";
}

export interface InfluencerCollabRow {
  id: string;
  influencerName: string;
  profileLink: string;
  platform: InfluencerPlatform;
  postDate: string;
  closingDate: string | null;
  isFree: boolean;
  amountPaid: number | null;
  currency: InfluencerCollabCurrency;
  postLink: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  // Post tracking (null / [] before the migration)
  trackingReady: boolean;
  postBodyLink: string | null;
  commentLink: string | null;
  linksScrapedAt: string | null;
  scrapeError: string | null;
  metrics: PostMetricPoint[];   // oldest -> newest
}

const BASE = "id, influencer_name, profile_link, platform, post_date, closing_date, is_free, amount_paid, currency, post_link, assigned_to, profiles!influencer_collabs_assigned_to_fkey ( name )";
const TRACKING = "post_body_link, comment_link, links_scraped_at, scrape_error";

export async function getInfluencerCollabs(projectId: string, range: BacklinkRange): Promise<InfluencerCollabRow[]> {
  const supabase = await createClient();
  const run = (cols: string) => {
    let q = supabase
      .from("influencer_collabs")
      .select(cols)
      .eq("project_id", projectId)
      .order("post_date", { ascending: false });
    if (range.start) q = q.gte("post_date", range.start);
    if (range.end) q = q.lte("post_date", range.end);
    return q;
  };

  let trackingReady = true;
  let res = await run(`${BASE}, ${TRACKING}`);
  if (res.error && isMissingColumn(res.error.message)) { trackingReady = false; res = await run(BASE); }

  type Row = {
    id: string; influencer_name: string; profile_link: string; platform: string; post_date: string;
    closing_date: string | null; is_free: boolean; amount_paid: number | string | null; currency: string;
    post_link: string | null; assigned_to: string | null; profiles: { name: string | null } | null;
    post_body_link?: string | null; comment_link?: string | null; links_scraped_at?: string | null; scrape_error?: string | null;
  };
  const rows = (res.data ?? []) as unknown as Row[];

  const metricsBy = new Map<string, PostMetricPoint[]>();
  if (trackingReady && rows.length) {
    const m = await supabase
      .from("influencer_post_metrics")
      .select("collab_id, captured_on, reactions, comments, reposts, source")
      .in("collab_id", rows.map((r) => r.id))
      .order("captured_on", { ascending: true });
    if (m.error) {
      if (isMissingTable(m.error.message) || isMissingColumn(m.error.message)) trackingReady = false;
    } else {
      for (const p of (m.data ?? []) as { collab_id: string; captured_on: string; reactions: number | null; comments: number | null; reposts: number | null; source: string }[]) {
        const arr = metricsBy.get(p.collab_id) ?? [];
        arr.push({ date: p.captured_on, reactions: p.reactions, comments: p.comments, reposts: p.reposts, source: p.source === "manual" ? "manual" : "auto" });
        metricsBy.set(p.collab_id, arr);
      }
    }
  }

  return rows.map((r) => ({
    id: r.id,
    influencerName: r.influencer_name,
    profileLink: r.profile_link,
    platform: r.platform as InfluencerPlatform,
    postDate: r.post_date,
    closingDate: r.closing_date,
    isFree: r.is_free,
    amountPaid: r.amount_paid == null ? null : Number(r.amount_paid),
    currency: (r.currency === "USD" ? "USD" : "INR") as InfluencerCollabCurrency,
    postLink: r.post_link,
    assignedTo: r.assigned_to,
    assigneeName: r.profiles?.name ?? null,
    trackingReady,
    postBodyLink: r.post_body_link ?? null,
    commentLink: r.comment_link ?? null,
    linksScrapedAt: r.links_scraped_at ?? null,
    scrapeError: r.scrape_error ?? null,
    metrics: metricsBy.get(r.id) ?? [],
  }));
}
