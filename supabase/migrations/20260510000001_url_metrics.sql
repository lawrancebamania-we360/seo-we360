-- url_metrics — single source of truth for GSC + GA4 data across the dashboard.
--
-- Populated daily by the local Claude Code skill `sync-url-metrics` via the
-- Composio MCP integration. Read by:
--   • Blog audit page (decision tree: prune / merge / refresh / keep)
--   • Task detail dialog (live performance panel per URL)
--   • Web Tasks list (small impressions/clicks badge per row)
--   • Brief data_backing auto-fill (Update Blog / Update Page tasks)
--
-- One row per (project_id, url, period, snapshot_date). Keeping historical
-- snapshots lets the audit compare "today vs 7d ago" to detect regressions.

create table if not exists public.url_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,

  -- Lookback window. We pull three at a time so the audit can compare a
  -- post that's strong in the last 30d but flat over 90d (= losing momentum)
  -- vs one that's flat 30d but climbing 90d (= warming up).
  period text not null check (period in ('30d', '60d', '90d')),

  -- ---- GSC fields ----
  gsc_clicks int default 0,
  gsc_impressions int default 0,
  gsc_ctr numeric(6, 4) default 0,        -- 0.0000 - 1.0000
  gsc_position numeric(6, 2) default 0,   -- avg position; lower is better
  gsc_top_queries jsonb,                  -- [{query, clicks, impressions, position}]

  -- ---- GA4 fields ----
  ga_sessions int default 0,
  ga_engaged_sessions int default 0,
  ga_engagement_rate numeric(6, 4) default 0,
  ga_avg_engagement_time int default 0,   -- seconds
  ga_bounce_rate numeric(6, 4) default 0,
  ga_conversions int default 0,
  ga_top_referrers jsonb,                 -- [{source, sessions}]

  -- ---- Snapshot metadata ----
  snapshot_date date not null default current_date,
  pulled_at timestamptz not null default now(),
  source_run_id uuid,                     -- groups all rows from one daily sync

  unique(project_id, url, period, snapshot_date)
);

create index if not exists idx_url_metrics_project on public.url_metrics(project_id);
create index if not exists idx_url_metrics_url on public.url_metrics(project_id, url);
create index if not exists idx_url_metrics_latest on public.url_metrics(project_id, url, period, snapshot_date desc);

-- Latest-snapshot view — what the dashboard reads on every request.
create or replace view public.url_metrics_latest as
select distinct on (project_id, url, period) *
from public.url_metrics
order by project_id, url, period, snapshot_date desc;

-- ============================================================
-- RLS — read-everywhere for project members, write admin-only.
-- ============================================================

alter table public.url_metrics enable row level security;

create policy "url_metrics_select" on public.url_metrics
  for select using (public.has_project_access(project_id));

create policy "url_metrics_write_admin" on public.url_metrics
  for all using (public.is_admin());

-- Sync run log — one row per daily sync, for observability.
create table if not exists public.url_metrics_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  urls_total int default 0,
  urls_succeeded int default 0,
  urls_failed int default 0,
  status text default 'running' check (status in ('running', 'completed', 'failed')),
  error_message text
);

alter table public.url_metrics_runs enable row level security;
create policy "url_metrics_runs_select" on public.url_metrics_runs
  for select using (public.has_project_access(project_id));
create policy "url_metrics_runs_write_admin" on public.url_metrics_runs
  for all using (public.is_admin());
