-- Blog audit system — full GSC + GA4 driven D/M/M decisions for every blog URL.
-- Replaces the small B2.1 "prune 41 thin posts" task with a data-driven dashboard.

-- ============================================================
-- blog_audit_runs — one row per audit pass (snapshot)
-- ============================================================
create table if not exists public.blog_audit_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  pulled_at timestamptz not null default now(),
  gsc_window_days int not null default 480,         -- ~16 months
  ga4_window_days int not null default 365,
  total_urls int default 0,
  notes text
);

create index if not exists idx_blog_audit_runs_project on public.blog_audit_runs(project_id, pulled_at desc);

alter table public.blog_audit_runs enable row level security;
create policy "blog_audit_runs project access" on public.blog_audit_runs for all
  using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- ============================================================
-- blog_audit — one row per URL per run
-- ============================================================
create table if not exists public.blog_audit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.blog_audit_runs(id) on delete cascade,
  url text not null,

  -- GSC aggregates over the run's window (default 16 months)
  gsc_clicks int default 0,
  gsc_impressions int default 0,
  gsc_position numeric(5,2),                        -- avg position
  gsc_ctr numeric(7,4),                             -- click-through rate (0..1)

  -- GA4 aggregates over the run's window (default 12 months)
  ga4_sessions int default 0,
  ga4_engaged_sessions int default 0,
  ga4_avg_engagement_time_sec numeric(8,2),

  -- Decision tree output
  decision text not null check (decision in ('prune', 'merge', 'refresh', 'keep')),
  decision_reason text,                             -- which rule fired
  merge_target_url text,                            -- only when decision='merge'
  merge_target_score numeric(4,2),                  -- Jaccard slug similarity (0..1)
  priority text check (priority in ('critical', 'high', 'medium', 'low')) default 'medium',

  -- Action tracking — SEO lead works the dashboard
  status text not null check (status in ('todo', 'in_progress', 'done', 'skipped')) default 'todo',
  action_taken_at timestamptz,
  action_notes text,
  assigned_to uuid references public.profiles(id) on delete set null,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id, url, run_id)
);

create index if not exists idx_blog_audit_project on public.blog_audit(project_id, created_at desc);
create index if not exists idx_blog_audit_run on public.blog_audit(run_id);
create index if not exists idx_blog_audit_decision on public.blog_audit(project_id, decision, status);
create index if not exists idx_blog_audit_url on public.blog_audit(project_id, url);

alter table public.blog_audit enable row level security;
create policy "blog_audit project access" on public.blog_audit for all
  using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- updated_at trigger
create or replace function public.touch_blog_audit_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_blog_audit_updated on public.blog_audit;
create trigger touch_blog_audit_updated
before update on public.blog_audit
for each row execute function public.touch_blog_audit_updated_at();

-- Reload PostgREST schema so the new tables become queryable immediately.
notify pgrst, 'reload schema';
