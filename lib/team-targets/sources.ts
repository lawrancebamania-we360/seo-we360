// Team Targets: work recorded on other dashboard pages counts toward the
// matching target on its own (TT-1..TT-6), so nobody logs the same thing twice
// and an edit/delete on the source page changes the count immediately. These
// "auto" logs are computed at read time from the source tables - nothing is
// copied into team_target_logs.
//
// A target picks its source by its task name:
//   "Backlinks Exchange"               -> Backlinks (earned_backlinks), unpaid links
//   "Paid backlinks ... (DR 70+)"      -> Backlinks, paid links at/above the DR
//   "Blog Submissions on 11 platforms" -> Backlink Submissions (not LinkedIn)
//   "LinkedIn articles"                -> Backlink Submissions on a LinkedIn platform
//   "Reddit citations"                 -> Reddit Citations rows the person owns
//   "Publish Reddit citations"         -> Reddit Citations marked published
//   "... influencer ..."               -> Influencer Collabs whose post date has passed
//   "Find N blog-submission platforms" -> platforms added on Backlink Submissions
//   "... new blog cluster ..."         -> Blog Clusters the person owns, by creation
//
// Each item goes to the target its person OWNS; only when they own none for that
// source does it fall back to a target they co-own (so one item is never counted
// twice across a personal and a shared target). Server only (reads with the
// caller's Supabase client, so RLS applies).

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn } from "@/lib/ai-citation/run-state";
import { addDays, todayIst } from "@/lib/team-targets/week";
import type { LogVerification, TargetLog } from "@/lib/team-targets/types";
import type { Period } from "@/lib/team-targets/period";

export type SourceKey =
  | "backlinks" | "blog_submissions" | "linkedin_articles" | "reddit_added" | "reddit_published"
  | "influencer" | "platforms" | "clusters";

export interface SourceRule { key: SourceKey; paid?: boolean; minDr?: number | null }

/** Where each source lives - shown on the log ("From Backlink Submissions"). */
export const SOURCE_PAGE: Record<SourceKey, string> = {
  backlinks: "Backlinks",
  blog_submissions: "Backlink Submissions",
  linkedin_articles: "Backlink Submissions",
  reddit_added: "Reddit Citations",
  reddit_published: "Reddit Citations",
  influencer: "Influencer Collabs",
  platforms: "Backlink Submissions",
  clusters: "Blog Clusters",
};

/** Backlink targets keep their own helper - the Executive dashboard uses it. */
export function backlinkRuleFor(task: string): { paid: boolean; minDr: number | null } | null {
  const t = task.trim();
  if (/^backlinks?\s+exchange$/i.test(t)) return { paid: false, minDr: null };
  if (/^paid\s+backlinks?\b/i.test(t)) {
    const m = t.match(/DR\s*(\d{1,3})\s*\+/i);
    return { paid: true, minDr: m ? Number(m[1]) : null };
  }
  return null;
}

export function sourceRuleFor(task: string): SourceRule | null {
  const t = task.trim();
  const bl = backlinkRuleFor(t);
  if (bl) return { key: "backlinks", paid: bl.paid, minDr: bl.minDr };
  if (/keyword plan/i.test(t)) return null; // a hand-off doc, not the work itself
  if (/^find\b/i.test(t) && /platforms?/i.test(t) && /submission/i.test(t)) return { key: "platforms" };
  if (/\bblog[\s-]*submissions?\b/i.test(t)) return { key: "blog_submissions" };
  if (/^linked\s*in\s+articles?$/i.test(t)) return { key: "linkedin_articles" };
  if (/^publish\s+reddit\s+citations?$/i.test(t)) return { key: "reddit_published" };
  if (/^reddit\s+citations?$/i.test(t)) return { key: "reddit_added" };
  if (/\binfluencer/i.test(t)) return { key: "influencer" };
  if (/\bnew\s+blog\s+cluster\b/i.test(t)) return { key: "clusters" };
  return null;
}

/** Same shape as a team_target_logs row as the data layer reads it, plus auto markers. */
export interface AutoLog {
  id: string; target_id: string; log_date: string; link: string | null; quantity: number; note: string | null;
  verification_status: LogVerification; verification_reason: string | null; verification_kind: TargetLog["kind"];
  reported_by: string | null; reported_at: string; verified_by: string | null; verified_at: string | null;
  auto: true; auto_source: string;
  /** Stable identity of the source item (for de-duplicating hand logs of the same thing). */
  dedupe_link: string | null;
}

interface TargetLite { id: string; task: string; owner_id: string | null; co_owner_id: string | null; co_owner_2_id?: string | null }

/** One unit of work found on a source page. person = who gets the credit (null = any target owner). */
interface SourceItem {
  id: string; person: string | null; date: string; link: string | null; note: string | null;
  status: LogVerification; reason?: string;
}

const istDate = (ts: string) => todayIst(new Date(ts));
const inPeriod = (d: string, p: Period) => d >= p.start && d <= p.end;
// Timestamps are stored in UTC; widen the query a day each side, then filter by IST date.
const tsFrom = (p: Period) => `${addDays(p.start, -1)}T00:00:00Z`;
const tsTo = (p: Period) => `${addDays(p.end, 1)}T23:59:59Z`;

async function backlinkItems(db: SupabaseClient, projectId: string, period: Period, rule: SourceRule): Promise<SourceItem[]> {
  const BASE = "id, website, backlink_url, acquired_date, domain_rating, assigned_to, amount_paid";
  const sel = (cols: string) => db.from("earned_backlinks").select(cols)
    .eq("project_id", projectId).gte("acquired_date", period.start).lte("acquired_date", period.end);
  let res = await sel(`${BASE}, link_type`);
  if (res.error && isMissingColumn(res.error.message)) res = await sel(BASE);
  if (res.error || !res.data) return [];
  type Row = { id: string; website: string; backlink_url: string | null; acquired_date: string; domain_rating: number | null; assigned_to: string | null; amount_paid: number | string | null; link_type?: string | null };
  const out: SourceItem[] = [];
  for (const b of res.data as unknown as Row[]) {
    if (!b.assigned_to) continue;
    const paid = Number(b.amount_paid ?? 0) > 0 || /^paid$/i.test((b.link_type ?? "").trim());
    if (paid !== !!rule.paid) continue;
    if (rule.minDr != null && (b.domain_rating ?? 0) < rule.minDr) continue;
    out.push({
      id: b.id, person: b.assigned_to, date: b.acquired_date, link: b.backlink_url || b.website,
      note: [b.website, b.domain_rating != null ? `DR ${b.domain_rating}` : null, b.link_type].filter(Boolean).join(" · "),
      status: "owner_verified",
    });
  }
  return out;
}

async function submissionItems(db: SupabaseClient, projectId: string, period: Period, linkedin: boolean): Promise<SourceItem[]> {
  const { data, error } = await db.from("backlink_submissions")
    .select("id, submission_date, submission_url, assigned_to, created_by, verification_status, verification_note, topic_name, backlink_websites ( domain, removed_at )")
    .eq("project_id", projectId).gte("submission_date", period.start).lte("submission_date", period.end).limit(10000);
  if (error || !data) return [];
  type Row = {
    id: string; submission_date: string; submission_url: string; assigned_to: string | null; created_by: string | null;
    verification_status: string | null; verification_note: string | null; topic_name: string | null;
    backlink_websites: { domain: string; removed_at: string | null } | null;
  };
  const out: SourceItem[] = [];
  for (const s of data as unknown as Row[]) {
    const domain = s.backlink_websites?.domain ?? "";
    if (s.backlink_websites?.removed_at) continue;              // platform removed
    if (/linked\s*in/i.test(domain) !== linkedin) continue;     // LinkedIn articles have their own target
    const person = s.assigned_to ?? s.created_by;
    if (!person) continue;
    // Counts once added; only a failed AI check counts against it (TT-2).
    const status: LogVerification = s.verification_status === "not_found" ? "not_found"
      : s.verification_status === "topic_mismatch" ? "mismatch" : "owner_verified";
    out.push({
      id: s.id, person, date: s.submission_date, link: s.submission_url,
      note: [domain, s.topic_name].filter(Boolean).join(" · ") || null, status,
      reason: status === "owner_verified" ? undefined : `Backlink Submissions check: ${s.verification_note ?? s.verification_status}`,
    });
  }
  return out;
}

async function redditItems(db: SupabaseClient, projectId: string, period: Period, published: boolean): Promise<SourceItem[]> {
  const { data: clusters } = await db.from("reddit_citation_clusters").select("id, removed_at").eq("project_id", projectId);
  const live = new Set(((clusters ?? []) as { id: string; removed_at: string | null }[]).filter((c) => !c.removed_at).map((c) => c.id));
  let q = db.from("reddit_citation_items")
    .select("id, cluster_id, prompt, reddit_link, owner_id, published, published_url, published_at, created_at")
    .eq("project_id", projectId);
  q = published
    ? q.eq("published", true).gte("published_at", tsFrom(period)).lte("published_at", tsTo(period))
    : q.gte("created_at", tsFrom(period)).lte("created_at", tsTo(period));
  const { data, error } = await q.limit(5000);
  if (error || !data) return [];
  type Row = { id: string; cluster_id: string; prompt: string; reddit_link: string | null; owner_id: string | null; published: boolean; published_url: string | null; published_at: string | null; created_at: string };
  const out: SourceItem[] = [];
  for (const r of data as Row[]) {
    if (!live.has(r.cluster_id)) continue;
    if (published) {
      if (!r.published_at) continue;
      out.push({ id: r.id, person: null, date: istDate(r.published_at), link: r.published_url || r.reddit_link, note: r.prompt, status: "owner_verified" });
    } else {
      if (!r.owner_id || !r.reddit_link) continue;
      out.push({ id: r.id, person: r.owner_id, date: istDate(r.created_at), link: r.reddit_link, note: r.prompt, status: "owner_verified" });
    }
  }
  return out;
}

async function influencerItems(db: SupabaseClient, projectId: string, period: Period, now: Date): Promise<SourceItem[]> {
  const today = todayIst(now);
  const { data, error } = await db.from("influencer_collabs")
    .select("id, influencer_name, platform, post_date, post_link, profile_link, assigned_to, created_by")
    .eq("project_id", projectId).gte("post_date", period.start).lte("post_date", period.end).limit(5000);
  if (error || !data) return [];
  type Row = { id: string; influencer_name: string; platform: string; post_date: string; post_link: string | null; profile_link: string; assigned_to: string | null; created_by: string | null };
  return (data as Row[])
    .filter((c) => c.post_date <= today && (c.assigned_to ?? c.created_by))
    .map((c) => ({
      id: c.id, person: c.assigned_to ?? c.created_by, date: c.post_date, link: c.post_link || c.profile_link,
      note: `${c.influencer_name} · ${c.platform}`, status: "owner_verified" as const,
    }));
}

async function platformItems(db: SupabaseClient, projectId: string, period: Period): Promise<SourceItem[]> {
  const { data, error } = await db.from("backlink_websites").select("id, domain, created_by, created_at, removed_at")
    .eq("project_id", projectId).gte("created_at", tsFrom(period)).lte("created_at", tsTo(period));
  if (error || !data) return [];
  type Row = { id: string; domain: string; created_by: string | null; created_at: string; removed_at: string | null };
  return (data as Row[])
    .filter((w) => !w.removed_at && w.created_by)
    .map((w) => ({ id: w.id, person: w.created_by, date: istDate(w.created_at), link: w.domain, note: "New submission platform", status: "owner_verified" as const }));
}

async function clusterItems(db: SupabaseClient, projectId: string, period: Period): Promise<SourceItem[]> {
  const { data, error } = await db.from("topic_clusters").select("id, cluster_name, owner_id, created_at")
    .eq("project_id", projectId).gte("created_at", tsFrom(period)).lte("created_at", tsTo(period));
  if (error || !data) return [];
  type Row = { id: string; cluster_name: string; owner_id: string | null; created_at: string };
  return (data as Row[])
    .filter((c) => c.owner_id)
    .map((c) => ({ id: c.id, person: c.owner_id, date: istDate(c.created_at), link: null, note: `Cluster: ${c.cluster_name}`, status: "owner_verified" as const }));
}

/** Every auto log for these targets in the period. Best-effort: a missing table yields none. */
export async function sourceLogs(
  db: SupabaseClient, projectId: string, period: Period, targets: TargetLite[], now: Date = new Date(),
): Promise<AutoLog[]> {
  const ruled = targets.map((t) => ({ t, rule: sourceRuleFor(t.task) })).filter((x): x is { t: TargetLite; rule: SourceRule } => !!x.rule);
  if (!ruled.length) return [];

  // Load each source once (backlinks vary by rule, so key those by rule).
  const cache = new Map<string, Promise<SourceItem[]>>();
  const load = (rule: SourceRule): Promise<SourceItem[]> => {
    const ck = rule.key === "backlinks" ? `backlinks|${rule.paid}|${rule.minDr}` : rule.key;
    if (!cache.has(ck)) {
      const p = (async () => {
        try {
          switch (rule.key) {
            case "backlinks": return await backlinkItems(db, projectId, period, rule);
            case "blog_submissions": return await submissionItems(db, projectId, period, false);
            case "linkedin_articles": return await submissionItems(db, projectId, period, true);
            case "reddit_added": return await redditItems(db, projectId, period, false);
            case "reddit_published": return await redditItems(db, projectId, period, true);
            case "influencer": return await influencerItems(db, projectId, period, now);
            case "platforms": return await platformItems(db, projectId, period);
            case "clusters": return await clusterItems(db, projectId, period);
          }
        } catch { return []; }
      })();
      cache.set(ck, p);
    }
    return cache.get(ck)!;
  };

  const out: AutoLog[] = [];
  const byKey = new Map<string, { t: TargetLite; rule: SourceRule }[]>();
  for (const x of ruled) {
    const k = x.rule.key === "backlinks" ? `backlinks|${x.rule.paid}|${x.rule.minDr}` : x.rule.key;
    byKey.set(k, [...(byKey.get(k) ?? []), x]);
  }
  for (const group of byKey.values()) {
    const items = (await load(group[0].rule)).filter((i) => inPeriod(i.date, period));
    const page = SOURCE_PAGE[group[0].rule.key];
    for (const item of items) {
      // Who gets it: targets the person owns, else ones they co-own. A person-less
      // item (a published Reddit citation) goes to every target of this source.
      let hits = item.person ? group.filter((g) => g.t.owner_id === item.person) : group;
      if (item.person && !hits.length) hits = group.filter((g) => g.t.co_owner_id === item.person || g.t.co_owner_2_id === item.person);
      for (const { t } of hits) {
        out.push({
          id: `auto-${t.id}-${item.id}`, target_id: t.id, log_date: item.date, link: item.link, quantity: 1, note: item.note,
          verification_status: item.status,
          verification_reason: item.reason ?? `Counted automatically from ${page} - edit or remove it there.`,
          verification_kind: "third_party",
          reported_by: item.person ?? t.owner_id, reported_at: item.date, verified_by: null, verified_at: null,
          auto: true, auto_source: page, dedupe_link: item.link,
        });
      }
    }
  }
  return out;
}
