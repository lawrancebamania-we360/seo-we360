// Earned Backlinks: read API for the flat earned_backlinks table - one row
// per real backlink the team landed via outreach/link-building, no
// per-website grouping or drill-down (see the migration's own comment for
// why this is one table, not the Backlink Submissions website/submissions
// pattern).

import { createClient } from "@/lib/supabase/server";
import type { BacklinkRange } from "@/lib/data/backlinks";

export type EarnedBacklinkCurrency = "USD" | "INR";

export interface EarnedBacklinkRow {
  id: string;
  website: string;
  acquiredDate: string;
  domainRating: number | null;
  backlinkUrl: string;
  assignedTo: string | null;
  assigneeName: string | null;
  isFree: boolean;
  amountPaid: number | null;
  currency: EarnedBacklinkCurrency;
}

export async function getEarnedBacklinks(projectId: string, range: BacklinkRange): Promise<EarnedBacklinkRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("earned_backlinks")
    .select("id, website, acquired_date, domain_rating, backlink_url, assigned_to, is_free, amount_paid, currency, profiles!earned_backlinks_assigned_to_fkey ( name )")
    .eq("project_id", projectId)
    .order("acquired_date", { ascending: false });
  if (range.start) q = q.gte("acquired_date", range.start);
  if (range.end) q = q.lte("acquired_date", range.end);

  const { data } = await q;
  type Row = {
    id: string; website: string; acquired_date: string; domain_rating: number | null; backlink_url: string;
    assigned_to: string | null; is_free: boolean; amount_paid: number | string | null; currency: string;
    profiles: { name: string | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    website: r.website,
    acquiredDate: r.acquired_date,
    domainRating: r.domain_rating,
    backlinkUrl: r.backlink_url,
    assignedTo: r.assigned_to,
    assigneeName: r.profiles?.name ?? null,
    isFree: r.is_free,
    amountPaid: r.amount_paid == null ? null : Number(r.amount_paid),
    currency: (r.currency === "INR" ? "INR" : "USD") as EarnedBacklinkCurrency,
  }));
}
