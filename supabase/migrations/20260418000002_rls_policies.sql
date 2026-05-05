-- SEO · we360.ai: Row-Level Security Policies
-- Enforces strict multi-tenant isolation via project_id + role.
-- Super admins & admins: full access to all projects.
-- Members: only rows in projects they have explicit membership in.

-- ============================================================
-- Helper functions (security definer — bypass RLS when checking role)
-- ============================================================

create or replace function public.current_user_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function public.is_admin()
returns boolean as $$
  select role in ('super_admin', 'admin') from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function public.is_super_admin()
returns boolean as $$
  select role = 'super_admin' from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function public.has_project_access(p_project_id uuid)
returns boolean as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.project_memberships
      where user_id = auth.uid() and project_id = p_project_id
    );
$$ language sql stable security definer set search_path = public;

-- ============================================================
-- Enable RLS on every table
-- ============================================================
alter table public.projects enable row level security;
alter table public.profiles enable row level security;
alter table public.project_memberships enable row level security;
alter table public.member_permissions enable row level security;
alter table public.tasks enable row level security;
alter table public.seo_gaps enable row level security;
alter table public.keywords enable row level security;
alter table public.keyword_uploads enable row level security;
alter table public.articles enable row level security;
alter table public.article_comments enable row level security;
alter table public.competitors enable row level security;
alter table public.cwv_snapshots enable row level security;
alter table public.wins enable row level security;
alter table public.pillar_scores enable row level security;
alter table public.audit_logs enable row level security;
alter table public.cron_runs enable row level security;

-- ============================================================
-- Projects
-- ============================================================
create policy "projects_select" on public.projects for select using (
  public.is_admin()
  or exists (select 1 from public.project_memberships where user_id = auth.uid() and project_id = projects.id)
);
create policy "projects_insert" on public.projects for insert with check (public.is_admin());
create policy "projects_update" on public.projects for update using (public.is_admin());
create policy "projects_delete" on public.projects for delete using (public.is_super_admin());

-- ============================================================
-- Profiles
-- ============================================================
-- Everyone can read their own profile
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
-- Admins can read any profile
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());
-- Users can update their own profile (but not their role — that's admin-only)
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
  );
-- Admins can update any profile (including role for members; super_admin can promote/demote admins)
create policy "profiles_update_admin" on public.profiles for update using (public.is_admin());
-- Super admins can delete profiles
create policy "profiles_delete_super_admin" on public.profiles for delete using (public.is_super_admin());
-- Profiles are inserted by trigger on auth.users insert (no direct insert policy needed for regular users)
create policy "profiles_insert_admin" on public.profiles for insert with check (public.is_admin());

-- ============================================================
-- Project memberships
-- ============================================================
create policy "memberships_select_own" on public.project_memberships for select using (user_id = auth.uid());
create policy "memberships_select_admin" on public.project_memberships for select using (public.is_admin());
create policy "memberships_insert_admin" on public.project_memberships for insert with check (public.is_admin());
create policy "memberships_update_admin" on public.project_memberships for update using (public.is_admin());
create policy "memberships_delete_admin" on public.project_memberships for delete using (public.is_admin());

-- ============================================================
-- Member permissions
-- ============================================================
create policy "member_perms_select_own" on public.member_permissions for select using (user_id = auth.uid());
create policy "member_perms_select_admin" on public.member_permissions for select using (public.is_admin());
create policy "member_perms_write_admin" on public.member_permissions for all using (public.is_admin());

-- ============================================================
-- Generic project-scoped policies
-- (applied identically to all data tables with project_id)
-- ============================================================

-- Tasks
create policy "tasks_project_access" on public.tasks for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- SEO Gaps
create policy "seo_gaps_project_access" on public.seo_gaps for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- Keywords
create policy "keywords_project_access" on public.keywords for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- Keyword uploads
create policy "keyword_uploads_project_access" on public.keyword_uploads for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- Articles
create policy "articles_project_access" on public.articles for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- Article comments (access via article's project)
create policy "article_comments_access" on public.article_comments for all using (
  exists (
    select 1 from public.articles a
    where a.id = article_comments.article_id
    and public.has_project_access(a.project_id)
  )
) with check (
  exists (
    select 1 from public.articles a
    where a.id = article_comments.article_id
    and public.has_project_access(a.project_id)
  )
);

-- Competitors
create policy "competitors_project_access" on public.competitors for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- CWV snapshots
create policy "cwv_project_access" on public.cwv_snapshots for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- Wins
create policy "wins_project_access" on public.wins for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- Pillar scores
create policy "pillar_scores_project_access" on public.pillar_scores for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- Audit logs (read-only for users; written by service role via cron)
create policy "audit_logs_select" on public.audit_logs for select using (public.has_project_access(project_id));

-- Cron runs (read-only visibility; writes by service role)
create policy "cron_runs_select" on public.cron_runs for select using (public.is_admin());
