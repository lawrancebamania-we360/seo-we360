"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BlogAuditDecision } from "@/lib/data/blog-audit";
import { formatDataBacking, type UrlMetric } from "@/lib/types/url-metrics";

// ============ Create a Sprint task from an audit finding ============
//
// Decision → task shape:
//   refresh → kind=blog_task (or web_task for /solutions, /vs, etc.),
//             task_type=Update Post/Page, title "Update existing blog: <slug>"
//   merge   → kind=web_task, task_type=Modify Page, title "Merge <url> -> <target>"
//   prune   → kind=web_task, task_type=Delete Page, title "Prune: 410 <url>"
//
// Pre-fills `data_backing` with the URL's latest GSC + GA4 metrics so the
// AI prompt and the writer's brief both have the live numbers built in.

interface CreateTaskInput {
  projectId: string;
  url: string;
  decision: BlogAuditDecision;
  ownerId: string | null;          // profile id; null = unassigned
  notes?: string;
  // For merge decisions, the URL we want to 301-redirect into. Auto-detected
  // by the audit page but admin can override in the create dialog before
  // submitting (in case the suggested target is wrong).
  mergeTargetUrl?: string;
  mergeTargetQuery?: string;
}

export async function createTaskFromAuditFinding(input: CreateTaskInput): Promise<{ taskId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (!role || (role !== "super_admin" && role !== "admin")) {
    throw new Error("Only admins can create audit tasks");
  }

  // Don't recreate if there's already an in-flight task for this URL.
  // Published tasks ≥ 90 days old don't block (that's the stale state).
  const { data: existing } = await supabase
    .from("tasks")
    .select("id, status, completed_at")
    .eq("project_id", input.projectId)
    .or(`url.eq.${input.url},published_url.eq.${input.url}`);
  for (const t of (existing ?? []) as Array<{ id: string; status: string; completed_at: string | null }>) {
    if (["todo", "in_progress", "review"].includes(t.status)) {
      throw new Error(`A task already exists for this URL (id: ${t.id.slice(0, 8)}). Open that one instead.`);
    }
    if (t.status === "done" && t.completed_at) {
      const ageDays = Math.floor((Date.now() - new Date(t.completed_at).getTime()) / 86400000);
      if (ageDays < 90) {
        throw new Error(`URL was published ${ageDays} days ago. Wait until 90 days have passed before creating a refresh task.`);
      }
    }
  }

  // Build URL-derived hints.
  const path = safePath(input.url);
  const slug = path.split("/").filter(Boolean).pop() ?? "page";
  const isBlogPath = path.includes("/blog/");

  // Pull the latest 90d metrics to seed data_backing.
  const { data: m } = await supabase
    .from("url_metrics_latest")
    .select("*")
    .eq("project_id", input.projectId)
    .eq("url", input.url)
    .eq("period", "90d")
    .maybeSingle();
  const metric = m as UrlMetric | null;

  const { title, kind, task_type, target_keyword, priority } = buildTaskShape({
    decision: input.decision,
    slug,
    isBlogPath,
    metric,
    mergeTargetUrl: input.mergeTargetUrl,
  });
  const data_backing = metric ? formatDataBacking(metric) : null;

  const insertRow = {
    project_id: input.projectId,
    title,
    url: input.url,
    kind,
    task_type,
    target_keyword,
    priority,
    status: "todo" as const,
    source: "ai_suggestion" as const,
    created_by: user.id,
    team_member_id: input.ownerId,
    impact: notesWithDecision(input.decision, input.notes, input.mergeTargetUrl, input.mergeTargetQuery),
    data_backing,
    word_count_target: input.decision === "refresh" ? (metric?.gsc_impressions && metric.gsc_impressions > 1000 ? 2000 : 1500) : null,
    intent: "informational",
  };

  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) throw new Error(`Insert failed: ${error.message}`);

  revalidatePath("/dashboard/blog-audit");
  revalidatePath("/dashboard/sprint");
  revalidatePath("/dashboard/tasks");
  return { taskId: (inserted as { id: string }).id };
}

// ============ Dismiss / undismiss findings ============

export async function dismissAuditFinding(projectId: string, url: string, decision: BlogAuditDecision, reason?: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (!role || (role !== "super_admin" && role !== "admin")) {
    throw new Error("Only admins can dismiss findings");
  }

  const { error } = await supabase
    .from("blog_audit_dismissals")
    .upsert(
      {
        project_id: projectId,
        url,
        decision,
        dismissed_by_id: user.id,
        dismissed_at: new Date().toISOString(),
        reason: reason ?? null,
      },
      { onConflict: "project_id,url,decision" },
    );
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/blog-audit");
}

export async function undismissAuditFinding(projectId: string, url: string, decision: BlogAuditDecision): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (!role || (role !== "super_admin" && role !== "admin")) throw new Error("Only admins");
  const { error } = await supabase
    .from("blog_audit_dismissals")
    .delete()
    .eq("project_id", projectId)
    .eq("url", url)
    .eq("decision", decision);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/blog-audit");
}

// ============ Helpers ============

interface BuildArgs {
  decision: BlogAuditDecision;
  slug: string;
  isBlogPath: boolean;
  metric: UrlMetric | null;
  mergeTargetUrl?: string;
}

interface TaskShape {
  title: string;
  kind: "blog_task" | "web_task";
  task_type: "Update Post" | "Update Page" | "Delete Page" | "Modify Page" | null;
  target_keyword: string | null;
  priority: "critical" | "high" | "medium" | "low";
}

function buildTaskShape({ decision, slug, isBlogPath, metric, mergeTargetUrl }: BuildArgs): TaskShape {
  const top = metric?.gsc_top_queries?.[0]?.query ?? null;

  if (decision === "refresh") {
    return {
      title: `Update existing ${isBlogPath ? "blog" : "page"}: ${prettySlug(slug)}`,
      kind: isBlogPath ? "blog_task" : "web_task",
      task_type: isBlogPath ? "Update Post" : "Update Page",
      target_keyword: top,
      priority: metric && metric.gsc_impressions > 2000 ? "high" : "medium",
    };
  }
  if (decision === "merge") {
    // Include the target slug in the title when we know it so the writer
    // sees "Merge X -> Y" on the kanban card without opening the task.
    const targetSlug = mergeTargetUrl ? safePath(mergeTargetUrl).split("/").filter(Boolean).pop() : null;
    const title = targetSlug
      ? `Merge ${prettySlug(slug)} -> ${prettySlug(targetSlug)} (301 redirect)`
      : `Merge cannibalized URL: ${prettySlug(slug)}`;
    return {
      title,
      kind: "web_task",
      task_type: "Modify Page",
      target_keyword: top,
      priority: "medium",
    };
  }
  if (decision === "prune") {
    return {
      title: `Prune (410 + remove): ${prettySlug(slug)}`,
      kind: "web_task",
      task_type: "Delete Page",
      target_keyword: null,
      priority: "low",
    };
  }
  // 'keep' should never reach here — the UI blocks it — but fall through safely.
  return {
    title: `Audit follow-up: ${prettySlug(slug)}`,
    kind: isBlogPath ? "blog_task" : "web_task",
    task_type: null,
    target_keyword: top,
    priority: "low",
  };
}

function prettySlug(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function safePath(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

function notesWithDecision(
  d: BlogAuditDecision,
  notes?: string,
  mergeTargetUrl?: string,
  mergeTargetQuery?: string,
): string {
  const parts: string[] = [`Blog audit finding: ${d.toUpperCase()}.`];
  if (d === "merge" && mergeTargetUrl) {
    parts.push(`Redirect destination: ${mergeTargetUrl}.`);
    if (mergeTargetQuery) {
      parts.push(`Cannibalized keyword: "${mergeTargetQuery}".`);
    }
    parts.push(
      "Steps: 1) add 301 from this URL to the destination in next.config / hosting redirects; "
      + "2) merge any unique sections from this post into the destination; "
      + "3) remove this URL from sitemap.xml; "
      + "4) update internal links pointing to this URL.",
    );
  }
  if (notes) parts.push(notes);
  return parts.join(" ");
}
