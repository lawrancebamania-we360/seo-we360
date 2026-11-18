// Influencer Collabs: visits, demo bookings and deals per LinkedIn post (first
// 30 days) and the influencer total - GA4 rows run through the pure attribution
// in lib/influencer/attribution.ts; deals = attributed bookings matched to the
// HubSpot deal created within 15 min (the Analytics page's own matcher). GA4
// only answers on the Vercel runtime (403 locally), so `ready` is false there.

import { getGa4InfluencerBookingRows, getGa4InfluencerRows, getGa4PropertyTimezone } from "@/lib/google/ga4";
import { getHubspotVerification } from "@/lib/hubspot/leads";
import { hasHubspot } from "@/lib/env";
import { buildOrganicDeals } from "@/lib/analytics/organic-deals";
import {
  attributeInfluencerPosts, labelBookings, BASELINE_DAYS, type AttributionTotals, type PostAttribution,
} from "@/lib/influencer/attribution";
import type { InfluencerCollabRow } from "@/lib/data/influencer-collabs";

export interface InfluencerAttribution {
  ready: boolean;
  reason: string | null;
  dealsReady: boolean;          // HubSpot reachable (deal columns show "—" otherwise)
  byPost: Record<string, PostAttribution>;
  totals: AttributionTotals | null;
}

const istToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function getInfluencerAttribution(collabs: InfluencerCollabRow[], ga4PropertyId: string | null): Promise<InfluencerAttribution> {
  const today = istToday();
  const posts = collabs
    .filter((c) => c.platform === "LinkedIn" && c.postDate <= today)
    .map((c) => ({ id: c.id, postDate: c.postDate, postBodyLink: c.postBodyLink, commentLink: c.commentLink }));
  if (!posts.length) return { ready: true, reason: null, dealsReady: false, byPost: {}, totals: null };

  const earliest = posts.reduce((a, p) => (p.postDate < a ? p.postDate : a), posts[0].postDate);
  const range = { start: addDays(earliest, -BASELINE_DAYS), end: today };
  const [ga4, bookings, hubspot, tz] = await Promise.all([
    getGa4InfluencerRows(ga4PropertyId, range),
    getGa4InfluencerBookingRows(ga4PropertyId, { start: earliest, end: today }),
    hasHubspot() ? getHubspotVerification({ start: earliest, end: today }).catch(() => null) : Promise.resolve(null),
    getGa4PropertyTimezone(ga4PropertyId),
  ]);
  if (!ga4.connected) return { ready: false, reason: ga4.reason ?? "GA4 not connected.", dealsReady: false, byPost: {}, totals: null };

  const { byPost, totals } = attributeInfluencerPosts(posts, ga4.visits, ga4.demos, today);

  // Deals: match the attributed bookings to real HubSpot deals (+-15 min).
  const dealsReady = !!hubspot?.ok && bookings.ok;
  if (dealsReady && hubspot) {
    const matched = buildOrganicDeals(labelBookings(byPost, bookings.rows), hubspot.verifyTimestamps, tz);
    const count = new Map(matched.byChannel.map((c) => [c.channel, c.count]));
    let dealsExact = count.get("bucket|exact") ?? 0, dealsEst = 0;
    for (const [id, a] of Object.entries(byPost)) {
      a.dealsExact = count.get(`${id}|exact`) ?? 0;
      // The estimate window's matched deals, scaled like its demo estimate
      // (the share of window demos left after the page's usual traffic).
      const raw = count.get(`${id}|est`) ?? 0;
      a.dealsEst = raw && a.demosEstRaw > 0 ? Math.round(raw * Math.min(1, a.demosEst / a.demosEstRaw)) : 0;
      dealsExact += a.dealsExact;
      dealsEst += a.dealsEst;
    }
    totals.deals = dealsExact + dealsEst;
    totals.dealsEst = dealsEst;
  }

  return { ready: true, reason: null, dealsReady, byPost, totals };
}
