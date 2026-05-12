// Blog audit data layer.
//
// V2 — reads directly from url_metrics_latest, applies classifyUrl, and
// joins with tasks + dismissals to compute the current worklist state per
// URL. No more separate blog_audit / blog_audit_runs tables — the daily
// sync into url_metrics is the source of truth.

import { createClient } from "@/lib/supabase/server";
import { classifyUrl, type UrlMetric, type MetricPeriod, type UrlTopQuery } from "@/lib/types/url-metrics";

export type BlogAuditDecision = "prune" | "merge" | "refresh" | "keep";
export type AuditFindingStatus =
  | "open"          // flagged, no action yet
  | "task_open"     // task created and still active (todo/in_progress/review)
  | "task_done"     // task finished but within the 90-day cooldown — finding is "resolved-recently"
  | "stale"         // task was Published >90 days ago — needs a fresh task if metrics regressed
  | "keep"          // classifyUrl says no action needed
  | "dismissed";    // admin marked "won't fix"

// Suggested redirect target for a merge candidate — the sibling URL on the
// same site that ranks BEST for one of our cannibalized queries. Computed
// by an inverted index over gsc_top_queries across all 90d snapshots.
export interface MergeTarget {
  url: string;
  query: string;          // the shared keyword the target out-ranks us on
  targetPosition: number; // sibling's avg position for that query
  myPosition: number;     // our avg position for the same query
  targetClicks: number;   // sibling's clicks for that query (last 90d)
}

export interface BlogAuditFinding {
  url: string;
  decision: BlogAuditDecision;
  reason: string;
  diagnostic: string;                  // one-line "what's actually wrong" headline
  status: AuditFindingStatus;
  // metrics for the 90-day window (largest sample, most stable signal)
  metrics: UrlMetric;
  // metric trio across the three windows so the UI can show trend chips
  windows: Partial<Record<MetricPeriod, UrlMetric>>;
  // when status is task_open / task_done / stale, this is the linked task
  task: { id: string; title: string; status: string; completed_at: string | null } | null;
  daysSinceTaskPublished: number | null;  // null unless task_done or stale
  dismissal: { dismissed_at: string; reason: string | null } | null;
  // Populated for merge candidates only. null = no obvious stronger sibling
  // found (rare — usually means the page ranks for very unique queries).
  mergeTarget: MergeTarget | null;
}

export interface BlogAuditSnapshot {
  pulled_at: string | null;          // latest snapshot_date from url_metrics
  total_urls: number;
  counts: Record<BlogAuditDecision, number>;
  open_counts: Record<BlogAuditDecision, number>;   // open + stale (need action)
  findings: BlogAuditFinding[];
}

const COOLDOWN_DAYS = 90;

function decisionReason(d: BlogAuditDecision, m: UrlMetric): string {
  switch (d) {
    case "prune":
      return "Invisible to Google. Zero impressions and zero sessions in 90 days.";
    case "merge":
      return `Cannibalized signals — position ${m.gsc_position.toFixed(1)}, only ${m.ga_sessions} sessions, ${(m.ga_engagement_rate * 100).toFixed(0)}% engagement.`;
    case "refresh":
      return `Striking distance — position ${m.gsc_position.toFixed(1)} with ${m.gsc_impressions.toLocaleString()} impressions but only ${m.gsc_clicks} clicks.`;
    case "keep":
      return `Performing well — position ${m.gsc_position.toFixed(1)}, ${m.gsc_clicks} clicks.`;
  }
}

// One-line "what's actually wrong" diagnostic — surfaces the specific
// failure metric instead of the generic decision label. Shown prominently
// on each finding row so the admin doesn't have to do the math.
export function diagnoseIssue(d: BlogAuditDecision, m: UrlMetric): string {
  const ctrPct = m.gsc_ctr * 100;
  const engagedPct = m.ga_engagement_rate * 100;

  switch (d) {
    case "prune":
      return "Indexed but invisible — 0 impressions and 0 sessions for 90 days. Safe to 410 and remove from sitemap.";

    case "merge": {
      const parts: string[] = [];
      if (m.gsc_position > 30) parts.push(`buried at position ${m.gsc_position.toFixed(0)}`);
      if (m.ga_sessions < 20) parts.push(`only ${m.ga_sessions} sessions`);
      if (engagedPct < 30) parts.push(`${engagedPct.toFixed(0)}% engagement`);
      return parts.length > 0
        ? `Cannibalized — ${parts.join(", ")}. Redirect into a stronger sibling.`
        : "Cannibalized signals. Redirect into a stronger sibling.";
    }

    case "refresh": {
      // Pick the worst-performing dimension as the headline issue.
      const parts: string[] = [];
      if (m.gsc_position >= 8 && m.gsc_position <= 20) {
        parts.push(`stuck at position ${m.gsc_position.toFixed(0)}`);
      }
      if (ctrPct < 2 && m.gsc_impressions > 100) {
        parts.push(`CTR ${ctrPct.toFixed(2)}% (target 2%+)`);
      }
      const ratio = m.gsc_impressions > 0 ? m.gsc_clicks / m.gsc_impressions : 0;
      if (ratio < 0.005 && m.gsc_impressions > 1000) {
        parts.push("very high impressions, near-zero clicks");
      }
      if (engagedPct < 50 && m.ga_sessions > 50) {
        parts.push(`only ${engagedPct.toFixed(0)}% engaged sessions`);
      }
      // Mention the top query so the admin knows what's pulling traffic.
      const topQ = m.gsc_top_queries?.[0];
      const suffix = topQ
        ? ` Top query: "${topQ.query}" (${topQ.clicks}c / ${topQ.impressions}i, pos ${topQ.position.toFixed(1)}).`
        : "";
      return parts.length > 0
        ? `${parts.join(", ")}.${suffix}`
        : `Striking distance for improvement at position ${m.gsc_position.toFixed(1)}.${suffix}`;
    }

    case "keep": {
      const topQ = m.gsc_top_queries?.[0];
      return topQ
        ? `Healthy — pos ${m.gsc_position.toFixed(1)}, CTR ${ctrPct.toFixed(1)}%. Top query "${topQ.query}" at pos ${topQ.position.toFixed(1)}.`
        : `Healthy — pos ${m.gsc_position.toFixed(1)}, CTR ${ctrPct.toFixed(1)}%.`;
    }
  }
}

export async function getBlogAudit(projectId: string): Promise<BlogAuditSnapshot> {
  const supabase = await createClient();

  // ---- 1. Pull the latest snapshot row per URL+period
  const { data: metricsData } = await supabase
    .from("url_metrics_latest")
    .select("*")
    .eq("project_id", projectId);
  const metrics = (metricsData ?? []) as UrlMetric[];

  // Group by URL → { '30d': UrlMetric, '60d': ..., '90d': ... }
  const byUrl = new Map<string, Partial<Record<MetricPeriod, UrlMetric>>>();
  for (const m of metrics) {
    let entry = byUrl.get(m.url);
    if (!entry) { entry = {}; byUrl.set(m.url, entry); }
    entry[m.period as MetricPeriod] = m;
  }

  // ---- Inverted index for merge-target detection
  //
  // query → list of (url, position, clicks, impressions) entries, drawn from
  // every URL's 90d gsc_top_queries. For a merge candidate ranking #71 for
  // "jobs to be done", any URL ranking #5 for the same query is a stronger
  // sibling and a sensible redirect destination.
  //
  // We only index 90d so the suggestion is based on a stable sample, and
  // we lowercase the query key so casing variants ("CRM" vs "crm") collapse.
  const queryIndex = new Map<string, Array<{ url: string; position: number; clicks: number; impressions: number }>>();
  for (const m of metrics) {
    if (m.period !== "90d") continue;
    for (const q of m.gsc_top_queries ?? []) {
      const key = q.query.toLowerCase();
      const arr = queryIndex.get(key) ?? [];
      arr.push({ url: m.url, position: q.position, clicks: q.clicks, impressions: q.impressions });
      queryIndex.set(key, arr);
    }
  }

  // ---- 2. Pull dismissals and existing tasks for these URLs in one shot each
  const urls = [...byUrl.keys()];

  const { data: dismissals } = await supabase
    .from("blog_audit_dismissals")
    .select("url, decision, dismissed_at, reason")
    .eq("project_id", projectId)
    .in("url", urls.length ? urls : ["__none__"]);
  const dismissalByKey = new Map<string, { dismissed_at: string; reason: string | null }>();
  for (const d of (dismissals ?? []) as Array<{ url: string; decision: string; dismissed_at: string; reason: string | null }>) {
    dismissalByKey.set(`${d.url}::${d.decision}`, { dismissed_at: d.dismissed_at, reason: d.reason });
  }

  const { data: tasksData } = await supabase
    .from("tasks")
    .select("id, title, status, completed_at, url, published_url, scheduled_date, created_at")
    .eq("project_id", projectId)
    .or(`url.in.(${quoteForIn(urls)}),published_url.in.(${quoteForIn(urls)})`);
  const tasksByUrl = groupTasksByUrl((tasksData ?? []) as TaskRow[]);

  // ---- 3. Build findings
  const findings: BlogAuditFinding[] = [];
  const counts: Record<BlogAuditDecision, number> = { prune: 0, merge: 0, refresh: 0, keep: 0 };
  const open_counts: Record<BlogAuditDecision, number> = { prune: 0, merge: 0, refresh: 0, keep: 0 };

  for (const [url, windows] of byUrl) {
    // Prefer 90d for the classification — most stable signal.
    const m90 = windows["90d"] ?? windows["60d"] ?? windows["30d"];
    if (!m90) continue;
    const decision = classifyUrl(m90);
    counts[decision]++;

    // Determine status with the 90-day-window rule.
    const relatedTask = bestTaskForUrl(tasksByUrl.get(url) ?? []);
    let status: AuditFindingStatus = "open";
    let daysSinceTaskPublished: number | null = null;
    if (decision === "keep") {
      status = "keep";
    } else if (dismissalByKey.has(`${url}::${decision}`)) {
      status = "dismissed";
    } else if (relatedTask) {
      const isLive = relatedTask.status === "done";
      const isOpen = ["todo", "in_progress", "review"].includes(relatedTask.status);
      if (isOpen) {
        status = "task_open";
      } else if (isLive && relatedTask.completed_at) {
        daysSinceTaskPublished = Math.floor(
          (Date.now() - new Date(relatedTask.completed_at).getTime()) / (1000 * 60 * 60 * 24),
        );
        status = daysSinceTaskPublished >= COOLDOWN_DAYS ? "stale" : "task_done";
      }
    }

    if (decision !== "keep" && (status === "open" || status === "stale")) {
      open_counts[decision]++;
    }

    // Compute the suggested merge target only for merge candidates — every
    // other decision either has nothing to redirect to (keep, refresh) or
    // is a hard delete (prune).
    const mergeTarget = decision === "merge"
      ? findMergeTarget(url, m90.gsc_top_queries ?? [], queryIndex)
      : null;

    const diagnosticWithTarget = decision === "merge" && mergeTarget
      ? `${diagnoseIssue(decision, m90)} Suggested target: ${mergeTarget.url} (ranks #${mergeTarget.targetPosition.toFixed(1)} for "${mergeTarget.query}").`
      : diagnoseIssue(decision, m90);

    findings.push({
      url,
      decision,
      reason: decisionReason(decision, m90),
      diagnostic: diagnosticWithTarget,
      status,
      metrics: m90,
      windows,
      task: relatedTask
        ? { id: relatedTask.id, title: relatedTask.title, status: relatedTask.status, completed_at: relatedTask.completed_at }
        : null,
      daysSinceTaskPublished,
      dismissal: dismissalByKey.get(`${url}::${decision}`) ?? null,
      mergeTarget,
    });
  }

  // Sort: open (most actionable) first by impressions desc, then stale, then task_open,
  // then task_done, then keep, then dismissed.
  const order: Record<AuditFindingStatus, number> = {
    open: 0, stale: 1, task_open: 2, task_done: 3, keep: 4, dismissed: 5,
  };
  findings.sort((a, b) => {
    const so = order[a.status] - order[b.status];
    if (so !== 0) return so;
    return b.metrics.gsc_impressions - a.metrics.gsc_impressions;
  });

  const pulled_at = metrics.length > 0
    ? metrics.map((m) => m.snapshot_date).sort().reverse()[0]
    : null;

  return {
    pulled_at,
    total_urls: byUrl.size,
    counts,
    open_counts,
    findings,
  };
}

// ============ helpers ============

interface TaskRow {
  id: string;
  title: string;
  status: string;
  completed_at: string | null;
  url: string | null;
  published_url: string | null;
  scheduled_date: string | null;
  created_at: string;
}

function quoteForIn(urls: string[]): string {
  if (urls.length === 0) return "'__none__'";
  return urls.map((u) => `"${u.replace(/"/g, '""')}"`).join(",");
}

function groupTasksByUrl(rows: TaskRow[]): Map<string, TaskRow[]> {
  const out = new Map<string, TaskRow[]>();
  for (const t of rows) {
    for (const u of [t.url, t.published_url]) {
      if (!u) continue;
      const arr = out.get(u) ?? [];
      arr.push(t);
      out.set(u, arr);
    }
  }
  return out;
}

// Find the strongest sibling URL to redirect a cannibalized page into.
//
// Strategy: walk the candidate's top 10 queries (the keywords IT ranks for),
// look up every other URL in the project that also ranks for the same query
// at a BETTER (lower-number) position, and pick the highest-scoring one.
//
// Scoring weights position heavily (lower is better) and adds clicks/impressions
// as a tiebreaker so we prefer pages that are actually pulling traffic on the
// shared keyword, not just nominally ranking #5 with zero clicks.
function findMergeTarget(
  candidateUrl: string,
  candidateQueries: UrlTopQuery[],
  queryIndex: Map<string, Array<{ url: string; position: number; clicks: number; impressions: number }>>,
): MergeTarget | null {
  let best: { target: MergeTarget; score: number } | null = null;

  for (const myQ of candidateQueries.slice(0, 10)) {
    const competitors = queryIndex.get(myQ.query.toLowerCase()) ?? [];
    for (const c of competitors) {
      if (c.url === candidateUrl) continue;
      // Only a sensible target if it actually ranks better than us. We use a
      // 5-position threshold so we don't recommend pages that are only
      // marginally ahead (#65 vs #71 isn't a clear winner).
      if (c.position >= myQ.position - 5) continue;

      // Position is the dominant factor; clicks/impressions break ties.
      const score = (100 - c.position) * 10 + c.clicks * 5 + c.impressions * 0.05;
      if (!best || score > best.score) {
        best = {
          target: {
            url: c.url,
            query: myQ.query,
            targetPosition: c.position,
            myPosition: myQ.position,
            targetClicks: c.clicks,
          },
          score,
        };
      }
    }
  }

  return best?.target ?? null;
}

// Pick the most relevant task to link to from this URL's history.
// Priority: any active task first (one is in-flight), else most-recent published.
function bestTaskForUrl(tasks: TaskRow[]): TaskRow | null {
  if (tasks.length === 0) return null;
  const active = tasks.find((t) => ["todo", "in_progress", "review"].includes(t.status));
  if (active) return active;
  // Otherwise the most recently completed.
  const done = [...tasks]
    .filter((t) => t.status === "done" && t.completed_at)
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  return done[0] ?? tasks[0];
}
