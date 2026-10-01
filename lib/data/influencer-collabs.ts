// Influencer Collabs: read API for the flat influencer_collabs table - one
// row per collaboration, no per-influencer grouping or drill-down (same
// shape as lib/data/earned-backlinks.ts).

import { createClient } from "@/lib/supabase/server";
import type { BacklinkRange } from "@/lib/data/backlinks";

export type InfluencerPlatform = "YouTube" | "Instagram" | "Facebook" | "Twitter" | "LinkedIn";
export type InfluencerCollabCurrency = "USD" | "INR";

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
}

export async function getInfluencerCollabs(projectId: string, range: BacklinkRange): Promise<InfluencerCollabRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("influencer_collabs")
    .select("id, influencer_name, profile_link, platform, post_date, closing_date, is_free, amount_paid, currency, post_link, assigned_to, profiles!influencer_collabs_assigned_to_fkey ( name )")
    .eq("project_id", projectId)
    .order("post_date", { ascending: false });
  if (range.start) q = q.gte("post_date", range.start);
  if (range.end) q = q.lte("post_date", range.end);

  const { data } = await q;
  type Row = {
    id: string; influencer_name: string; profile_link: string; platform: string; post_date: string;
    closing_date: string | null; is_free: boolean; amount_paid: number | string | null; currency: string;
    post_link: string | null; assigned_to: string | null; profiles: { name: string | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
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
  }));
}
