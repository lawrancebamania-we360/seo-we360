// Blog Clusters - GSC queries (GC-15..GC-17, GC-19): the weekly planning step
// that runs after the GSC refresh. For one cluster:
//   1. works out the page each search term's changes go on (target_url);
//   2. checks Google's US mobile top 3 for terms not checked in 30 days (Apify);
//   3. reads our target pages (weekly) and the top-3 pages (monthly, best effort);
//   4. asks Claude to plan each page once - one title/meta for the page, plus
//      per-term options, drafts, "already on the page" and "why they rank".
// Works to a deadline and reports `done: false` when time ran out, so the cron
// calls again and it continues where it stopped (everything is cached).
// Never touches approved terms or wording a person edited. Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSerpTop } from "@/lib/apify/serp";
import { getPageScans } from "@/lib/seo/page-scan";
import { planPageWithClaude, type PlanTerm } from "@/lib/blog-clusters/plan-pages-ai";
import { hubOf, loadCluster, type ItemRow } from "@/lib/blog-clusters/gsc-refresh";
import { resolveRankingPages } from "@/lib/blog-clusters/page-names";
import { diagnose, suggestedUseOptions } from "@/lib/blog-clusters/query-insights";
import {
  USE_OPTIONS,
  type PageScan, type QueryAction, type QueryDrafts, type QuerySerp, type QueryUsage, type QueryUseOption,
} from "@/lib/types/cluster-gsc";

export const PLAN_MIGRATION = "20261125000001_cluster_gsc_page_plan";

const DAY = 86_400_000;
const SERP_MAX_AGE = 30 * DAY;
const SERP_RETRY_AFTER_FAIL = 20 * 60_000; // a failed Google check is retried on the next pass
const OUR_SCAN_MAX_AGE = 6 * DAY;
const THEIR_SCAN_MAX_AGE = 30 * DAY;
const REPLAN_UNPLANNED_AFTER = 6 * DAY;
const SERP_BATCH = 4;       // search terms per Apify run (10 timed out)
const SERP_PARALLEL = 5;    // Apify runs in flight
const PLAN_PARALLEL = 3;    // pages planned at once
const PAGE_TERMS = 25;      // terms per Claude call (bigger pages are chunked)
const USED: QueryAction[] = ["assign", "hub", "update_existing"];

type Db = SupabaseClient;

interface Row {
  id: string; query: string; impressions: number; clicks: number; position: number | string;
  ranking_page: string | null; action: QueryAction; item_id: string | null; status: string;
  assigned_by: string | null; usages: string[] | null; drafts: QueryDrafts | null; anchors: string[] | null;
  serp: QuerySerp | null; serp_at: string | null; target_url: string | null; planned_at: string | null;
}

export interface PlanRunResult {
  ok: boolean;
  error?: string;
  /** False when the deadline cut the run short - call again to continue. */
  done: boolean;
  serpChecked: number;
  pagesRead: number;
  pagesPlanned: number;
  termsPlanned: number;
  errors: string[];
}

const hasText = (d: QueryDrafts | null | undefined) =>
  !!d && ["title", "meta", "h2", "faqQuestion", "faqAnswer", "paragraph", "template"].some((k) => {
    const v = (d as Record<string, unknown>)[k];
    return typeof v === "string" && v.trim().length > 0;
  });

/**
 * One form per page: https, no trailing slash, no query/hash. Any address on
 * our own domain (apex, www, staging...) maps to the live host - a post saved
 * with its staging link is the same page on the live site.
 */
function canon(u: string, liveHost: string): string {
  try {
    const url = new URL(u);
    const apex = liveHost.replace(/^www\./, "");
    const host = url.hostname === apex || url.hostname.endsWith(`.${apex}`) ? liveHost : url.hostname;
    const path = url.pathname.replace(/\/+$/, "");
    return `https://${host}${path || "/"}`;
  } catch { return u; }
}

function absolute(u: string | null | undefined, origin: string): string | null {
  const s = (u ?? "").trim();
  if (!s) return null;
  const liveHost = (() => { try { return new URL(origin).hostname; } catch { return "www.we360.ai"; } })();
  if (/^https?:\/\//i.test(s)) return canon(s, liveHost);
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(s)) return canon(`https://${s}`, liveHost);
  return canon(`${origin}/${s.replace(/^\/+/, "")}`, liveHost);
}

const legacyUsage = (u: QueryUseOption[]): QueryUsage | null =>
  u.includes("h2") ? "h2" : u.includes("faq") ? "faq" : u.length ? "body" : null;

async function inChunks<T>(items: T[], size: number, fn: (x: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

export async function planClusterGscPages(
  db: Db, args: { projectId: string; clusterId: string; deadline: number },
): Promise<PlanRunResult> {
  const result: PlanRunResult = { ok: true, done: false, serpChecked: 0, pagesRead: 0, pagesPlanned: 0, termsPlanned: 0, errors: [] };
  const probe = await db.from("topic_cluster_gsc_queries").select("planned_at").limit(1);
  if (probe.error) return { ...result, ok: false, error: `Apply migration ${PLAN_MIGRATION} in Supabase first.` };

  const loaded = await loadCluster(db, args.projectId, args.clusterId);
  if (!loaded) return { ...result, ok: false, error: "Cluster not found." };
  const { cluster, items } = loaded;
  const hub = hubOf(cluster);

  const { data, error } = await db.from("topic_cluster_gsc_queries")
    .select("id, query, impressions, clicks, position, ranking_page, action, item_id, status, assigned_by, usages, drafts, anchors, serp, serp_at, target_url, planned_at")
    .eq("cluster_id", args.clusterId).in("action", USED).neq("status", "rejected")
    .order("impressions", { ascending: false });
  if (error) return { ...result, ok: false, error: error.message };
  const rows = (data ?? []) as Row[];
  if (!rows.length) return { ...result, done: true };

  // 1. Where each term's changes go.
  const origin = (() => {
    const any = rows.find((r) => r.ranking_page)?.ranking_page;
    try { return any ? new URL(any).origin : "https://www.we360.ai"; } catch { return "https://www.we360.ai"; }
  })();
  const itemById = new Map<string, ItemRow>(items.map((i) => [i.id, i]));
  const pageInfo = await resolveRankingPages(db, args.projectId, rows.map((r) => r.ranking_page));
  type Target = { key: string; url: string | null; primary: string | null; plannedTitle: string | null };
  const targetOf = (r: Row): Target | null => {
    if (r.action === "assign") {
      const it = r.item_id ? itemById.get(r.item_id) : undefined;
      if (!it) return null;
      const url = absolute(it.published_url || it.tasks?.published_url, origin);
      return { key: url ?? `planned:${it.id}`, url, primary: it.target_keyword, plannedTitle: it.title };
    }
    if (r.action === "hub") {
      const url = absolute(hub.slug, origin);
      return { key: url ?? "planned:hub", url, primary: hub.keyword, plannedTitle: hub.title };
    }
    const url = absolute(r.ranking_page, origin);
    if (!url) return null;
    const info = r.ranking_page ? pageInfo.get(r.ranking_page) : undefined;
    return { key: url, url, primary: info?.primaryKeyword ?? null, plannedTitle: info?.title ?? null };
  };
  const target = new Map<string, Target>();
  const moved = new Map<string, string[]>(); // new target_url -> row ids whose target changed
  for (const r of rows) {
    const t = targetOf(r);
    if (!t) continue;
    target.set(r.id, t);
    if ((r.target_url ?? null) !== t.url) {
      const k = t.url ?? "";
      moved.set(k, [...(moved.get(k) ?? []), r.id]);
      r.target_url = t.url;
      r.planned_at = null; // a different page - plan again
    }
  }
  for (const [url, ids] of moved) {
    await db.from("topic_cluster_gsc_queries").update({ target_url: url || null, planned_at: null }).in("id", ids);
  }

  // 2. Google's top 3 (US, mobile), for terms not checked in 30 days.
  const needSerp = rows.filter((r) => target.has(r.id) && (!r.serp_at || Date.now() - Date.parse(r.serp_at) > SERP_MAX_AGE));
  while (needSerp.length && Date.now() < args.deadline - 170_000) {
    const round = needSerp.splice(0, SERP_BATCH * SERP_PARALLEL);
    const batches: Row[][] = [];
    for (let i = 0; i < round.length; i += SERP_BATCH) batches.push(round.slice(i, i + SERP_BATCH));
    await Promise.all(batches.map(async (batch) => {
      const now = new Date().toISOString();
      const retryAt = new Date(Date.now() - SERP_MAX_AGE + SERP_RETRY_AFTER_FAIL).toISOString();
      let found: Awaited<ReturnType<typeof fetchSerpTop>> | null = null;
      try {
        found = await fetchSerpTop(batch.map((r) => r.query), {
          country: "us", mobile: true, topN: 3, timeoutMs: Math.max(60_000, Math.min(170_000, args.deadline - Date.now() - 50_000)),
        });
      } catch (e) {
        result.errors.push(`Google check: ${e instanceof Error ? e.message.slice(0, 160) : "failed"}`);
      }
      await inChunks(batch, 10, async (r) => {
        const hit = found?.get(r.query.trim().toLowerCase());
        r.serp = hit ? { country: "us", device: "mobile", at: now, top: hit.top.map((t) => ({ ...t, scan: null })), ourPosition: hit.ourPosition, paa: hit.paa } : r.serp;
        r.serp_at = hit ? now : retryAt; // a miss is retried on the next pass
        if (hit) result.serpChecked++;
        await db.from("topic_cluster_gsc_queries").update({ serp: r.serp, serp_at: r.serp_at }).eq("id", r.id);
      });
    }));
  }
  const serpPending = needSerp.length > 0;
  // Finish every Google check first; plan on a later call with time to spare.
  if (serpPending) return { ...result, done: false };
  if (result.serpChecked > 0 && args.deadline - Date.now() < 140_000) return { ...result, done: false };

  // 3. Which terms to (re)plan: suggested, not hand-edited, Google checked.
  const needsPlan = (r: Row) => !r.planned_at
    || (!!r.serp_at && Date.parse(r.serp_at) > Date.parse(r.planned_at))
    || (!r.drafts?.whyTheyRank && Date.now() - Date.parse(r.planned_at) > REPLAN_UNPLANNED_AFTER);
  const editable = (r: Row) => r.status === "suggested" && !(r.assigned_by === "manual" && hasText(r.drafts));
  // Never plan without Google's top 3: a term whose check failed waits for the retry.
  const toPlan = rows.filter((r) => target.has(r.id) && editable(r) && !!r.serp && needsPlan(r));
  if (!toPlan.length) return { ...result, done: !serpPending };

  // Pages: group the terms by target page.
  const pages = new Map<string, { target: Target; terms: Row[] }>();
  for (const r of toPlan) {
    const t = target.get(r.id)!;
    const p = pages.get(t.key) ?? { target: t, terms: [] };
    p.terms.push(r);
    pages.set(t.key, p);
  }

  // 4. Read our pages (weekly) and the top-3 pages (monthly), best effort.
  const ours = [...pages.values()].map((p) => p.target.url).filter((u): u is string => !!u);
  const ourScans = await getPageScans(db, args.projectId, ours, { maxAgeMs: OUR_SCAN_MAX_AGE, deadline: args.deadline - 110_000 });
  const theirs = toPlan.flatMap((r) => (r.serp?.top ?? []).map((t) => t.url));
  const theirScans = await getPageScans(db, args.projectId, theirs, { maxAgeMs: THEIR_SCAN_MAX_AGE, deadline: args.deadline - 100_000 });
  result.pagesRead = ourScans.size + theirScans.size;
  for (const r of toPlan) {
    if (!r.serp) continue;
    r.serp = { ...r.serp, top: r.serp.top.map((t) => ({ ...t, scan: theirScans.get(t.url)?.scan ?? t.scan ?? null })) };
  }

  // A title already approved (or planned and not being redone) for a page is kept.
  const fixedTitle = (key: string, planning: Set<string>): { title: string | null; meta: string | null } => {
    const others = rows.filter((r) => target.get(r.id)?.key === key && !planning.has(r.id) && r.drafts?.title
      && (r.usages ?? []).includes("title_meta"));
    const pick = others.find((r) => r.status === "accepted") ?? others[0];
    return { title: pick?.drafts?.title ?? null, meta: pick?.drafts?.meta ?? null };
  };

  // 5. Plan each page.
  const pageList = [...pages.entries()];
  let started = 0;
  let skipped = false;
  const planOne = async ([key, page]: [string, { target: Target; terms: Row[] }]) => {
    // Our page wasn't read in time - plan it on the next call rather than blind.
    if (page.target.url && !ourScans.has(page.target.url)) { skipped = true; return; }
    const planning = new Set(page.terms.map((r) => r.id));
    let { title: keepTitle, meta: keepMeta } = fixedTitle(key, planning);
    const scan: PageScan | null = page.target.url ? ourScans.get(page.target.url)?.scan ?? null : null;
    for (let i = 0; i < page.terms.length; i += PAGE_TERMS) {
      const chunk = page.terms.slice(i, i + PAGE_TERMS);
      const terms: PlanTerm[] = chunk.map((r) => {
        const metrics = { query: r.query, position: Number(r.position), impressions: r.impressions, clicks: r.clicks };
        const stored = (r.usages ?? []).filter((u): u is QueryUseOption => (USE_OPTIONS as string[]).includes(u));
        return {
          id: r.id, query: r.query, impressions: r.impressions, clicks: r.clicks, position: Number(r.position),
          diagnosis: diagnose(metrics), action: r.action,
          fixedUsages: r.assigned_by === "manual" && stored.length ? stored : null,
          hintUsages: suggestedUseOptions(metrics, r.action),
          top: r.serp?.top ?? [], ourPosition: r.serp?.ourPosition ?? null, paa: r.serp?.paa ?? [],
        };
      });
      const res = await planPageWithClaude({
        clusterName: cluster.cluster_name, url: page.target.url, status: page.target.url ? "live" : "planned",
        primaryKeyword: page.target.primary, plannedTitle: page.target.plannedTitle, scan,
        approvedTitle: keepTitle, approvedMeta: keepMeta, terms,
      });
      const now = new Date().toISOString();
      if (!res.ok) {
        result.errors.push(`${page.target.url ?? page.target.plannedTitle ?? key}: ${res.error}`);
        // Marked as tried, so this run doesn't loop; retried at next week's run.
        await db.from("topic_cluster_gsc_queries").update({ planned_at: now }).in("id", chunk.map((r) => r.id));
        continue;
      }
      if (res.title) { keepTitle = res.title; keepMeta = res.meta; }
      await inChunks(chunk, 10, async (r) => {
        const p = res.terms.get(r.id);
        const patch: Record<string, unknown> = { planned_at: now, serp: r.serp };
        if (p) {
          const tm = p.usages.includes("title_meta");
          patch.usages = p.usages;
          patch.usage = legacyUsage(p.usages);
          patch.drafts = {
            title: tm ? res.title : null, meta: tm ? res.meta : null,
            h2: p.h2, faqQuestion: p.faqQuestion, faqAnswer: p.faqAnswer, paragraph: p.paragraph, template: p.template,
            alreadyOnPage: p.alreadyOnPage, whyTheyRank: p.whyTheyRank,
            titleKeepsPrimary: tm ? res.titleKeepsPrimary : null,
          } satisfies QueryDrafts;
          if (p.usages.includes("link_text") && p.anchors.length && !(r.anchors ?? []).length) patch.anchors = p.anchors;
          result.termsPlanned++;
        }
        await db.from("topic_cluster_gsc_queries").update(patch).eq("id", r.id);
      });
    }
    result.pagesPlanned++;
  };
  await Promise.all(Array.from({ length: Math.min(PLAN_PARALLEL, pageList.length) }, async () => {
    while (started < pageList.length && Date.now() < args.deadline - 75_000) {
      const next = pageList[started++];
      await planOne(next);
    }
  }));

  result.done = started >= pageList.length && !skipped;
  return result;
}
