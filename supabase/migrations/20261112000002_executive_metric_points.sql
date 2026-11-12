-- Executive Dashboard: hand-entered metric points for "target vs achieved".
--
-- Neither Domain Rating nor organic-traffic TARGETS exist anywhere in the
-- schema, and DR itself is Ahrefs data the team reads off a dashboard and
-- types in (there is no DR history table - domain_authority overwrites). So
-- the executive view is backed by a single append-only points table that
-- leadership fills by hand:
--
--   metric = 'dr'      -> Domain Rating (Ahrefs), 0-100
--   metric = 'traffic' -> organic sessions / clicks for the period
--   kind   = 'actual'  -> a measured value on a date (DR 41, then 43, ...)
--   kind   = 'target'  -> the goal for that metric (a reference line)
--
-- Append-only by design: every DR reading is its own row, so the chart draws
-- a real trajectory (41 -> 42 -> 43) instead of a single overwritten number.
-- A mistake is fixed by deleting the row, not editing it. The app enforces
-- who may write (admins only); RLS stays open to any signed-in team member
-- for read, matching the other project tables.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

create table if not exists public.seo_metric_points (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  metric text not null check (metric in ('dr', 'traffic')),
  kind text not null check (kind in ('actual', 'target')),
  value numeric not null,
  as_of date not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_seo_metric_points_lookup
  on public.seo_metric_points(project_id, metric, kind, as_of);

alter table public.seo_metric_points enable row level security;

drop policy if exists "seo_metric_points_select" on public.seo_metric_points;
create policy "seo_metric_points_select" on public.seo_metric_points
  for select using (has_project_access(project_id));
drop policy if exists "seo_metric_points_insert" on public.seo_metric_points;
create policy "seo_metric_points_insert" on public.seo_metric_points
  for insert with check (has_project_access(project_id));
drop policy if exists "seo_metric_points_delete" on public.seo_metric_points;
create policy "seo_metric_points_delete" on public.seo_metric_points
  for delete using (has_project_access(project_id));
