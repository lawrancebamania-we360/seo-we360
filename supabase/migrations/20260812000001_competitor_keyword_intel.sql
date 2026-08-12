-- Competitor keyword intelligence — santhej/website-traffic-intel (Apify), run
-- monthly alongside the other 5 intelligence actors (see phase-9-intelligence.ts
-- + new phase-11-competitor-keywords.ts).
--
-- Two tables, both append-only monthly snapshots (never updated in place) so
-- month-over-month deltas can be computed by comparing the latest row to the
-- one before it — same pattern as domain_authority / serp_rankings.
--
--   competitor_keyword_snapshots — "overview" mode: per-competitor keyword
--     count + estimated traffic + top ranked keywords. Powers the "What they
--     rank for" boards and its keywords-ranked month-over-month delta.
--
--   competitor_keyword_gaps — "keyword_gap" mode: keywords a competitor ranks
--     for where we're weak or absent. Powers the "Keyword gap" panel.

create table if not exists public.competitor_keyword_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  domain text not null,
  estimated_traffic bigint,
  keywords_ranked integer,
  top_keywords jsonb default '[]'::jsonb,   -- [{keyword, position, volume, cpc}]
  checked_at timestamptz not null default now()
);

create index if not exists idx_competitor_kw_snapshots_project
  on public.competitor_keyword_snapshots(project_id, checked_at desc);
create index if not exists idx_competitor_kw_snapshots_competitor
  on public.competitor_keyword_snapshots(competitor_id, checked_at desc);

alter table public.competitor_keyword_snapshots enable row level security;
create policy "competitor_keyword_snapshots project members"
  on public.competitor_keyword_snapshots for select
  using (has_project_access(project_id));

create table if not exists public.competitor_keyword_gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  keyword text not null,
  volume integer,
  cpc numeric(10,2),
  competitor_position integer,
  our_position integer,                     -- null = we don't rank in the actor's tracked window
  priority text check (priority in ('High', 'Medium', 'Low')),
  intent text,
  checked_at timestamptz not null default now()
);

create index if not exists idx_competitor_kw_gaps_project
  on public.competitor_keyword_gaps(project_id, checked_at desc);

alter table public.competitor_keyword_gaps enable row level security;
create policy "competitor_keyword_gaps project members"
  on public.competitor_keyword_gaps for select
  using (has_project_access(project_id));

-- Widen the intelligence_runs actor log to track this 6th actor alongside the
-- existing 5 (serp, ai_overview, backlinks, domain_authority, content_gap).
alter table public.intelligence_runs drop constraint if exists intelligence_runs_actor_check;
alter table public.intelligence_runs add constraint intelligence_runs_actor_check
  check (actor in (
    'serp', 'ai_overview', 'backlinks', 'domain_authority', 'content_gap', 'competitor_keywords'
  ));
