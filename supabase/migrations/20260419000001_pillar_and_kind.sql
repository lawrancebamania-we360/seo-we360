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
