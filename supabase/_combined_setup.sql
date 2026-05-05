-- ============================================================
-- 20260418000001_initial_schema.sql
-- ============================================================
-- SEO · we360.ai: SEO Command Dashboard — Initial Schema
-- Multi-tenant via project_id on every content table.
-- Strict isolation enforced in RLS policies (see 20260418000002_rls_policies.sql).

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Projects (multi-tenant root)
-- ============================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null unique,
  logo_url text,
  ga4_property_id text,
  gsc_property_url text,
  apify_keywords jsonb default '[]'::jsonb,
  industry text,
  country text default 'IN',
  timezone text default 'Asia/Kolkata',
  is_active boolean default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_projects_domain on public.projects(domain);
create index idx_projects_active on public.projects(is_active);

-- ============================================================
-- Profiles (one per auth user; role + AI keys + preferences)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  role text not null check (role in ('super_admin', 'admin', 'member')) default 'member',
  avatar_url text,
  active_project_id uuid references public.projects(id) on delete set null,
  encrypted_claude_key text,
  encrypted_openai_key text,
  last_active timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_profiles_role on public.profiles(role);
create index idx_profiles_email on public.profiles(email);

-- ============================================================
-- Project memberships (members only; admins/super_admins see all)
-- ============================================================
create table public.project_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique(user_id, project_id)
);

create index idx_memberships_user on public.project_memberships(user_id);
create index idx_memberships_project on public.project_memberships(project_id);

-- ============================================================
-- Member permissions (granular per section per project)
-- ============================================================
create table public.member_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  section text not null check (section in (
    'overview', 'tasks', 'seo_gaps', 'keywords', 'technical',
    'competitors', 'sprint', 'wins', 'articles', 'team'
  )),
  can_view boolean default true,
  can_add boolean default false,
  can_edit boolean default false,
  can_complete boolean default false,
  can_delete boolean default false,
  updated_at timestamptz default now(),
  unique(user_id, project_id, section)
);

create index idx_member_perms_user_project on public.member_permissions(user_id, project_id);

-- ============================================================
-- Tasks
-- ============================================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  url text,
  priority text check (priority in ('critical', 'high', 'medium', 'low')) default 'medium',
  impact text,
  status text check (status in ('todo', 'in_progress', 'review', 'done')) default 'todo',
  scheduled_date date,
  sprint_status text,
  issue text,
  impl text,
  team_member_id uuid references public.profiles(id) on delete set null,
  timeline text,
  done boolean default false,
  completed_at timestamptz,
  source text default 'manual' check (source in ('manual', 'cron_audit', 'ai_suggestion')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_tasks_project on public.tasks(project_id);
create index idx_tasks_assignee on public.tasks(team_member_id);
create index idx_tasks_status on public.tasks(status);
create index idx_tasks_priority on public.tasks(priority);
create index idx_tasks_scheduled on public.tasks(scheduled_date);

-- ============================================================
-- SEO Gaps (per page)
-- ============================================================
create table public.seo_gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  page_url text not null,
  title_status text check (title_status in ('ok', 'warn', 'fail', 'missing')),
  meta_status text check (meta_status in ('ok', 'warn', 'fail', 'missing')),
  h1_status text check (h1_status in ('ok', 'warn', 'fail', 'missing')),
  canonical_status text check (canonical_status in ('ok', 'warn', 'fail', 'missing')),
  og_status text check (og_status in ('ok', 'warn', 'fail', 'missing')),
  schema_status text check (schema_status in ('ok', 'warn', 'fail', 'missing')),
  robots_status text check (robots_status in ('ok', 'warn', 'fail', 'missing')),
  images_status text check (images_status in ('ok', 'warn', 'fail', 'missing')),
  last_checked timestamptz default now(),
  details jsonb default '{}'::jsonb,
  unique(project_id, page_url)
);

create index idx_seo_gaps_project on public.seo_gaps(project_id);
create index idx_seo_gaps_last_checked on public.seo_gaps(last_checked);

-- ============================================================
-- Keywords
-- ============================================================
create table public.keywords (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword text not null,
  cluster text,
  search_volume int,
  kd int check (kd >= 0 and kd <= 100),
  competition text check (competition in ('Low Competition', 'Medium Competition', 'High Competition')),
  current_rank int,
  previous_rank int,
  target_rank int,
  current_traffic int,
  potential_traffic int,
  intent text check (intent in ('informational', 'navigational', 'commercial', 'transactional')),
  priority text check (priority in ('critical', 'high', 'medium', 'low')) default 'medium',
  target_page text,
  trend text check (trend in ('up', 'down', 'stable', 'new')) default 'new',
  source text check (source in ('apify', 'gkp_upload', 'manual', 'gsc')) default 'manual',
  last_checked timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id, keyword)
);

create index idx_keywords_project on public.keywords(project_id);
create index idx_keywords_competition on public.keywords(competition);
create index idx_keywords_priority on public.keywords(priority);
create index idx_keywords_cluster on public.keywords(cluster);

-- ============================================================
-- Keyword uploads (GKP CSV tracking)
-- ============================================================
create table public.keyword_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  filename text not null,
  row_count int default 0,
  imported_count int default 0,
  skipped_count int default 0,
  status text check (status in ('processing', 'completed', 'failed')) default 'processing',
  error_message text,
  created_at timestamptz default now()
);

create index idx_keyword_uploads_project on public.keyword_uploads(project_id);

-- ============================================================
-- Articles
-- ============================================================
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword_id uuid references public.keywords(id) on delete set null,
  title text not null,
  target_keyword text,
  secondary_keywords jsonb default '[]'::jsonb,
  outline jsonb default '{}'::jsonb,
  content text,
  word_count int default 0,
  meta_description text,
  slug text,
  status text check (status in ('draft', 'review', 'approved', 'rejected', 'published')) default 'draft',
  rejection_reason text,
  ai_provider text check (ai_provider in ('claude', 'openai', 'manual')),
  published_url text,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_articles_project on public.articles(project_id);
create index idx_articles_status on public.articles(status);
create index idx_articles_keyword on public.articles(keyword_id);

-- ============================================================
-- Article comments (review thread)
-- ============================================================
create table public.article_comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  comment text not null,
  created_at timestamptz default now()
);

create index idx_article_comments_article on public.article_comments(article_id);

-- ============================================================
-- Competitors
-- ============================================================
create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  url text not null,
  da int,
  pa int,
  traffic int,
  top_keywords jsonb default '[]'::jsonb,
  opportunities jsonb default '[]'::jsonb,
  notes text,
  last_checked timestamptz,
  created_at timestamptz default now()
);

create index idx_competitors_project on public.competitors(project_id);

-- ============================================================
-- CWV snapshots
-- ============================================================
create table public.cwv_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  url text,
  device text check (device in ('mobile', 'desktop')) not null,
  score int check (score >= 0 and score <= 100),
  lcp numeric,
  fid numeric,
  cls numeric,
  inp numeric,
  ttfb numeric,
  si numeric,
  tbt numeric,
  fcp numeric,
  captured_at timestamptz default now()
);

create index idx_cwv_project_device_captured on public.cwv_snapshots(project_id, device, captured_at desc);

-- ============================================================
-- Wins
-- ============================================================
create table public.wins (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  emoji text default '🎉',
  title text not null,
  description text,
  metric text,
  category text,
  related_task_id uuid references public.tasks(id) on delete set null,
  date date default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create index idx_wins_project on public.wins(project_id);
create index idx_wins_date on public.wins(date desc);

-- ============================================================
-- Pillar Scores (5 pillars: SEO, AEO, GEO, SXO, AIO)
-- ============================================================
create table public.pillar_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  pillar text not null check (pillar in ('SEO', 'AEO', 'GEO', 'SXO', 'AIO')),
  score int not null check (score >= 0 and score <= 100),
  breakdown jsonb default '{}'::jsonb,
  top_issues jsonb default '[]'::jsonb,
  captured_at timestamptz default now()
);

create index idx_pillar_scores_project_pillar_captured on public.pillar_scores(project_id, pillar, captured_at desc);

-- ============================================================
-- Audit log (for transparency)
-- ============================================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index idx_audit_logs_project on public.audit_logs(project_id, created_at desc);

-- ============================================================
-- Cron runs (track daily audit executions)
-- ============================================================
create table public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  phase text not null,
  status text check (status in ('running', 'completed', 'failed', 'skipped')) default 'running',
  started_at timestamptz default now(),
  completed_at timestamptz,
  items_processed int default 0,
  error_message text,
  details jsonb default '{}'::jsonb
);

create index idx_cron_runs_project_started on public.cron_runs(project_id, started_at desc);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_projects_updated before update on public.projects
  for each row execute procedure public.set_updated_at();
create trigger trg_profiles_updated before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger trg_tasks_updated before update on public.tasks
  for each row execute procedure public.set_updated_at();
create trigger trg_keywords_updated before update on public.keywords
  for each row execute procedure public.set_updated_at();
create trigger trg_articles_updated before update on public.articles
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 20260418000002_rls_policies.sql
-- ============================================================
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

-- ============================================================
-- 20260418000003_triggers_and_functions.sql
-- ============================================================
-- SEO · we360.ai: Triggers & Functions
-- Auto-create profile on signup, invite flow helpers, competition label derivation.

-- ============================================================
-- Auto-create profile on auth.users insert
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_name text;
  v_role text;
begin
  -- Name: from raw_user_meta_data.name (Supabase Auth signup form) OR from email local-part
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  -- Role: default 'member' unless email is the bootstrap super_admin
  v_role := case
    when new.email = 'lawrance.bamania@we360.ai' then 'super_admin'
    else coalesce(new.raw_user_meta_data->>'role', 'member')
  end;

  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, v_name, v_role)
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Derive competition label from KD (Keyword Difficulty)
-- ============================================================
create or replace function public.competition_from_kd(p_kd int)
returns text as $$
begin
  if p_kd is null then return null; end if;
  if p_kd < 30 then return 'Low Competition';
  elsif p_kd <= 60 then return 'Medium Competition';
  else return 'High Competition';
  end if;
end;
$$ language plpgsql immutable;

-- Auto-fill competition on keyword insert/update if null
create or replace function public.fill_keyword_competition()
returns trigger as $$
begin
  if new.competition is null and new.kd is not null then
    new.competition := public.competition_from_kd(new.kd);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_keywords_auto_competition
  before insert or update on public.keywords
  for each row execute procedure public.fill_keyword_competition();

-- ============================================================
-- Word count auto-calc on article save
-- ============================================================
create or replace function public.update_article_word_count()
returns trigger as $$
begin
  if new.content is not null then
    new.word_count := array_length(regexp_split_to_array(trim(new.content), '\s+'), 1);
  else
    new.word_count := 0;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_articles_word_count
  before insert or update of content on public.articles
  for each row execute procedure public.update_article_word_count();

-- ============================================================
-- Prune old CWV snapshots (keep last 30 days per project+device)
-- ============================================================
create or replace function public.prune_cwv_snapshots()
returns void as $$
begin
  delete from public.cwv_snapshots
  where captured_at < now() - interval '30 days';
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Prune old pillar scores (keep last 90 days)
-- ============================================================
create or replace function public.prune_pillar_scores()
returns void as $$
begin
  delete from public.pillar_scores
  where captured_at < now() - interval '90 days';
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- 20260419000001_pillar_and_kind.sql
-- ============================================================
-- SEO · we360.ai: Pillar tagging + task kinds
-- Adds pillar column to tasks (SEO/AEO/GEO/SXO/AIO), a kind column
-- (web_task vs blog_task) so /tasks and /sprint show different slices,
-- and a gsc_index_status table for future Google Search Console integration.

-- ============================================================
-- tasks: add pillar + kind
-- ============================================================
alter table public.tasks
  add column if not exists pillar text
    check (pillar in ('SEO', 'AEO', 'GEO', 'SXO', 'AIO')) default null,
  add column if not exists kind text
    check (kind in ('web_task', 'blog_task')) default 'web_task';

create index if not exists idx_tasks_pillar on public.tasks(pillar);
create index if not exists idx_tasks_kind on public.tasks(kind);

-- ============================================================
-- GSC index status (one row per URL per project)
-- ============================================================
create table if not exists public.gsc_index_status (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  verdict text,                                   -- PASS, PARTIAL, FAIL, NEUTRAL
  coverage_state text,                            -- Submitted and indexed, Crawled but not indexed, etc.
  robots_txt_state text,                          -- ALLOWED / DISALLOWED
  indexing_state text,                            -- INDEXING_ALLOWED / BLOCKED_BY_NOINDEX / BLOCKED_BY_ROBOTS_TXT
  page_fetch_state text,                          -- SUCCESSFUL / SOFT_404 / NOT_FOUND / SERVER_ERROR
  google_canonical text,
  user_canonical text,
  last_crawl_time timestamptz,
  mobile_usability_verdict text,
  rich_results_verdict text,
  details jsonb default '{}'::jsonb,
  checked_at timestamptz default now(),
  unique (project_id, url)
);

create index if not exists idx_gsc_index_project on public.gsc_index_status(project_id);
create index if not exists idx_gsc_index_verdict on public.gsc_index_status(verdict);

alter table public.gsc_index_status enable row level security;
create policy "gsc_index_project_access" on public.gsc_index_status for all
  using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- ============================================================
-- Audit findings (raw log of every finding from every skill run)
-- ============================================================
create table if not exists public.audit_findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  skill text not null,                            -- 'technical', 'schema', 'images', ...
  check_name text not null,
  status text not null check (status in ('ok', 'warn', 'fail', 'missing')),
  pillar text check (pillar in ('SEO', 'AEO', 'GEO', 'SXO', 'AIO')),
  priority text check (priority in ('critical', 'high', 'medium', 'low')),
  message text,
  impl text,
  details jsonb default '{}'::jsonb,
  run_id uuid,
  created_at timestamptz default now()
);

create index if not exists idx_audit_findings_project_url on public.audit_findings(project_id, url);
create index if not exists idx_audit_findings_run on public.audit_findings(run_id);
create index if not exists idx_audit_findings_created on public.audit_findings(created_at desc);

alter table public.audit_findings enable row level security;
create policy "audit_findings_project_access" on public.audit_findings for all
  using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- Prune audit findings older than 30 days
create or replace function public.prune_audit_findings()
returns void as $$
begin
  delete from public.audit_findings where created_at < now() - interval '30 days';
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- 20260419000002_verified_by_ai.sql
-- ============================================================
-- SEO · we360.ai: Task verification tracking
-- Adds a flag so the Kanban card can show an "AI verified" check
-- when Phase 2 (task verification) auto-closes a task after confirming
-- the underlying SEO issue is actually resolved on the live page.

alter table public.tasks
  add column if not exists verified_by_ai boolean default false;

create index if not exists idx_tasks_verified_by_ai on public.tasks(verified_by_ai);

-- ============================================================
-- 20260419000003_blog_meta_and_integrations.sql
-- ============================================================
-- SEO · we360.ai: blog task enrichment + integrations table
-- Blog tasks need richer metadata to render the reference-design cards:
-- keyword_id, intent, competition, word_count_target + link back to article when generated.

alter table public.tasks
  add column if not exists keyword_id uuid references public.keywords(id) on delete set null,
  add column if not exists article_id uuid references public.articles(id) on delete set null,
  add column if not exists intent text
    check (intent in ('informational', 'navigational', 'commercial', 'transactional')),
  add column if not exists competition text
    check (competition in ('Low Competition', 'Medium Competition', 'High Competition')),
  add column if not exists word_count_target int,
  add column if not exists target_keyword text;

create index if not exists idx_tasks_keyword_id on public.tasks(keyword_id);
create index if not exists idx_tasks_article_id on public.tasks(article_id);
create index if not exists idx_tasks_competition on public.tasks(competition);

-- ==================================================================
-- Integrations: per-project connection status for third-party tools.
-- Credentials themselves live in env vars (not stored here for safety)
-- except for optional per-project overrides stored in `config` jsonb.
-- ==================================================================
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,  -- null = global
  provider text not null check (provider in (
    'apify', 'ga4', 'gsc', 'pagespeed', 'claude', 'openai', 'supabase'
  )),
  status text check (status in ('connected', 'setup_required', 'error', 'disabled')) default 'setup_required',
  last_checked_at timestamptz,
  last_error text,
  config jsonb default '{}'::jsonb,
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, provider)
);

create index if not exists idx_integrations_project on public.integrations(project_id);
create index if not exists idx_integrations_provider on public.integrations(provider);

alter table public.integrations enable row level security;
create policy "integrations_admin_access" on public.integrations for all
  using (public.is_admin())
  with check (public.is_admin());

create trigger trg_integrations_updated before update on public.integrations
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 20260419000005_blog_brief.sql
-- ============================================================
-- SEO · we360.ai: blog brief column + backfill for existing blog tasks
-- Stores the full article brief (H1/H2/H3/sections/PAA/links/notes) for blog tasks.
-- Generated programmatically by the Apify cron; editable in the UI.

alter table public.tasks
  add column if not exists brief jsonb;

create index if not exists idx_tasks_brief_gin on public.tasks using gin (brief);

-- ============================================================
-- Backfill a default brief for seeded SkyHigh blog tasks
-- ============================================================
update public.tasks t
set brief = jsonb_build_object(
  'title', t.title,
  'target_keyword', t.target_keyword,
  'secondary_keywords', jsonb_build_array(
    t.target_keyword || ' india',
    t.target_keyword || ' cost',
    t.target_keyword || ' near me'
  ),
  'intent', coalesce(t.intent, 'informational'),
  'recommended_h1',
    case
      when t.target_keyword ilike 'is %' then initcap(t.target_keyword) || '? Everything You Need to Know in 2026'
      when t.target_keyword ilike 'how to %' then initcap(t.target_keyword) || ': Step-by-Step Guide (2026)'
      when t.target_keyword ilike 'best %' then initcap(t.target_keyword) || ': Top Picks for 2026'
      else initcap(t.target_keyword) || ': The Complete 2026 Guide'
    end,
  'recommended_h2s', jsonb_build_array(
    'What is ' || t.target_keyword || '?',
    'How ' || t.target_keyword || ' works',
    'Benefits and what to expect',
    'Best locations and pricing in India',
    'How SkyHigh India gets you there'
  ),
  'recommended_h3s', jsonb_build_array(
    'Safety standards and equipment',
    'Age, weight and fitness requirements',
    'First-timer vs experienced jumper',
    'Weather conditions and best season',
    'Booking and preparation',
    'What happens during the jump',
    'After-jump experience and certificate',
    'Common myths debunked'
  ),
  'sections_breakdown', jsonb_build_array(
    'Introduction: why this topic matters for adventure seekers',
    'Section 1: what the keyword actually means + quick summary (TL;DR)',
    'Section 2: detailed step-by-step / explanation',
    'Section 3: pros, cons, considerations',
    'Section 4: locations / pricing / booking in India',
    'Section 5: how SkyHigh India delivers this experience',
    'FAQ: 5 PAA questions with schema-ready answers',
    'Conclusion: clear CTA to book or read related article'
  ),
  'word_count_target', coalesce(t.word_count_target, 1500),
  'paa_questions', jsonb_build_array(
    'How much does ' || t.target_keyword || ' cost in India?',
    'Is ' || t.target_keyword || ' safe for beginners?',
    'What is the best age for ' || t.target_keyword || '?',
    'Where can I do ' || t.target_keyword || ' in India?',
    'How long does the whole experience take?'
  ),
  'internal_links', jsonb_build_array(
    '/tandem-skydiving',
    '/locations/mysore',
    '/pricing',
    '/faq'
  ),
  'competitor_refs', jsonb_build_array(
    'Thrillophilia skydiving India guide',
    'Indian Skydiving Federation official rules',
    'Local Dropzone regulations'
  ),
  'writer_notes', jsonb_build_array(
    'Use first-person reassurance in intro — skydiving triggers fear, address it early',
    'Include a visible safety-standards callout block',
    'Cite DGCA regulations for India section',
    'Add 2–3 images: hero drop shot, instructor briefing, landing',
    'Strong CTA: "Book Your First Jump" with /online-shop link'
  ),
  'generated_by', 'heuristic'
)
where t.kind = 'blog_task'
  and t.brief is null
  and t.project_id = '00000000-0000-4000-8000-000000000001';

-- ============================================================
-- 20260419000006_client_role.sql
-- ============================================================
-- SEO · we360.ai: add `client` role for external client users
-- Client = member (same granular permissions) BUT NOT assignable to tasks.
-- Used to give the client-side stakeholders read/comment access to their own project.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'member', 'client'));

create index if not exists idx_profiles_role_nonclient on public.profiles(role)
  where role != 'client';

-- ============================================================
-- 20260419000007_multilang_publish_competitor.sql
-- ============================================================
-- SEO · we360.ai: multi-language projects, blog publish URL, competitor auto-analysis fields

-- ====================================================================
-- Multi-language flag — enables the hreflang skill during the cron
-- ====================================================================
alter table public.projects
  add column if not exists supports_multi_language boolean default false,
  add column if not exists target_keywords_seed jsonb default '[]'::jsonb;

-- ====================================================================
-- Blog task: live-publish URL + supporting reference links
-- ====================================================================
alter table public.tasks
  add column if not exists published_url text,
  add column if not exists supporting_links jsonb default '[]'::jsonb,
  add column if not exists reference_images jsonb default '[]'::jsonb;

create index if not exists idx_tasks_published_url on public.tasks(published_url)
  where published_url is not null;

-- ====================================================================
-- Competitor auto-analysis — stores results from the new analysis cron
-- ====================================================================
alter table public.competitors
  add column if not exists auto_analysis jsonb default '{}'::jsonb,
  add column if not exists analysis_status text
    check (analysis_status in ('pending', 'analyzing', 'complete', 'failed')) default 'pending',
  add column if not exists last_analyzed_at timestamptz;

-- ====================================================================
-- Project kickoff jobs — background queue for "run everything on new project"
-- ====================================================================
create table if not exists public.project_kickoff_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'complete', 'failed')) default 'queued',
  phase text,
  phases_complete jsonb default '[]'::jsonb,
  result jsonb default '{}'::jsonb,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_kickoff_jobs_project_status on public.project_kickoff_jobs(project_id, status);

alter table public.project_kickoff_jobs enable row level security;
create policy "kickoff_jobs_admin_access" on public.project_kickoff_jobs for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 20260419000008_blog_images_bucket.sql
-- ============================================================
-- SEO · we360.ai: Supabase Storage bucket for blog reference images
-- Public read, admin/member write. Uploaded URLs go into tasks.reference_images JSONB array.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-images',
  'blog-images',
  true,
  5242880,  -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read images (they're referenced from public blogs)
drop policy if exists "blog_images_public_read" on storage.objects;
create policy "blog_images_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'blog-images');

-- Authenticated users can upload
drop policy if exists "blog_images_auth_upload" on storage.objects;
create policy "blog_images_auth_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'blog-images');

-- Authenticated users can delete (UI-level check restricts to admins/owners)
drop policy if exists "blog_images_auth_delete" on storage.objects;
create policy "blog_images_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'blog-images');

-- ============================================================
-- 20260419000009_apify_intelligence.sql
-- ============================================================
-- SEO · we360.ai: Apify intelligence layer — 5 new data sources
-- Populated on project kickoff and re-run on the 1st of every month.
-- All tables share project_id scope + RLS via has_project_access().

-- ====================================================================
-- SERP rankings — weekly snapshot of where project ranks for keywords,
-- plus ownership of SERP features (PAA, Featured Snippet, etc.)
-- ====================================================================
create table if not exists public.serp_rankings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword text not null,
  position integer,                                 -- 1-100, null if not in top 100
  url text,                                         -- ranking URL on project's domain
  owns_featured_snippet boolean default false,
  owns_paa boolean default false,                   -- People Also Ask presence
  paa_questions jsonb default '[]'::jsonb,          -- full PAA list for the SERP
  related_searches jsonb default '[]'::jsonb,
  total_results bigint,
  country text default 'in',
  device text default 'desktop' check (device in ('desktop', 'mobile')),
  checked_at timestamptz not null default now()
);

create index if not exists idx_serp_rankings_project on public.serp_rankings(project_id, checked_at desc);
create index if not exists idx_serp_rankings_keyword on public.serp_rankings(project_id, keyword, checked_at desc);

alter table public.serp_rankings enable row level security;
create policy "serp_rankings project members"
  on public.serp_rankings for select
  using (has_project_access(project_id));

-- ====================================================================
-- AI Overview citations — tracks if/when project is cited in Google AI Overview
-- ====================================================================
create table if not exists public.ai_overview_citations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword text not null,
  ai_overview_appeared boolean default false,       -- Did Google return an AI Overview?
  project_cited boolean default false,              -- Was the project cited as a source?
  cited_url text,                                   -- Which URL was cited
  ai_overview_text text,                            -- The AI Overview summary
  cited_sources jsonb default '[]'::jsonb,          -- [{title, url, snippet}]
  checked_at timestamptz not null default now()
);

create index if not exists idx_ai_overview_project on public.ai_overview_citations(project_id, checked_at desc);

alter table public.ai_overview_citations enable row level security;
create policy "ai_overview project members"
  on public.ai_overview_citations for select
  using (has_project_access(project_id));

-- ====================================================================
-- Backlink profile — quarterly snapshot of referring domains + anchors
-- ====================================================================
create table if not exists public.backlink_profile (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid not null default gen_random_uuid(),
  total_backlinks integer default 0,
  referring_domains integer default 0,
  dofollow_count integer default 0,
  nofollow_count integer default 0,
  top_backlinks jsonb default '[]'::jsonb,          -- [{source_url, anchor, dofollow, first_seen}]
  top_anchors jsonb default '[]'::jsonb,            -- [{anchor, count}]
  checked_at timestamptz not null default now()
);

create index if not exists idx_backlink_profile_project on public.backlink_profile(project_id, checked_at desc);

alter table public.backlink_profile enable row level security;
create policy "backlink_profile project members"
  on public.backlink_profile for select
  using (has_project_access(project_id));

-- ====================================================================
-- Domain authority snapshot — project domain + all tracked competitors
-- ====================================================================
create table if not exists public.domain_authority (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  domain text not null,
  is_project_domain boolean default false,          -- true for own domain, false for competitors
  da_score integer,                                 -- 0-100
  http_healthy boolean,
  ssl_valid boolean,
  domain_age_days integer,
  has_sitemap boolean,
  has_robots boolean,
  tech_stack jsonb default '[]'::jsonb,
  checked_at timestamptz not null default now()
);

create index if not exists idx_domain_authority_project on public.domain_authority(project_id, checked_at desc);
create index if not exists idx_domain_authority_domain on public.domain_authority(project_id, domain, checked_at desc);

alter table public.domain_authority enable row level security;
create policy "domain_authority project members"
  on public.domain_authority for select
  using (has_project_access(project_id));

-- ====================================================================
-- Content gap analysis — missing keywords / topics competitors rank for
-- ====================================================================
create table if not exists public.content_gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword text not null,                            -- target keyword analyzed
  gap_score numeric(4,2),                           -- 0-10, how big the gap is
  missing_subtopics jsonb default '[]'::jsonb,      -- subtopics competitors cover
  suggested_keywords jsonb default '[]'::jsonb,     -- [{keyword, intent, reason}]
  suggested_outline jsonb default '[]'::jsonb,      -- H2/H3 outline
  featured_snippet_opportunity boolean default false,
  checked_at timestamptz not null default now()
);

create index if not exists idx_content_gaps_project on public.content_gaps(project_id, checked_at desc);

alter table public.content_gaps enable row level security;
create policy "content_gaps project members"
  on public.content_gaps for select
  using (has_project_access(project_id));

-- ====================================================================
-- Intelligence run log — tracks when each actor last ran per project
-- (so the monthly cron knows what to re-run, and the UI can show freshness)
-- ====================================================================
create table if not exists public.intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor text not null check (actor in ('serp', 'ai_overview', 'backlinks', 'domain_authority', 'content_gap')),
  status text not null check (status in ('running', 'success', 'failed', 'skipped')) default 'running',
  rows_inserted integer default 0,
  cost_estimate_usd numeric(10,4) default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_intelligence_runs_project on public.intelligence_runs(project_id, actor, started_at desc);

alter table public.intelligence_runs enable row level security;
create policy "intelligence_runs project members"
  on public.intelligence_runs for select
  using (has_project_access(project_id));

-- ============================================================
-- 20260419000010_cannibalization_freshness_eeat.sql
-- ============================================================
-- SEO · we360.ai: cannibalization detector + content freshness tracker + E-E-A-T analyzer
-- Cannibalization and freshness run weekly as part of daily-audit.
-- E-E-A-T is BYOK (user-triggered with their Claude/OpenAI key).

-- ====================================================================
-- Keyword cannibalization — multiple URLs from project domain competing
-- for the same query. Detected from GSC query+page data.
-- ====================================================================
create table if not exists public.keyword_cannibalization (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  query text not null,
  competing_urls jsonb not null default '[]'::jsonb,        -- [{url, clicks, impressions, position}]
  url_count integer not null default 0,                      -- how many URLs compete
  total_clicks integer default 0,
  total_impressions integer default 0,
  severity text not null check (severity in ('low', 'medium', 'high')) default 'low',
  click_split_ratio numeric(4,2),                            -- 0-1, how evenly split the clicks are (1.0 = perfectly split)
  detected_at timestamptz not null default now()
);

create index if not exists idx_cannibalization_project on public.keyword_cannibalization(project_id, detected_at desc);
create index if not exists idx_cannibalization_severity on public.keyword_cannibalization(project_id, severity);

alter table public.keyword_cannibalization enable row level security;
create policy "cannibalization project members"
  on public.keyword_cannibalization for select
  using (has_project_access(project_id));

-- ====================================================================
-- Content freshness — pages losing traffic over 60-90 days
-- ====================================================================
create table if not exists public.content_freshness (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  page_path text not null,
  views_last_7d integer default 0,
  views_prior_30d integer default 0,                         -- 30 day window, ending 30 days ago
  views_prior_90d integer default 0,                         -- 90 day window, ending 60 days ago
  decay_pct numeric(5,2),                                    -- negative = losing, positive = gaining (vs 90d baseline)
  status text not null check (status in ('fresh', 'stable', 'declining', 'decaying')) default 'stable',
  refresh_task_id uuid references public.tasks(id) on delete set null,
  detected_at timestamptz not null default now()
);

create index if not exists idx_freshness_project on public.content_freshness(project_id, detected_at desc);
create index if not exists idx_freshness_status on public.content_freshness(project_id, status);

alter table public.content_freshness enable row level security;
create policy "freshness project members"
  on public.content_freshness for select
  using (has_project_access(project_id));

-- ====================================================================
-- E-E-A-T reports — BYOK AI-generated credibility assessment
-- ====================================================================
create table if not exists public.eeat_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  overall_score integer check (overall_score between 0 and 100),
  experience_score integer check (experience_score between 0 and 100),
  expertise_score integer check (expertise_score between 0 and 100),
  authoritativeness_score integer check (authoritativeness_score between 0 and 100),
  trust_score integer check (trust_score between 0 and 100),
  strengths jsonb default '[]'::jsonb,                       -- [{signal, evidence}]
  weaknesses jsonb default '[]'::jsonb,                      -- [{signal, impact, fix}]
  recommendations jsonb default '[]'::jsonb,                 -- [{priority, action, reason}]
  analyzed_pages jsonb default '[]'::jsonb,                  -- [{url, purpose}]
  provider text check (provider in ('claude', 'openai')),
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_eeat_project on public.eeat_reports(project_id, created_at desc);

alter table public.eeat_reports enable row level security;
create policy "eeat project members"
  on public.eeat_reports for select
  using (has_project_access(project_id));

-- ============================================================
-- 20260419000011_topic_clusters.sql
-- ============================================================
-- SEO · we360.ai: topic cluster plans generated from the BYOK Topic Cluster Builder.
-- A cluster = 1 pillar + 8-12 spokes + interlinking rules + roadmap.
-- Each spoke can later be "converted" into a blog task via the Blog Sprint UI.

-- ====================================================================
-- topic_clusters — one row per generated plan
-- ====================================================================
create table if not exists public.topic_clusters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  seed_keyword text not null,

  -- Pillar page spec
  pillar_title text not null,
  pillar_slug text,
  pillar_primary_keyword text,
  pillar_outline jsonb not null default '[]'::jsonb,       -- ["H2 #1", "H2 #2", ...]
  pillar_word_target integer default 2800,
  pillar_summary text,

  -- Strategy artifacts
  interlinking jsonb not null default '[]'::jsonb,         -- [{from, to, anchor_text, reason}]
  roadmap jsonb not null default '[]'::jsonb,              -- [{order, spoke_title, rationale}]

  -- Coverage scorecard
  coverage_total integer default 0,
  coverage_new integer default 0,
  coverage_already_covered integer default 0,
  coverage_pct numeric(5,2) default 0,

  -- Provenance
  provider text check (provider in ('claude', 'openai')),
  generated_by uuid references auth.users(id) on delete set null,
  cost_estimate_usd numeric(6,4) default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_topic_clusters_project on public.topic_clusters(project_id, created_at desc);
create index if not exists idx_topic_clusters_seed on public.topic_clusters(project_id, seed_keyword);

alter table public.topic_clusters enable row level security;
create policy "topic_clusters_select" on public.topic_clusters
  for select using (has_project_access(project_id));
create policy "topic_clusters_insert" on public.topic_clusters
  for insert with check (has_project_access(project_id));
create policy "topic_clusters_update" on public.topic_clusters
  for update using (has_project_access(project_id));
create policy "topic_clusters_delete" on public.topic_clusters
  for delete using (has_project_access(project_id));

-- ====================================================================
-- topic_cluster_items — one row per spoke article in a cluster
-- ====================================================================
create table if not exists public.topic_cluster_items (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.topic_clusters(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,

  position integer not null default 0,                     -- roadmap order (1-based)
  title text not null,
  target_keyword text,
  intent text check (intent in ('informational', 'commercial', 'transactional', 'navigational')),
  kd_estimate text check (kd_estimate in ('low', 'medium', 'high')),
  word_count_target integer,
  outline jsonb default '[]'::jsonb,                       -- ["H2 #1", "H2 #2", ...]
  reason text,

  -- If the spoke is already covered by an existing article, store the ref here.
  already_covered_by jsonb,                                -- {title, url}

  -- When the user converts the spoke into an actual blog task, this links them.
  task_id uuid references public.tasks(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists idx_cluster_items_cluster on public.topic_cluster_items(cluster_id, position);
create index if not exists idx_cluster_items_project on public.topic_cluster_items(project_id, created_at desc);
create index if not exists idx_cluster_items_task on public.topic_cluster_items(task_id)
  where task_id is not null;

alter table public.topic_cluster_items enable row level security;
create policy "cluster_items_select" on public.topic_cluster_items
  for select using (has_project_access(project_id));
create policy "cluster_items_insert" on public.topic_cluster_items
  for insert with check (has_project_access(project_id));
create policy "cluster_items_update" on public.topic_cluster_items
  for update using (has_project_access(project_id));
create policy "cluster_items_delete" on public.topic_cluster_items
  for delete using (has_project_access(project_id));

-- ============================================================
-- 20260419000012_page_meta.sql
-- ============================================================
-- SEO · we360.ai: page metadata for every crawled URL.
-- The audit already fetches every sitemap URL. We just weren't saving the
-- title / h1 / is-it-a-blog signal. Topic Cluster coverage analysis needs
-- this to detect pre-existing blogs (written outside the app) so the plan
-- doesn't recommend duplicates.

alter table public.seo_gaps
  add column if not exists page_title text,
  add column if not exists h1_text text,
  add column if not exists is_blog boolean default false,
  add column if not exists last_seen_at timestamptz default now();

create index if not exists idx_seo_gaps_is_blog on public.seo_gaps(project_id, is_blog)
  where is_blog = true;

create index if not exists idx_seo_gaps_last_seen on public.seo_gaps(project_id, last_seen_at desc);

-- ============================================================
-- 20260420000002_profile_ai_model.sql
-- ============================================================
-- SEO · we360.ai: per-user default AI model preference.
-- Users can change it in Profile; every AI dialog also lets them override per-task.
-- Enum-style TEXT column kept flexible so admin can add new models without another migration.

alter table public.profiles
  add column if not exists preferred_ai_model text default 'sonnet';

-- Constraint keeps bad values out but still lets us ship new models by updating the
-- check constraint via a follow-up migration when Anthropic/OpenAI release them.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_preferred_ai_model_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_ai_model_check
      check (preferred_ai_model in ('sonnet', 'opus', 'gpt-4o', 'gpt-4o-mini'));
  end if;
end $$;

-- ============================================================
-- 20260424000001_drop_billing_and_orgs.sql
-- ============================================================
-- SEO · we360.ai: internal-only pivot.
-- Rip out the legacy billing + multi-tenant layer (orgs, plans, subs, invoices).
-- Everyone is implicitly on the same we360 workspace now; no paid plans.

-- ----------------------------------------------------------------
-- 1. Drop billing + tenant tables (in dependency order)
-- ----------------------------------------------------------------
drop table if exists public.usage_events        cascade;
drop table if exists public.webhook_events      cascade;
drop table if exists public.invoices            cascade;
drop table if exists public.razorpay_orders     cascade;
drop table if exists public.subscriptions       cascade;
drop table if exists public.plans               cascade;
drop table if exists public.organization_members cascade;
drop table if exists public.organizations       cascade;

-- ----------------------------------------------------------------
-- 2. Strip the org_id FK from projects (older deploys added it)
-- ----------------------------------------------------------------
alter table public.projects drop column if exists org_id;

-- ----------------------------------------------------------------
-- 3. Drop any billing-adjacent indexes / policies left dangling
-- ----------------------------------------------------------------
drop index if exists idx_projects_org;

-- ----------------------------------------------------------------
-- 4. Purge legacy demo project if it was seeded.
--    Child rows cascade via existing FKs on project_id.
-- ----------------------------------------------------------------
delete from public.projects where id = '00000000-0000-4000-8000-000000000001';
delete from public.projects where domain = 'we360.ai';

-- ----------------------------------------------------------------
-- 5. Re-add platform_admin column on profiles.
--    It was originally introduced in the now-deleted billing migration but is
--    still load-bearing for admin/* gating + getUserContext.
-- ----------------------------------------------------------------
alter table public.profiles
  add column if not exists platform_admin boolean not null default false;

create index if not exists idx_profiles_platform_admin
  on public.profiles(platform_admin) where platform_admin = true;

-- ----------------------------------------------------------------
-- 6. Restrict signups to @we360.ai Google accounts.
--    Defense-in-depth: the /auth/callback route also checks, but this
--    ensures the DB itself refuses non-we360 profiles even if someone
--    hits Supabase Auth directly.
-- ----------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_name text;
begin
  if lower(new.email) not like '%@we360.ai' then
    raise exception 'Only @we360.ai accounts are permitted (got %).', new.email
      using errcode = '42501';
  end if;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, v_name, 'member')
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$ language plpgsql security definer set search_path = public;


-- ============================================================
-- 20260424000002_seed_we360_project.sql
-- ============================================================
-- SEO · we360.ai
-- Single-project seed. The dashboard is locked to one project (we360.ai) —
-- no UI to create additional projects. Upserts so re-running is safe.

insert into public.projects (id, name, domain, industry, country, timezone, is_active)
values (
  '11111111-1111-4111-8111-000000000001',
  'we360.ai',
  'we360.ai',
  'Workforce Analytics SaaS',
  'IN',
  'Asia/Kolkata',
  true
)
on conflict (domain) do update set
  name       = excluded.name,
  industry   = excluded.industry,
  is_active  = true;

-- Seed one pillar_score row per pillar so Overview renders immediately (scores
-- start at 0 and get recomputed by the weekly cron).
insert into public.pillar_scores (project_id, pillar, score, breakdown, top_issues)
select
  '11111111-1111-4111-8111-000000000001'::uuid,
  p.pillar::text,
  0,
  '{}'::jsonb,
  '["Awaiting first audit"]'::jsonb
from unnest(array['SEO', 'AEO', 'GEO', 'SXO', 'AIO']) as p(pillar)
on conflict do nothing;

-- ============================================================
-- 20260424000003_seed_competitors.sql
-- ============================================================
-- SEO · we360.ai
-- Seed the initial competitor set for the we360.ai project.
--
-- Sources:
--   - 100K Organic Plan v4 §4.1 (15 vs-competitor targets + §3 archetype matrix)
--   - GSC "Alternative+VS queries" sheet (validated impression demand per brand)
--
-- Tier split:
--   * Tier 1 — GSC-validated demand (alt/vs queries earning impressions).
--   * Tier 2 — BoF list from the plan, no direct brand-search signal yet.
--
-- `da` column holds Ahrefs Domain Rating (DR) where known (schema only has `da`,
-- the Moz scale is abandoned — we only track DR consistently with the plan).
-- `traffic` left NULL; enrich via Apify domain-authority actor + SimilarWeb.

insert into public.competitors (project_id, name, url, da, traffic, top_keywords, opportunities, notes)
values
  -- =====================================================================
  -- Tier 1 — Validated by GSC alternative/vs queries (real demand)
  -- =====================================================================
  (
    '11111111-1111-4111-8111-000000000001', 'Hubstaff', 'https://hubstaff.com', 79, null,
    '["time tracking software", "employee monitoring software", "remote work tracking", "workforce analytics"]'::jsonb,
    '[
      {"title": "Ship we360-vs-hubstaff + hubstaff-alternative pages", "reason": "2,538 GSC impressions/mo on hubstaff-alternative queries — validated mid-funnel intent."},
      {"title": "Close DR gap via link earning (we360 DR 50 vs 79)", "reason": "Backlinks, not blog volume, drives their ranking advantage (571 posts → DR 79). Data-study PR is the lever."}
    ]'::jsonb,
    'Top-of-mind brand in alt/vs queries. Ahrefs DR 79; 571 blog posts. Plan §4.1 rank #1 target.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Time Doctor', 'https://www.timedoctor.com', 79, null,
    '["time doctor", "time tracking", "employee time tracking", "productivity monitoring"]'::jsonb,
    '[
      {"title": "Ship we360-vs-time-doctor + time-doctor-alternative", "reason": "1,970 GSC impressions/mo on time-doctor-alt queries (754 + 688 + 528)."},
      {"title": "Content pruning & topical clustering", "reason": "TD has 1,971 blogs yet DR 79 — Google rewards topical authority over volume. Our blog pruning plan (120 kill/merge) directly targets this."}
    ]'::jsonb,
    'DR 79, 1,971 blog posts. Heavy content footprint. Plan §4.1 rank #2.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'ActivTrak', 'https://www.activtrak.com', null, null,
    '["workforce analytics", "employee productivity", "remote work visibility", "user behavior analytics"]'::jsonb,
    '[
      {"title": "Ship we360-vs-activtrak + activtrak-alternative", "reason": "1,616 GSC impressions/mo across activtrak-alt/alternatives/competitors."},
      {"title": "Position on data-privacy + India compliance", "reason": "ActivTrak leans enterprise US; we can win on DPDP + India data residency."}
    ]'::jsonb,
    'Strong enterprise positioning in US. No India localization. Plan §4.1.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'DeskTime', 'https://desktime.com', null, null,
    '["desktime", "time tracking app", "auto time tracking", "productivity tracker"]'::jsonb,
    '[
      {"title": "Ship desktime-alternative page", "reason": "950 GSC impressions/mo on one query — decisive migration intent."},
      {"title": "Highlight our BPO + KPO fit vs their SMB focus", "reason": "DeskTime targets solo/SMB. We360 owns mid-market India BPO."}
    ]'::jsonb,
    'SMB-focused, lean on industry verticals. Plan §4.1.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Insightful', 'https://www.insightful.io', null, null,
    '["workpuls", "employee monitoring", "remote team monitoring", "activity tracking"]'::jsonb,
    '[
      {"title": "Ship we360-vs-insightful + insightful-alternative", "reason": "866 GSC impressions/mo on insightful-alt queries."},
      {"title": "Counter their 160-integration scaled-page play", "reason": "Insightful programmatically scaled 160 integrations + 1,604 Spanish pages. Match the integration template (plan §4.3), skip ES localization."}
    ]'::jsonb,
    'Formerly Workpuls. 2,633 blog posts + 160 integration pages. Plan §3 archetype matrix flagged them as the programmatic leader.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Prohance', 'https://www.prohance.net', null, null,
    '["prohance", "workforce management india", "operations analytics", "operational efficiency"]'::jsonb,
    '[
      {"title": "Own the India workforce-analytics SERP", "reason": "Prohance is our closest India rival — 203 impressions on prohance-competitors already. India is uncontested per plan §3.1(c)."},
      {"title": "Ship industries/bpo-kpo + workforce-analytics-india", "reason": "Both in the India-specific BoF list (plan §4.5)."}
    ]'::jsonb,
    'India-based operations analytics. Closest geographic + ICP match. Plan §3.1(c) India GTM anchor.'
  ),

  -- =====================================================================
  -- Tier 2 — Strategic (BoF list), awaiting Apify enrichment
  -- =====================================================================
  (
    '11111111-1111-4111-8111-000000000001', 'Teramind', 'https://www.teramind.co', 79, null,
    '["insider threat", "user activity monitoring", "data loss prevention", "employee monitoring enterprise"]'::jsonb,
    '[
      {"title": "Ship we360-vs-teramind with security + privacy framing", "reason": "Teramind is security-first — we differentiate on productivity-first workforce analytics."},
      {"title": "Link-earning focus (DR 79 with only 12 blogs = all links)", "reason": "Proves the thesis: blog volume is not the lever. Mirror their PR/data-study muscle."}
    ]'::jsonb,
    'DR 79 with just 12 blog posts — link-earning dominant. Plan §3.1(d) key evidence.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Controlio', 'https://controlio.net', null, null,
    '["controlio", "employee monitoring cloud", "remote employee monitoring"]'::jsonb,
    '[{"title": "Ship controlio-alternative", "reason": "Listed in BoF plan §4.2."}]'::jsonb,
    'Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Kickidler', 'https://www.kickidler.com', null, null,
    '["kickidler", "computer monitoring software", "live screen viewing"]'::jsonb,
    '[{"title": "Ship kickidler-alternative + we360-vs-kickidler", "reason": "Plan §4.1 / §4.2 BoF list."}]'::jsonb,
    'Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Veriato', 'https://www.veriato.com', null, null,
    '["veriato", "insider risk", "employee investigation"]'::jsonb,
    '[{"title": "Ship veriato-alternative + we360-vs-veriato", "reason": "Plan §4.1 / §4.2 BoF list."}]'::jsonb,
    'Security-forensics positioned. Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'WorkTime', 'https://www.worktime.com', null, null,
    '["worktime", "non-invasive employee monitoring"]'::jsonb,
    '[{"title": "Ship we360-vs-worktime", "reason": "Plan §4.1 BoF list."}]'::jsonb,
    'Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'InterGuard', 'https://www.interguardsoftware.com', null, null,
    '["interguard", "insider threat monitoring", "DLP"]'::jsonb,
    '[{"title": "Ship we360-vs-interguard", "reason": "Plan §4.1 BoF list."}]'::jsonb,
    'Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Monitask', 'https://www.monitask.com', null, null,
    '["monitask", "timesheet software", "screenshot monitoring"]'::jsonb,
    '[{"title": "Ship monitask-alternative + we360-vs-monitask", "reason": "Plan §4.1 / §4.2 BoF list."}]'::jsonb,
    'SMB-focused. Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'StaffCop', 'https://www.staffcop.com', null, null,
    '["staffcop", "employee monitoring software", "DLP"]'::jsonb,
    '[{"title": "Ship staffcop-alternative + we360-vs-staffcop", "reason": "Plan §4.1 / §4.2 BoF list."}]'::jsonb,
    'Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Sapience Analytics', 'https://www.sapience.net', null, null,
    '["sapience", "workforce analytics enterprise", "work pattern analytics"]'::jsonb,
    '[{"title": "Ship we360-vs-sapience-analytics", "reason": "Plan §4.1 BoF list. India roots — direct competitor in our home market."}]'::jsonb,
    'India founded, now enterprise-focused. Adjacent positioning. Plan §4.1.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Apploye', 'https://apploye.com', null, null,
    '["apploye", "freelance time tracking", "simple time tracker"]'::jsonb,
    '[{"title": "Ship we360-vs-apploye", "reason": "Plan §4.1 BoF list."}]'::jsonb,
    'Freelance/SMB tier. Plan §4 BoF list.'
  )
on conflict do nothing;

-- ============================================================
-- 20260424000004_seed_bof_and_p0_tasks.sql
-- ============================================================
-- SEO · we360.ai
-- Seed the 50 BoF pages (Plan §4) + 5 P0 technical issues (Plan §2.6) as
-- tasks against the we360.ai project. Everything is idempotent — a retry
-- won't duplicate rows (we dedupe on the `title` within the seeded set).
--
-- Scheduling roughly mirrors Plan §8:
--   M1 Week 1: the 5 P0 fixes
--   M2:        first 10 BoF pages (vs-competitor Tier 1 + top alternatives)
--   M3-M6:     remaining 40 BoF pages spread across the roadmap

-- Pick up the we360.ai project id (seeded in 20260424000002_seed_we360_project.sql)
do $$
declare
  v_project_id uuid;
  v_created_by uuid;
begin
  select id into v_project_id from public.projects where domain = 'we360.ai' limit 1;
  if v_project_id is null then
    raise notice 'Skipping seed: we360.ai project row missing.';
    return;
  end if;

  -- First available platform admin / super_admin / admin is the owner of the
  -- seeded tasks. Everyone on the internal dashboard can still see/edit them.
  select id into v_created_by from public.profiles
    where platform_admin = true or role in ('super_admin', 'admin')
    order by created_at asc limit 1;

  -- ================================================================
  -- P0 technical issues (Plan §2.6) — Month 1 Week 1
  -- ================================================================
  insert into public.tasks (
    project_id, title, kind, priority, pillar, source,
    scheduled_date, status, issue, impl, created_by
  ) values
    (v_project_id,
     'P0-1 · Fix sitemap.xml parsing error (317 URLs hidden from Google)',
     'web_task', 'critical', 'SEO', 'cron_audit',
     current_date, 'todo',
     'sitemap.xml has 2 concatenated XML documents; the Google parser stops at line 621. Only 103 of 420 URLs are being discovered.',
     'Split sitemap into a single valid XML document (or use an index + child sitemaps). Resubmit in GSC. Expected +30-50% indexed URLs within 4 weeks.',
     v_created_by),
    (v_project_id,
     'P0-2 · Resolve indexation crisis (50% of pages not indexed)',
     'web_task', 'critical', 'SEO', 'cron_audit',
     current_date + 3, 'todo',
     '496 of 998 URLs not indexed. 186 "crawled not indexed" = thin content; 152 redirect chains; 78 404s.',
     'Audit & prune 186 thin pages; flatten 152 redirect chains; fix / 301 the 78 404s. Recover crawl budget + link equity.',
     v_created_by),
    (v_project_id,
     'P0-3 · Disavow toxic backlinks (teamrelated.com PBN — 924 links)',
     'web_task', 'critical', 'SEO', 'cron_audit',
     current_date + 1, 'todo',
     '72% of external links come from a single PBN (teamrelated.com) with 924 bot-generated exact-match anchors.',
     'Compile disavow file; submit via Google Disavow Tool. DR may dip initially, recovers with cleaner profile.',
     v_created_by),
    (v_project_id,
     'P0-4 · Mobile Core Web Vitals (134 URLs, zero "good" rated)',
     'web_task', 'critical', 'SXO', 'cron_audit',
     current_date + 2, 'todo',
     'Zero mobile URLs rated "good" by CrUX. Mobile page speed + Cumulative Layout Shift are the culprits. India is 73% of our traffic and 100% mobile.',
     'Compress hero images, defer non-critical JS, reserve image dimensions to kill CLS. Target 3 "good" URLs week 1, 50+ by week 4.',
     v_created_by),
    (v_project_id,
     'P0-5 · Add JSON-LD schema (Breadcrumbs, FAQ, Product)',
     'web_task', 'critical', 'AEO', 'cron_audit',
     current_date + 2, 'todo',
     'Breadcrumbs on 3% of pages, FAQ on 2%, zero Product/Review schema. Rich results lift SERP CTR 20-40% where shown.',
     'Add Breadcrumbs + FAQ + Product schema to the page template. Validate with schema.org validator. Ship on all templates.',
     v_created_by)
  on conflict do nothing;

  -- ================================================================
  -- 15 vs-competitor pages (Plan §4.1)
  -- ================================================================
  insert into public.tasks (project_id, title, kind, priority, pillar, source, scheduled_date, status, target_keyword, word_count_target, competition, intent, issue, impl, created_by)
  select
    v_project_id,
    'Write vs-competitor page: we360-vs-' || slug,
    'blog_task',
    case when rank <= 6 then 'high' else 'medium' end,
    'SEO',
    'cron_audit',
    (current_date + (30 + rank * 2) * interval '1 day')::date,
    'todo',
    'we360 vs ' || display_name,
    2200,
    'Medium Competition',
    'commercial',
    'Competitor-validated mid-funnel evaluator intent. ' || impressions_note,
    'Feature-by-feature comparison, price table, verdict-by-use-case, ICP fit matrix. Link from /pricing + /features.',
    v_created_by
  from (values
    (1,  'hubstaff',          'Hubstaff',          '2,538 GSC impressions/mo on hubstaff-alt queries.'),
    (2,  'time-doctor',       'Time Doctor',       '1,970 GSC impressions/mo on time-doctor-alt queries.'),
    (3,  'activtrak',         'ActivTrak',         '1,616 GSC impressions/mo on activtrak-alt queries.'),
    (4,  'desktime',          'DeskTime',          '950 GSC impressions/mo on desktime-alternative.'),
    (5,  'insightful',        'Insightful',        '866 GSC impressions/mo on insightful-alt queries.'),
    (6,  'teramind',          'Teramind',          'DR 79 with only 12 blog posts — link-earning leader.'),
    (7,  'controlio',         'Controlio',         'Plan §4.1 BoF list.'),
    (8,  'kickidler',         'Kickidler',         'Plan §4.1 BoF list.'),
    (9,  'veriato',           'Veriato',           'Security-forensics positioned competitor.'),
    (10, 'worktime',          'WorkTime',          'Plan §4.1 BoF list.'),
    (11, 'interguard',        'InterGuard',        'DLP / insider-threat positioning.'),
    (12, 'monitask',          'Monitask',          'SMB-focused competitor.'),
    (13, 'staffcop',          'StaffCop',          'Plan §4.1 BoF list.'),
    (14, 'sapience-analytics','Sapience Analytics','India-founded, enterprise-focused — direct home-market rival.'),
    (15, 'apploye',           'Apploye',           'Freelance/SMB tier competitor.')
  ) as t(rank, slug, display_name, impressions_note)
  on conflict do nothing;

  -- ================================================================
  -- 12 alternative-to pages (Plan §4.2) — migration intent
  -- ================================================================
  insert into public.tasks (project_id, title, kind, priority, pillar, source, scheduled_date, status, target_keyword, word_count_target, competition, intent, issue, impl, created_by)
  select
    v_project_id,
    'Write alternative-to page: ' || slug,
    'blog_task',
    case when rank <= 5 then 'high' else 'medium' end,
    'SEO',
    'cron_audit',
    (current_date + (60 + rank * 2) * interval '1 day')::date,
    'todo',
    target_kw,
    1800,
    'Medium Competition',
    'transactional',
    'Migration intent — searcher is decided to leave a competitor.',
    'Structure: migration guide, feature mapping, pricing delta, 5-step switch plan, CTA to book a demo.',
    v_created_by
  from (values
    (1,  'hubstaff-alternative',                          'hubstaff alternative'),
    (2,  'time-doctor-alternative',                       'time doctor alternative'),
    (3,  'teramind-alternative',                          'teramind alternative'),
    (4,  'activtrak-alternative',                         'activtrak alternative'),
    (5,  'desktime-alternative',                          'desktime alternative'),
    (6,  'insightful-alternative',                        'insightful alternative'),
    (7,  'kickidler-alternative',                         'kickidler alternative'),
    (8,  'controlio-alternative',                         'controlio alternative'),
    (9,  'veriato-alternative',                           'veriato alternative'),
    (10, 'monitask-alternative',                          'monitask alternative'),
    (11, 'staffcop-alternative',                          'staffcop alternative'),
    (12, 'employee-monitoring-software-alternatives',     'employee monitoring software alternatives')
  ) as t(rank, slug, target_kw)
  on conflict do nothing;

  -- ================================================================
  -- 8 integration pages (Plan §4.3)
  -- ================================================================
  insert into public.tasks (project_id, title, kind, priority, pillar, source, scheduled_date, status, target_keyword, word_count_target, competition, intent, issue, impl, created_by)
  select
    v_project_id,
    'Write integration page: ' || tool,
    'blog_task',
    'medium',
    'SEO',
    'cron_audit',
    (current_date + (90 + rank * 2) * interval '1 day')::date,
    'todo',
    'we360 ' || tool || ' integration',
    500,
    'Low Competition',
    'commercial',
    'Template-able high-intent page. Insightful scaled to 160 integration pages — we ship a template + match their scale.',
    'Logo, value prop, 3-5 use cases, setup steps, screenshot. ~400 words unique + shared shell.',
    v_created_by
  from (values
    (1, 'slack'),            (2, 'microsoft-teams'),
    (3, 'google-workspace'), (4, 'asana'),
    (5, 'jira'),             (6, 'zoom'),
    (7, 'notion'),           (8, 'hubspot')
  ) as t(rank, tool)
  on conflict do nothing;

  -- ================================================================
  -- 10 industry pages (Plan §4.4) — India-weighted
  -- ================================================================
  insert into public.tasks (project_id, title, kind, priority, pillar, source, scheduled_date, status, target_keyword, word_count_target, competition, intent, issue, impl, created_by)
  select
    v_project_id,
    'Write industry page: industries/' || slug,
    'blog_task',
    case when rank <= 4 then 'high' else 'medium' end,
    'SEO',
    'cron_audit',
    (current_date + (105 + rank * 3) * interval '1 day')::date,
    'todo',
    target_kw,
    1800,
    'Medium Competition',
    'commercial',
    'Industry-specific pain point + compliance — India-weighted.',
    'Industry pain, DPDP/compliance angle (IN), feature mapping, 2 case studies, ROI calculator embed.',
    v_created_by
  from (values
    (1, 'bpo-kpo',         'employee monitoring software bpo'),
    (2, 'it-services',     'workforce analytics it services'),
    (3, 'banking-finance', 'employee monitoring banking compliance'),
    (4, 'healthcare',      'employee monitoring healthcare hipaa'),
    (5, 'ecommerce',       'employee productivity software ecommerce'),
    (6, 'legal',           'employee monitoring law firms'),
    (7, 'accounting-firms','workforce analytics accounting firms'),
    (8, 'real-estate',     'employee monitoring real estate'),
    (9, 'manufacturing',   'workforce productivity manufacturing'),
    (10,'consulting',      'employee productivity consulting')
  ) as t(rank, slug, target_kw)
  on conflict do nothing;

  -- ================================================================
  -- 5 India-specific pages (Plan §4.5) — uncontested SERPs
  -- ================================================================
  insert into public.tasks (project_id, title, kind, priority, pillar, source, scheduled_date, status, target_keyword, word_count_target, competition, intent, issue, impl, created_by)
  select
    v_project_id,
    'Write India page: ' || slug,
    'blog_task',
    'high',
    'GEO',
    'cron_audit',
    (current_date + (45 + rank * 2) * interval '1 day')::date,
    'todo',
    target_kw,
    1500,
    'Low Competition',
    'commercial',
    '0/8 competitors localized to India; SERPs weak. Expected top-3 in 60-90 days.',
    'Ship under /in/ or /india/ with hreflang en-IN. Include DPDP + IT Act context, ₹ pricing, Indian case studies.',
    v_created_by
  from (values
    (1, 'employee-monitoring-software-india',       'employee monitoring software india'),
    (2, 'attendance-tracking-software-india',       'attendance tracking software india'),
    (3, 'time-tracking-for-indian-bpo',             'time tracking for indian bpo'),
    (4, 'workforce-analytics-india',                'workforce analytics india'),
    (5, 'productivity-software-for-indian-enterprises', 'productivity software for indian enterprises')
  ) as t(rank, slug, target_kw)
  on conflict do nothing;

end $$;

