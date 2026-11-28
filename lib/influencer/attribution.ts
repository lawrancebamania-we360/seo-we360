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
/** IC-3: UTM visits count on any day (before the first date GA4 has). */
const ALL_TIME = "0000-01-01";
export const BASELINE_DAYS = 14;

export interface AttributionRow {
  date: string; source: string; medium: string; campaign: string; content: string; landingPage: string; sessions: number;
}
export interface AttributionPost {
  id: string;
  postDate: string;                 // YYYY-MM-DD
  postBodyLink: string | null;
  commentLink: string | null;
  /** Influencer name - used to match a UTM by name when no link was recorded (IC-2). */
  name?: string | null;
}
export interface PostAttribution {
  postDate: string;
  exactEnd: string;                 // last day UTM traffic counts (today - IC-3: all time)
  utmContent: string | null;        // the exact key(s) for display, when there are any
  utmContents: string[];            // every utm_content counted exactly for this post
  matchedBy: "link" | "name" | null; // how the UTM was tied to the post (IC-2)
  estPath: string | null;           // the landing page estimated from, when there is one
  windowEnd: string;                // last day counted (inclusive)
  visitsExact: number;
  visitsEst: number;
  demosExact: number;
  demosEst: number;
  demosEstRaw: number;              // LinkedIn demos in the estimate window before the baseline is taken off
  dealsExact: number;               // filled in by the data layer (HubSpot match)
  dealsEst: number;
}
export interface AttributionTotals { visits: number; demos: number; deals: number; visitsEst: number; demosEst: number; dealsEst: number; from: string; to: string }

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

/** "Tripti Jain" -> "tripti-jain" (how the team writes utm_content). */
export function nameSlug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * IC-2: for posts with no recorded UTM link, the influencer-UTM utm_content
 * values that carry the influencer's name ("tripti-jain-post-1"). Full name
 * first; else the first name when no other collab shares it. Contents already
 * tied to a post by its link are never re-used.
 */
export function matchUtmsByName(
  posts: Array<{ id: string; name?: string | null; utmContent: string | null }>, contents: string[],
): Map<string, string[]> {
  const claimed = new Set(posts.map((p) => p.utmContent).filter((c): c is string => !!c));
  const free = contents.filter((c) => !claimed.has(c));
  const firstCount = new Map<string, number>();
  for (const p of posts) {
    const f = nameSlug(p.name ?? "").split("-")[0];
    if (f) firstCount.set(f, (firstCount.get(f) ?? 0) + 1);
  }
  const out = new Map<string, string[]>();
  for (const p of posts) {
    if (p.utmContent || !p.name) continue;
    const slug = nameSlug(p.name);
    if (!slug) continue;
    let hit = free.filter((c) => c === slug || c.startsWith(`${slug}-`) || c.includes(`-${slug}-`) || c.endsWith(`-${slug}`));
    const first = slug.split("-")[0];
    if (!hit.length && first.length >= 4 && firstCount.get(first) === 1) {
      hit = free.filter((c) => c === first || c.startsWith(`${first}-`) || c.includes(`-${first}-`));
    }
    if (hit.length) out.set(p.id, hit);
  }
  return out;
}

const normContent = (c: string) => c.trim().toLowerCase();
// GA4 fills empty UTM fields with placeholders like "(not set)", "(referral)",
// "(organic)", "(direct)" - none of those is a real tag.
const hasContent = (c: string) => { const n = normContent(c); return !!n && !/^\(.*\)$/.test(n); };

export function attributeInfluencerPosts(
  posts: AttributionPost[], visits: AttributionRow[], demos: AttributionRow[], today: string,
): { byPost: Record<string, PostAttribution>; totals: AttributionTotals } {
  const keyed = posts.map((p) => ({ ...p, ...postKeys(p) }));
  const byPost: Record<string, PostAttribution> = {};

  // IC-2: posts without a recorded UTM link are matched to UTMs by name.
  const seen = [...new Set([...visits, ...demos].filter((r) => isInfluencerUtm(r) && hasContent(r.content)).map((r) => normContent(r.content)))];
  const byName = matchUtmsByName(keyed, seen);
  // One name-matched UTM shared by two posts of the same influencer: a day
  // belongs to the latest of those posts on/before it (within its 30 days).
  const ownerOf = (content: string, date: string): string | null => {
    // IC-3 (all time): the latest same-name post on/before the day; a visit
    // before every such post goes to the earliest one.
    const owners = keyed.filter((k) => byName.get(k.id)?.includes(content)).sort((a, b) => a.postDate.localeCompare(b.postDate));
    if (!owners.length) return null;
    const onOrBefore = owners.filter((k) => k.postDate <= date);
    return (onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : owners[0]).id;
  };

  const sum = (rows: AttributionRow[], pred: (r: AttributionRow) => boolean, from: string, to: string) =>
    rows.reduce((a, r) => (r.date >= from && r.date <= to && pred(r) ? a + r.sessions : a), 0);

  for (const p of keyed) {
    // IC-3: all time - UTM visits on any day; a plain-link estimate runs from the
    // post date until the next post to the same page (or today).
    const last30 = today;
    let windowEnd = last30;
    let share = 1;
    if (p.estPath) {
      for (const o of keyed) {
        if (o.id === p.id || o.estPath !== p.estPath) continue;
        if (o.postDate > p.postDate) windowEnd = minDate(windowEnd, addDays(o.postDate, -1));
        else if (o.postDate === p.postDate) share++;
      }
    }

    const named = p.utmContent ? [] : byName.get(p.id) ?? [];
    const contents = p.utmContent ? [p.utmContent] : named;
    const exactPred = (r: AttributionRow) => {
      const c = normContent(r.content);
      if (p.utmContent) return c === p.utmContent;
      return named.includes(c) && ownerOf(c, r.date) === p.id;
    };
    const visitsExact = contents.length ? sum(visits, exactPred, ALL_TIME, today) : 0;
    const demosExact = contents.length ? sum(demos, exactPred, ALL_TIME, today) : 0;

    let visitsEst = 0, demosEst = 0, demosEstRaw = 0;
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
      demosEstRaw = sum(demos, pool, p.postDate, windowEnd);
    }

    byPost[p.id] = {
      postDate: p.postDate, exactEnd: last30, utmContent: contents.length ? contents.join(", ") : null,
      utmContents: contents, matchedBy: p.utmContent ? "link" : named.length ? "name" : null, estPath: p.estPath, windowEnd,
      visitsExact, visitsEst, demosExact, demosEst, demosEstRaw, dealsExact: 0, dealsEst: 0,
    };
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
      visits: sum(visits, isInfluencerUtm, ALL_TIME, today) + visitsEst,
      demos: sum(demos, isInfluencerUtm, ALL_TIME, today) + demosEst,
      deals: 0, dealsEst: 0, // filled in by the data layer (HubSpot match)
      visitsEst, demosEst, from, to: today,
    },
  };
}

// ---------------------------------------------------------------------------
// Deals: label each minute-level demo booking with the post it belongs to, so
// the shared HubSpot matcher (lib/analytics/organic-deals.ts) counts matched
// deals per post. Channel labels: "<id>|exact", "<id>|est", "bucket|exact"
// (an influencer-UTM booking that matches no post).
// ---------------------------------------------------------------------------

export interface BookingMinuteRow { time: string; source: string; medium: string; content: string; landingPage: string; device: string; location: string }

export function labelBookings(byPost: Record<string, PostAttribution>, rows: BookingMinuteRow[]): { channel: string; time: string; landingPage: string; device: string; location: string }[] {
  const posts = Object.entries(byPost);
  const out: { channel: string; time: string; landingPage: string; device: string; location: string }[] = [];
  for (const r of rows) {
    const date = r.time.slice(0, 10);
    let label: string | null = null;
    if (r.medium.trim().toLowerCase() === "influencer") {
      const c = r.content.trim().toLowerCase();
      // Latest post on/before the day that counts this UTM (same-name posts share one).
      const hit = posts
        .filter(([, a]) => a.utmContents.includes(c))
        .sort(([, x], [, y]) => (x.postDate <= date) === (y.postDate <= date) ? y.postDate.localeCompare(x.postDate) : x.postDate <= date ? -1 : 1)[0];
      label = hit ? `${hit[0]}|exact` : "bucket|exact";
    } else if (/linkedin|lnkd/i.test(r.source)) {
      const p = normPath(r.landingPage);
      const hit = posts.find(([, a]) => a.estPath === p && date >= a.postDate && date <= a.windowEnd);
      if (hit) label = `${hit[0]}|est`;
    }
    if (label) out.push({ channel: label, time: r.time, landingPage: r.landingPage, device: r.device, location: r.location });
  }
  return out;
}

// ---------------------------------------------------------------------------
// IC-1: every UTM link GA4 has seen from LinkedIn (or with medium=influencer),
// one row per utm_content (else per campaign), with the collab it belongs to.
// ---------------------------------------------------------------------------

export interface UtmLinkRow {
  key: string;                // utm_content, or "campaign:<name>" when no content
  content: string | null;
  campaign: string | null;
  source: string;
  medium: string;
  visits: number;
  demos: number;
  firstDate: string;
  lastDate: string;
  topLanding: string | null;
  collabId: string | null;    // the collab this UTM is counted for, if any
}

export function summarizeUtmLinks(
  visits: AttributionRow[], demos: AttributionRow[], byPost: Record<string, PostAttribution>, from: string, to: string,
): UtmLinkRow[] {
  const isUtm = (r: AttributionRow) =>
    (isLinkedIn(r) || isInfluencerUtm(r)) && (hasContent(r.content) || hasContent(r.campaign));
  const keyOf = (r: AttributionRow) => (hasContent(r.content) ? normContent(r.content) : `campaign:${normContent(r.campaign)}`);
  const rows = new Map<string, UtmLinkRow & { landing: Map<string, number> }>();
  for (const r of visits) {
    if (!isUtm(r) || r.date < from || r.date > to) continue;
    const k = keyOf(r);
    const row = rows.get(k) ?? {
      key: k, content: hasContent(r.content) ? normContent(r.content) : null,
      campaign: hasContent(r.campaign) ? r.campaign.trim() : null, source: r.source, medium: r.medium,
      visits: 0, demos: 0, firstDate: r.date, lastDate: r.date, topLanding: null, collabId: null, landing: new Map<string, number>(),
    };
    row.visits += r.sessions;
    if (r.date < row.firstDate) row.firstDate = r.date;
    if (r.date > row.lastDate) row.lastDate = r.date;
    const lp = normPath(r.landingPage);
    row.landing.set(lp, (row.landing.get(lp) ?? 0) + r.sessions);
    rows.set(k, row);
  }
  for (const r of demos) {
    if (!isUtm(r) || r.date < from || r.date > to) continue;
    const row = rows.get(keyOf(r));
    if (row) row.demos += r.sessions;
  }
  const owners = Object.entries(byPost);
  return [...rows.values()]
    .map(({ landing, ...row }) => ({
      ...row,
      topLanding: [...landing.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      collabId: row.content ? owners.find(([, a]) => a.utmContents.includes(row.content!))?.[0] ?? null : null,
    }))
    .sort((a, b) => b.visits - a.visits || b.lastDate.localeCompare(a.lastDate));
}
