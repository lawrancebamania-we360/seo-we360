// Earned Backlinks: read API for the flat earned_backlinks table - one row
// per real backlink the team landed via outreach/link-building, no
// per-website grouping or drill-down (see the migration's own comment for
// why this is one table, not the Backlink Submissions website/submissions
// pattern).

import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/ai-citation/run-state";
import type { BacklinkRange } from "@/lib/data/backlinks";
import { getGa4BacklinkTraffic } from "@/lib/google/ga4";

export type EarnedBacklinkCurrency = "USD" | "INR";

// Referral traffic GA4 attributes to this backlink's we360.ai target via its
// UTMs (BL-1). null = untagged, unmatched, or GA4 unavailable — the UI shows "—".
export interface EarnedBacklinkTraffic {
  sessions: number;
  users: number;
}

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
  // Exchange fields (null until migration 20261029000001 is applied).
  linkType: string | null;
  spamScore: number | null;
  anchorText: string | null;
  anchorTarget: string | null;
  contactEmail: string | null;
  // The reciprocal link we gave back (only set for a link exchange).
  givenUrl: string | null;
  givenAnchorText: string | null;
  givenAnchorTarget: string | null;
  givenDomainRating: number | null;
  givenSpamScore: number | null;
  givenDate: string | null;
  // GA4 referral traffic matched on this row's anchor_target UTMs (BL-1).
  traffic: EarnedBacklinkTraffic | null;
}

export interface EarnedBacklinksResult {
  rows: EarnedBacklinkRow[];
  // false until migration 20261029000001 is applied - the UI then hides the
  // exchange fields behind a one-line notice so no write hits a missing column.
  exchangeReady: boolean;
  // GA4 connection status for the Traffic column. connected:false + reason =>
  // the UI shows the reason once instead of implying every row is untagged.
  traffic: { connected: boolean; reason?: string };
}

const BASE_COLS = "id, website, acquired_date, domain_rating, backlink_url, assigned_to, is_free, amount_paid, currency, profiles!earned_backlinks_assigned_to_fkey ( name )";
const EXCHANGE_COLS = "link_type, spam_score, anchor_text, anchor_target, contact_email, given_url, given_anchor_text, given_anchor_target, given_domain_rating, given_spam_score, given_date";

type BaseRow = {
  id: string; website: string; acquired_date: string; domain_rating: number | null; backlink_url: string;
  assigned_to: string | null; is_free: boolean; amount_paid: number | string | null; currency: string;
  profiles: { name: string | null } | null;
};
type FullRow = BaseRow & {
  link_type: string | null; spam_score: number | string | null; anchor_text: string | null;
  anchor_target: string | null; contact_email: string | null;
  given_url: string | null; given_anchor_text: string | null; given_anchor_target: string | null;
  given_domain_rating: number | null; given_spam_score: number | string | null; given_date: string | null;
};

const num = (v: number | string | null | undefined): number | null => (v == null ? null : Number(v));

// Parse the team's UTM convention off a backlink's we360.ai target. Returns null
// unless at least one UTM is present so an un-tagged target never matches GA4.
function parseUtmKey(anchorTarget: string | null): string | null {
  if (!anchorTarget) return null;
  let params: URLSearchParams;
  try {
    const u = new URL(/^https?:\/\//i.test(anchorTarget) ? anchorTarget : `https://${anchorTarget}`);
    params = u.searchParams;
  } catch {
    return null;
  }
  const source = params.get("utm_source");
  const campaign = params.get("utm_campaign");
  const content = params.get("utm_content");
  if (!source && !campaign && !content) return null;
  return utmKey(campaign, content, source);
}

// Match key: campaign + content (person) + site. Lower-cased + trimmed so a
// row's UTMs line up with GA4's dimension values regardless of case drift.
function utmKey(campaign: string | null, content: string | null, source: string | null): string {
  const norm = (v: string | null) => (v ?? "").trim().toLowerCase();
  return `${norm(campaign)}\u0000${norm(content)}\u0000${norm(source)}`;
}

export async function getEarnedBacklinks(
  projectId: string,
  range: BacklinkRange,
  ga4PropertyId: string | null = null,
): Promise<EarnedBacklinksResult> {
  const supabase = await createClient();

  const run = (cols: string) => {
    let q = supabase
      .from("earned_backlinks")
      .select(cols)
      .eq("project_id", projectId)
      .order("acquired_date", { ascending: false });
    if (range.start) q = q.gte("acquired_date", range.start);
    if (range.end) q = q.lte("acquired_date", range.end);
    return q;
  };

  // Kick off the GA4 backlink-traffic read alongside the DB query. It degrades
  // to { connected:false, reason } on its own, never throwing.
  const trafficPromise = getGa4BacklinkTraffic(ga4PropertyId, { start: range.start, end: range.end });

  // Try the full field set; fall back to the pre-migration columns on a
  // missing-column error so the page keeps working before the migration runs.
  let exchangeReady = true;
  let res = await run(`${BASE_COLS}, ${EXCHANGE_COLS}`);
  if (res.error && isMissingColumn(res.error.message)) {
    exchangeReady = false;
    res = await run(BASE_COLS);
  }

  const ga4 = await trafficPromise;
  // (campaign, content, source) -> traffic. GA4 tuples are unique, so one map
  // entry per key; last-write-wins is harmless.
  const trafficByKey = new Map<string, EarnedBacklinkTraffic>();
  for (const t of ga4.rows) {
    trafficByKey.set(utmKey(t.campaign, t.content, t.source), { sessions: t.sessions, users: t.users });
  }

  const data = (res.data ?? []) as unknown as FullRow[];
  const rows = data.map((r) => ({
    id: r.id,
    website: r.website,
    acquiredDate: r.acquired_date,
    domainRating: r.domain_rating,
    backlinkUrl: r.backlink_url,
    assignedTo: r.assigned_to,
    assigneeName: r.profiles?.name ?? null,
    isFree: r.is_free,
    amountPaid: num(r.amount_paid),
    currency: (r.currency === "INR" ? "INR" : "USD") as EarnedBacklinkCurrency,
    linkType: r.link_type ?? null,
    spamScore: num(r.spam_score),
    anchorText: r.anchor_text ?? null,
    anchorTarget: r.anchor_target ?? null,
    contactEmail: r.contact_email ?? null,
    givenUrl: r.given_url ?? null,
    givenAnchorText: r.given_anchor_text ?? null,
    givenAnchorTarget: r.given_anchor_target ?? null,
    givenDomainRating: r.given_domain_rating ?? null,
    givenSpamScore: num(r.given_spam_score),
    givenDate: r.given_date ?? null,
    traffic: (() => {
      const key = parseUtmKey(r.anchor_target ?? null);
      return key ? trafficByKey.get(key) ?? null : null;
    })(),
  }));
  return { rows, exchangeReady, traffic: { connected: ga4.connected, reason: ga4.reason } };
}
