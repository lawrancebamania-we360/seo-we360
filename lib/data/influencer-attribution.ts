// Influencer Collabs: visits + demo bookings per LinkedIn post (first 30 days)
// and the influencer total - GA4 rows run through the pure attribution in
// lib/influencer/attribution.ts. GA4 only answers on the Vercel runtime
// (403 locally), so `ready` is false there and the columns show the reason.

import { getGa4InfluencerRows } from "@/lib/google/ga4";
import { attributeInfluencerPosts, BASELINE_DAYS, type AttributionTotals, type PostAttribution } from "@/lib/influencer/attribution";
import type { InfluencerCollabRow } from "@/lib/data/influencer-collabs";

export interface InfluencerAttribution {
  ready: boolean;
  reason: string | null;
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
  if (!posts.length) return { ready: true, reason: null, byPost: {}, totals: null };

  const earliest = posts.reduce((a, p) => (p.postDate < a ? p.postDate : a), posts[0].postDate);
  const ga4 = await getGa4InfluencerRows(ga4PropertyId, { start: addDays(earliest, -BASELINE_DAYS), end: today });
  if (!ga4.connected) return { ready: false, reason: ga4.reason ?? "GA4 not connected.", byPost: {}, totals: null };

  const { byPost, totals } = attributeInfluencerPosts(posts, ga4.visits, ga4.demos, today);
  return { ready: true, reason: null, byPost, totals };
}
