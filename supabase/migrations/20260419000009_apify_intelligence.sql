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
