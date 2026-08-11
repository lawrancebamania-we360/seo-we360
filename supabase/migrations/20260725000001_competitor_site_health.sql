-- Competitor site health (Core Web Vitals via Google PageSpeed Insights).
--
-- The Competitors page can now show each rival's real mobile page-speed score +
-- Core Web Vitals, fetched on demand from PageSpeed Insights (same source as the
-- project's own WPS/CWV pillar). One latest snapshot per competitor+device
-- (upsert on conflict), refreshed when a team member clicks "Check site health".
-- No fabricated numbers: a competitor with no row simply shows "not checked yet".

create table if not exists public.competitor_site_health (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  url text not null,
  device text not null default 'mobile',
  score int,            -- Lighthouse performance score, 0-100
  lcp real,             -- Largest Contentful Paint, seconds
  cls real,             -- Cumulative Layout Shift, unitless
  inp real,             -- Interaction to Next Paint, milliseconds
  ttfb real,            -- Time to First Byte, seconds
  fcp real,             -- First Contentful Paint, seconds
  fetched_at timestamptz not null default now(),
  unique (competitor_id, device)
);

create index if not exists idx_competitor_site_health_project
  on public.competitor_site_health(project_id);

alter table public.competitor_site_health enable row level security;

create policy "competitor_site_health_select" on public.competitor_site_health
  for select using (has_project_access(project_id));
create policy "competitor_site_health_insert" on public.competitor_site_health
  for insert with check (has_project_access(project_id));
create policy "competitor_site_health_update" on public.competitor_site_health
  for update using (has_project_access(project_id)) with check (has_project_access(project_id));

comment on table public.competitor_site_health is
  'Latest mobile PageSpeed/Core Web Vitals snapshot per competitor (one row per competitor+device, upserted). Refreshed on demand from the Competitors page.';
