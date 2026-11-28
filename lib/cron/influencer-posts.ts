// Daily influencer-post sync (LinkedIn).
//
// For every LinkedIn collab whose post link points at a single post:
//   - LINKS, ONCE: while links_scraped_at is empty, scrape the post WITH its
//     comments and save the we360.ai link in the post body + the influencer's
//     own comment link (only into empty fields), then stamp links_scraped_at.
//     After that the links are never scraped again (per direction) - a person
//     can still correct them by hand.
//   - METRICS, DAILY: from the post date to day METRIC_DAYS, read reactions /
//     comments / reposts (no comments fetched) and save one row per day. A day
//     someone already entered by hand (source='manual') is never overwritten.
// Posts that aren't public get a readable scrape_error instead of silent blanks.
// Safe to run more than once a day: the day's auto row is just refreshed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { isMissingColumn, isMissingTable } from "@/lib/ai-citation/run-state";
import { activityIdOf, extractPostLinks, isLinkedInPostUrl, scrapeLinkedInPosts, type ScrapedPost } from "@/lib/influencer/linkedin";

export const METRIC_DAYS = 15;

export interface InfluencerSyncSummary {
  ok: boolean;
  checked: number;       // LinkedIn collabs with a post to track today
  scraped: number;       // posts sent to the scraper
  metricsSaved: number;
  keptManual: number;    // days skipped because someone entered them by hand
  linksFound: number;    // posts whose links were found this run
  errors: number;
  note?: string;
  /** IC-4: posts that couldn't be read, with a plain reason (shown after "Refresh now"). */
  skipped: { name: string; reason: string }[];
}

type CollabRow = {
  id: string; project_id: string; influencer_name: string; post_link: string | null; post_date: string;
  links_scraped_at: string | null; post_body_link: string | null; comment_link: string | null; scrape_error: string | null;
};

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const NOT_A_POST = "This link is a profile or activity page, not a single post — paste the post's own link (… → Copy link to post).";

/**
 * opts.allPosts (IC-4, the "Refresh now" button): read every LinkedIn post that
 * has a single-post link, whatever its age. The daily cron keeps to each
 * post's first METRIC_DAYS days.
 */
export async function runInfluencerPostSync(admin: SupabaseClient, opts: { projectId?: string; allPosts?: boolean } = {}): Promise<InfluencerSyncSummary> {
  const summary: InfluencerSyncSummary = { ok: true, checked: 0, scraped: 0, metricsSaved: 0, keptManual: 0, linksFound: 0, errors: 0, skipped: [] };
  const token = env().APIFY_TOKEN;
  if (!token) return { ...summary, ok: false, note: "APIFY_TOKEN is not set." };
  const today = istToday();

  let q = admin
    .from("influencer_collabs")
    .select("id, project_id, influencer_name, post_link, post_date, links_scraped_at, post_body_link, comment_link, scrape_error")
    .eq("platform", "LinkedIn")
    .not("post_link", "is", null)
    .lte("post_date", today);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  const { data, error } = await q;
  if (error) {
    if (isMissingColumn(error.message) || isMissingTable(error.message)) return { ...summary, ok: false, note: "Apply migration 20261118000001 first." };
    return { ...summary, ok: false, note: error.message };
  }
  const rows = (data ?? []) as CollabRow[];

  const setError = async (r: CollabRow, msg: string | null) => {
    if (r.scrape_error === msg) return;
    await admin.from("influencer_collabs").update({ scrape_error: msg }).eq("id", r.id);
  };

  // Which posts need what today.
  const withLinks: CollabRow[] = [];   // link lookup still pending (comments fetched)
  const metricsOnly: CollabRow[] = []; // inside the 15-day window, links already done
  for (const r of rows) {
    if (!isLinkedInPostUrl(r.post_link)) {
      await setError(r, NOT_A_POST);
      summary.skipped.push({ name: r.influencer_name, reason: "the saved link is a profile or activity page, not the post" });
      continue;
    }
    const day = daysBetween(r.post_date, today);
    const inWindow = day >= 0 && (opts.allPosts || day <= METRIC_DAYS);
    if (!r.links_scraped_at) withLinks.push(r);
    else if (inWindow) metricsOnly.push(r);
  }
  summary.checked = withLinks.length + metricsOnly.length;
  if (!summary.checked) return summary;

  // Existing rows for today, so a manual entry is never overwritten.
  const ids = [...withLinks, ...metricsOnly].map((r) => r.id);
  const manualToday = new Set<string>();
  const ex = await admin.from("influencer_post_metrics").select("collab_id, source").in("collab_id", ids).eq("captured_on", today);
  if (ex.error) {
    if (isMissingColumn(ex.error.message) || isMissingTable(ex.error.message)) return { ...summary, ok: false, note: "Apply migration 20261118000001 first." };
  }
  for (const m of (ex.data ?? []) as { collab_id: string; source: string }[]) if (m.source === "manual") manualToday.add(m.collab_id);

  const handle = async (r: CollabRow, s: ScrapedPost | undefined, lookUpLinks: boolean) => {
    if (!s) { summary.errors++; summary.skipped.push({ name: r.influencer_name, reason: "LinkedIn returned nothing for it" }); return; }
    if (!s.ok) summary.skipped.push({ name: r.influencer_name, reason: /public|removed/i.test(s.error ?? "") ? "the post isn't public (or was removed)" : (s.error ?? "it couldn't be read") });
    const transportFailure = !!s.error && s.error.startsWith("Scraper failed");

    // Metrics (any post that came back with counts; after day 15 this is just
    // the one reading taken during the link lookup for an older post).
    if (s.ok) {
      if (manualToday.has(r.id)) summary.keptManual++;
      else {
        const up = await admin.from("influencer_post_metrics").upsert({
          project_id: r.project_id, collab_id: r.id, captured_on: today,
          reactions: s.reactions, comments: s.comments, reposts: s.reposts,
          source: "auto", updated_by: null, updated_at: new Date().toISOString(),
        }, { onConflict: "collab_id,captured_on" });
        if (up.error) summary.errors++; else summary.metricsSaved++;
      }
    } else summary.errors++;

    // Links, once. A transport failure retries tomorrow; a post that simply
    // isn't public is not re-scraped for links again.
    if (lookUpLinks && !transportFailure) {
      const links = s.ok ? await extractPostLinks(s) : { postBodyLink: null, commentLink: null };
      const patch: Record<string, string | null> = { links_scraped_at: new Date().toISOString() };
      if (!r.post_body_link && links.postBodyLink) patch.post_body_link = links.postBodyLink;
      if (!r.comment_link && links.commentLink) patch.comment_link = links.commentLink;
      if (links.postBodyLink || links.commentLink) summary.linksFound++;
      await admin.from("influencer_collabs").update(patch).eq("id", r.id);
    }
    await setError(r, s.ok ? null : s.error);
  };

  const run = async (batch: CollabRow[], lookUpLinks: boolean) => {
    if (!batch.length) return;
    // De-dupe by post (two collab rows could point at the same post).
    const urls = [...new Map(batch.map((r) => [activityIdOf(r.post_link)!, r.post_link as string])).values()];
    summary.scraped += urls.length;
    const results = await scrapeLinkedInPosts(token, urls, lookUpLinks);
    for (const r of batch) await handle(r, results.get(activityIdOf(r.post_link)!), lookUpLinks);
  };

  await run(withLinks, true);
  await run(metricsOnly, false);
  return summary;
}
