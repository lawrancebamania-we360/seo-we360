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
