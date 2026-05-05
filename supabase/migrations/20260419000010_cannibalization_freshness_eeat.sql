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
