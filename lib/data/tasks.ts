import { createClient } from "@/lib/supabase/server";
import type { Task, Profile, Pillar, Priority, TaskKind, Competition, Intent } from "@/lib/types/database";

export interface TaskWithAssignee extends Task {
  assignee: { id: string; name: string; avatar_url: string | null } | null;
  reviewer: { id: string; name: string; avatar_url: string | null } | null;
}

export interface TaskFilterParams {
  pillar?: Pillar | "all";
  priority?: Priority | "all";
  assignee?: string | "all" | "unassigned";
  range?: "all" | "today" | "upcoming" | "30d" | "60d" | "90d" | "overdue" | "custom";
  start?: string;
  end?: string;
  kind?: TaskKind;
  competition?: Competition | "all";
  intent?: Intent | "all";
  q?: string;
}

export async function getTasks(projectId: string, filters: TaskFilterParams = {}): Promise<TaskWithAssignee[]> {
  const supabase = await createClient();
  let q = supabase
    .from("tasks")
    .select("*, assignee:profiles!team_member_id(id, name, avatar_url), reviewer:profiles!reviewed_by_id(id, name, avatar_url)")
    .eq("project_id", projectId);

  if (filters.kind) q = q.eq("kind", filters.kind);
  if (filters.pillar && filters.pillar !== "all") q = q.eq("pillar", filters.pillar);
  if (filters.priority && filters.priority !== "all") q = q.eq("priority", filters.priority);
  if (filters.competition && filters.competition !== "all") q = q.eq("competition", filters.competition);
  if (filters.intent && filters.intent !== "all") q = q.eq("intent", filters.intent);
  if (filters.assignee && filters.assignee !== "all") {
    if (filters.assignee === "unassigned") q = q.is("team_member_id", null);
    else q = q.eq("team_member_id", filters.assignee);
  }

  if (filters.q && filters.q.trim().length > 0) {
    const term = filters.q.trim().replace(/[%_]/g, "\\$&");
    q = q.or(`title.ilike.%${term}%,issue.ilike.%${term}%,target_keyword.ilike.%${term}%,url.ilike.%${term}%`);
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  // Helper — returns ISO date N days from today (forward).
  const daysAhead = (n: number) => {
    const d = new Date(today); d.setDate(d.getDate() + n); return iso(d);
  };

  if (filters.range === "today") {
    q = q.eq("scheduled_date", iso(today));
  } else if (filters.range === "upcoming") {
    // "This week" — current calendar week (Mon to Sun of the week containing today).
    // Sprint weeks are scheduled by week-of-month, so we want the whole week's
    // tasks to show up regardless of which day "today" falls on.
    const dow = today.getDay();              // 0=Sun, 1=Mon, ... 6=Sat
    const offsetToMon = (dow + 6) % 7;       // days back to last Monday
    const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - offsetToMon);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    q = q.gte("scheduled_date", iso(weekStart)).lte("scheduled_date", iso(weekEnd));
  } else if (filters.range === "30d") {
    q = q.gte("scheduled_date", iso(today)).lte("scheduled_date", daysAhead(30));
  } else if (filters.range === "60d") {
    q = q.gte("scheduled_date", iso(today)).lte("scheduled_date", daysAhead(60));
  } else if (filters.range === "90d") {
    q = q.gte("scheduled_date", iso(today)).lte("scheduled_date", daysAhead(90));
  } else if (filters.range === "overdue") {
    q = q.lt("scheduled_date", iso(today)).eq("done", false);
  } else if (filters.range === "custom" && (filters.start || filters.end)) {
    if (filters.start) q = q.gte("scheduled_date", filters.start);
    if (filters.end) q = q.lte("scheduled_date", filters.end);
  }

  const { data, error } = await q
    .order("done", { ascending: true })
    .order("priority", { ascending: true })
    .order("scheduled_date", { ascending: true });

  if (error) {
    console.error("[getTasks]", error);
    return [];
  }
  return (data ?? []) as unknown as TaskWithAssignee[];
}

// Returns only people who can OWN tasks — excludes clients (who have read
// access but can't be assigned work).
export async function getTeamMembers(): Promise<Pick<Profile, "id" | "name" | "email" | "avatar_url">[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, avatar_url")
    .neq("role", "client")
    .order("name");
  return (data ?? []) as unknown as Pick<Profile, "id" | "name" | "email" | "avatar_url">[];
}
