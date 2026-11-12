// Reddit Citations: reads over reddit_citation_clusters / reddit_citation_items
// for the month-cards page and the per-month detail (the prompt/thread table +
// an owner-progress panel). Read with the signed-in client so RLS decides what
// the person sees; all writes live in lib/actions/reddit-citations.ts.

import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/team-targets/db";

// "2026-10" -> "Oct 26". Falls back to the raw key if it isn't YYYY-MM.
export function monthLabel(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return monthKey;
  const name = new Date(Date.UTC(year, month, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${name} ${String(year % 100).padStart(2, "0")}`;
}

/** The current month as a YYYY-MM key, in IST (how the team thinks about it). */
export function currentMonthKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}

export interface RedditClusterCard {
  id: string;
  monthKey: string;
  label: string;
  title: string | null;
  citationCount: number;
  publishedCount: number;
  ownerNames: string[];
  hasKeywordPlan: boolean;
  createdAt: string;
}

export interface RedditCitationRow {
  id: string;
  position: number;
  prompt: string;
  source: string | null;
  redditLink: string | null;
  example: string | null;
  ownerId: string | null;
  ownerName: string | null;
  published: boolean;
  publishedUrl: string | null;
}

export interface RedditClusterDetail {
  id: string;
  monthKey: string;
  label: string;
  title: string | null;
  keywordPlanUrl: string | null;
  items: RedditCitationRow[];
}

async function nameMap(
  supabase: Awaited<ReturnType<typeof createClient>>, ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return names;
  const { data } = await supabase.from("profiles").select("id, name").in("id", unique);
  for (const p of (data ?? []) as { id: string; name: string }[]) names.set(p.id, p.name);
  return names;
}

export async function getRedditClusters(projectId: string): Promise<{ ready: boolean; clusters: RedditClusterCard[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reddit_citation_clusters")
    .select("id, month_key, title, keyword_plan_url, created_at")
    .eq("project_id", projectId).is("removed_at", null)
    .order("month_key", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return { ready: false, clusters: [] };
    return { ready: true, clusters: [] };
  }
  const rows = (data ?? []) as { id: string; month_key: string; title: string | null; keyword_plan_url: string | null; created_at: string }[];
  if (!rows.length) return { ready: true, clusters: [] };

  const { data: itemsData } = await supabase
    .from("reddit_citation_items")
    .select("cluster_id, owner_id, published")
    .in("cluster_id", rows.map((r) => r.id));
  const items = (itemsData ?? []) as { cluster_id: string; owner_id: string | null; published: boolean }[];
  const names = await nameMap(supabase, items.map((i) => i.owner_id ?? "").filter(Boolean));

  const clusters: RedditClusterCard[] = rows.map((r) => {
    const its = items.filter((i) => i.cluster_id === r.id);
    const owners = [...new Set(its.map((i) => i.owner_id).filter((x): x is string => !!x))];
    return {
      id: r.id,
      monthKey: r.month_key,
      label: r.title?.trim() || monthLabel(r.month_key),
      title: r.title,
      citationCount: its.length,
      publishedCount: its.filter((i) => i.published).length,
      ownerNames: owners.map((id) => names.get(id)).filter((n): n is string => !!n),
      hasKeywordPlan: !!r.keyword_plan_url,
      createdAt: r.created_at,
    };
  });
  return { ready: true, clusters };
}

export async function getRedditClusterDetail(projectId: string, clusterId: string): Promise<RedditClusterDetail | null> {
  const supabase = await createClient();
  const { data: cluster, error } = await supabase
    .from("reddit_citation_clusters")
    .select("id, month_key, title, keyword_plan_url")
    .eq("id", clusterId).eq("project_id", projectId).is("removed_at", null).maybeSingle();
  if (error || !cluster) return null;
  const c = cluster as { id: string; month_key: string; title: string | null; keyword_plan_url: string | null };

  const { data: itemsData } = await supabase
    .from("reddit_citation_items")
    .select("id, position, prompt, source, reddit_link, example, owner_id, published, published_url")
    .eq("cluster_id", clusterId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  const rows = (itemsData ?? []) as {
    id: string; position: number; prompt: string; source: string | null; reddit_link: string | null;
    example: string | null; owner_id: string | null; published: boolean; published_url: string | null;
  }[];

  const names = await nameMap(supabase, rows.map((r) => r.owner_id ?? "").filter(Boolean));

  const items: RedditCitationRow[] = rows.map((r) => ({
    id: r.id, position: r.position, prompt: r.prompt, source: r.source, redditLink: r.reddit_link,
    example: r.example, ownerId: r.owner_id, ownerName: r.owner_id ? names.get(r.owner_id) ?? null : null,
    published: r.published, publishedUrl: r.published_url,
  }));

  return {
    id: c.id, monthKey: c.month_key, label: c.title?.trim() || monthLabel(c.month_key),
    title: c.title, keywordPlanUrl: c.keyword_plan_url, items,
  };
}
