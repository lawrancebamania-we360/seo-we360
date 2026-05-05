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
