// Influencer posts -> visits and demo bookings, first 30 days after the post.
// Pure (no I/O) so it can be checked against fixture rows.
//
//   EXACT     the post's UTM link (utm_content from the comment link, else the
//             post-body link) - GA4 sessions with that utm_content.
//   ESTIMATE  for a plain (no-UTM) we360.ai link in the post: LinkedIn-referred
//             sessions landing on that page during the post's window, minus the
//             page's usual LinkedIn traffic (its daily average over the 14 days
//             before the post). Influencer-UTM sessions are excluded from this
//             pool - they're already counted exactly.
//   WINDOW    a post owns the page's LinkedIn traffic from its post date until
//             the next post to the same page (or 30 days / today). Two posts to
//             the same page on the same day split it evenly.
//   BUCKET    the influencer total counts every influencer-UTM session in range
//             (including UTMs that match no post) plus all the estimates.

export const ATTRIBUTION_DAYS = 30;
export const BASELINE_DAYS = 14;

export interface AttributionRow {
  date: string; source: string; medium: string; campaign: string; content: string; landingPage: string; sessions: number;
}
export interface AttributionPost {
  id: string;
  postDate: string;                 // YYYY-MM-DD
  postBodyLink: string | null;
  commentLink: string | null;
}
export interface PostAttribution {
  utmContent: string | null;        // the exact key, when there is one
  estPath: string | null;           // the landing page estimated from, when there is one
  windowEnd: string;                // last day counted (inclusive)
  visitsExact: number;
  visitsEst: number;
  demosExact: number;
  demosEst: number;
}
export interface AttributionTotals { visits: number; demos: number; visitsEst: number; demosEst: number; from: string; to: string }

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const minDate = (...ds: string[]) => ds.reduce((a, b) => (b < a ? b : a));

function parseLink(link: string | null): { content: string | null; path: string | null } {
  if (!link) return { content: null, path: null };
  try {
    const u = new URL(link.startsWith("http") ? link : `https://${link}`);
    if (!/(^|\.)we360\.ai$/i.test(u.hostname)) return { content: null, path: null };
    const content = u.searchParams.get("utm_content");
    return { content: content ? content.trim().toLowerCase() : null, path: normPath(u.pathname) };
  } catch {
    return { content: null, path: null };
  }
}
export function normPath(p: string): string {
  const s = (p || "/").split("?")[0].trim().toLowerCase();
  const withSlash = s.startsWith("/") ? s : `/${s}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : "/";
}
const isLinkedIn = (r: AttributionRow) => /linkedin|lnkd/i.test(r.source);
const isInfluencerUtm = (r: AttributionRow) => r.medium.trim().toLowerCase() === "influencer";

/** The exact UTM key and the plain landing page to estimate from, for one post. */
export function postKeys(p: AttributionPost): { utmContent: string | null; estPath: string | null } {
  const c = parseLink(p.commentLink), b = parseLink(p.postBodyLink);
  const utmContent = c.content ?? b.content;
  // Estimate only from a link that carries NO utm_content (its clicks aren't counted exactly).
  const estPath = (!b.content && b.path) || (!utmContent && c.path) || null;
  return { utmContent, estPath };
}

export function attributeInfluencerPosts(
  posts: AttributionPost[], visits: AttributionRow[], demos: AttributionRow[], today: string,
): { byPost: Record<string, PostAttribution>; totals: AttributionTotals } {
  const keyed = posts.map((p) => ({ ...p, ...postKeys(p) }));
  const byPost: Record<string, PostAttribution> = {};

  const sum = (rows: AttributionRow[], pred: (r: AttributionRow) => boolean, from: string, to: string) =>
    rows.reduce((a, r) => (r.date >= from && r.date <= to && pred(r) ? a + r.sessions : a), 0);

  for (const p of keyed) {
    const last30 = minDate(addDays(p.postDate, ATTRIBUTION_DAYS - 1), today);
    let windowEnd = last30;
    let share = 1;
    if (p.estPath) {
      for (const o of keyed) {
        if (o.id === p.id || o.estPath !== p.estPath) continue;
        if (o.postDate > p.postDate) windowEnd = minDate(windowEnd, addDays(o.postDate, -1));
        else if (o.postDate === p.postDate) share++;
      }
    }

    const exactPred = (r: AttributionRow) => !!p.utmContent && r.content.trim().toLowerCase() === p.utmContent;
    const visitsExact = p.utmContent ? sum(visits, exactPred, p.postDate, last30) : 0;
    const demosExact = p.utmContent ? sum(demos, exactPred, p.postDate, last30) : 0;

    let visitsEst = 0, demosEst = 0;
    if (p.estPath && windowEnd >= p.postDate) {
      const pool = (r: AttributionRow) => !isInfluencerUtm(r) && isLinkedIn(r) && normPath(r.landingPage) === p.estPath;
      const days = Math.round((Date.parse(`${windowEnd}T00:00:00Z`) - Date.parse(`${p.postDate}T00:00:00Z`)) / 86_400_000) + 1;
      const bFrom = addDays(p.postDate, -BASELINE_DAYS), bTo = addDays(p.postDate, -1);
      const lift = (rows: AttributionRow[]) => {
        const inWindow = sum(rows, pool, p.postDate, windowEnd);
        const baselineDaily = sum(rows, pool, bFrom, bTo) / BASELINE_DAYS;
        return Math.max(0, Math.round((inWindow - baselineDaily * days) / share));
      };
      visitsEst = lift(visits);
      demosEst = lift(demos);
    }

    byPost[p.id] = { utmContent: p.utmContent, estPath: p.estPath, windowEnd, visitsExact, visitsEst, demosExact, demosEst };
  }

  // Influencer total: every influencer-UTM session from the first post on (the
  // bucket - includes UTMs that match no post), plus all the estimates.
  const from = posts.length ? posts.reduce((a, p) => (p.postDate < a ? p.postDate : a), posts[0].postDate) : today;
  const est = Object.values(byPost);
  const visitsEst = est.reduce((a, x) => a + x.visitsEst, 0);
  const demosEst = est.reduce((a, x) => a + x.demosEst, 0);
  return {
    byPost,
    totals: {
      visits: sum(visits, isInfluencerUtm, from, today) + visitsEst,
      demos: sum(demos, isInfluencerUtm, from, today) + demosEst,
      visitsEst, demosEst, from, to: today,
    },
  };
}
