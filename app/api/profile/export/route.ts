import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GDPR Article 20 (data portability) + India DPDP equivalent.
// Returns a JSON dump of everything tied to the signed-in user — profile,
// memberships, projects they created, authored tasks/articles/wins, comments,
// and AI artefacts they generated. Ready to re-ingest or archive.
//
// What's deliberately NOT in the export:
//   - Crawl / audit findings for projects — that's site data, not personal data
//   - Another user's authored content in shared projects
//   - BYOK API keys (we never store these)

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Use admin client to pull across tables without tripping RLS on rows the
  // user still owns but RLS would filter (e.g. their memberships in projects
  // they left access for).
  const admin = createAdminClient();

  const [
    profileRes,
    membershipsRes,
    permissionsRes,
    projectsCreatedRes,
    tasksAuthoredRes,
    articlesAuthoredRes,
    commentsRes,
    winsRes,
    eeatRes,
    clustersRes,
    auditLogsRes,
  ] = await Promise.all([
    admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    admin.from("project_memberships").select("*").eq("user_id", user.id),
    admin.from("member_permissions").select("*").eq("user_id", user.id),
    admin.from("projects").select("*").eq("created_by", user.id),
    admin.from("tasks").select("*").eq("created_by", user.id),
    admin.from("articles").select("*").eq("created_by", user.id),
    admin.from("article_comments").select("*").eq("user_id", user.id),
    admin.from("wins").select("*").eq("created_by", user.id),
    admin.from("eeat_reports").select("*").eq("generated_by", user.id),
    admin.from("topic_clusters").select("*").eq("generated_by", user.id),
    admin.from("audit_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    format_version: 1,
    notes: [
      "This export contains personal data tied to your account.",
      "BYOK API keys are NEVER in this file — they're not stored server-side.",
      "Audit findings / crawl data for shared projects are not included — those are site data, not personal data.",
    ],
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
    },
    profile: profileRes.data ?? null,
    project_memberships: membershipsRes.data ?? [],
    member_permissions: permissionsRes.data ?? [],
    projects_i_created: projectsCreatedRes.data ?? [],
    tasks_i_created: tasksAuthoredRes.data ?? [],
    articles_i_wrote: articlesAuthoredRes.data ?? [],
    comments_i_posted: commentsRes.data ?? [],
    wins_i_logged: winsRes.data ?? [],
    eeat_reports_i_generated: eeatRes.data ?? [],
    topic_clusters_i_generated: clustersRes.data ?? [],
    audit_log_entries: auditLogsRes.data ?? [],
  };

  const body = JSON.stringify(payload, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeEmail = (user.email ?? user.id).replace(/[^a-zA-Z0-9._-]/g, "_");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="seo-we360-export-${safeEmail}-${dateStr}.json"`,
      "cache-control": "no-store, max-age=0",
    },
  });
}
