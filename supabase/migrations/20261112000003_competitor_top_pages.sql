-- Competitors: a domain's Top Pages by organic traffic, from Ahrefs via the
-- Apify actor pro100chok/ahrefs-seo-tools (searchType "traffic_overview", which
-- returns a topPages list: URL, estimated traffic, traffic share). Replaces the
-- old "what they rank for" keyword board on the Competitors page.
--
-- Stored per competitor (competitor_id) OR for the project's own domain
-- (competitor_id null). Each on-demand "Refresh" wipes and re-inserts that
-- domain's rows, so fetched_at is the same across a domain's current set.
--
-- Apify-backed and gated by APIFY_TOKEN; the reader degrades (empty) until this
-- migration is applied. Apply MANUALLY in Supabase. Idempotent.

create table if not exists public.competitor_top_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  competitor_id uuid references public.competitors(id) on delete cascade, -- null = the project's own domain
  domain text not null,
  url text not null,
  estimated_traffic bigint,
  traffic_share numeric(6, 3),   -- % of the domain's organic traffic this page gets
  rank int not null,             -- 1..N by traffic (we keep the top 10)
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_competitor_top_pages_lookup
  on public.competitor_top_pages(project_id, competitor_id, rank);

alter table public.competitor_top_pages enable row level security;

drop policy if exists "competitor_top_pages_select" on public.competitor_top_pages;
create policy "competitor_top_pages_select" on public.competitor_top_pages
  for select using (has_project_access(project_id));
drop policy if exists "competitor_top_pages_insert" on public.competitor_top_pages;
create policy "competitor_top_pages_insert" on public.competitor_top_pages
  for insert with check (has_project_access(project_id));
drop policy if exists "competitor_top_pages_delete" on public.competitor_top_pages;
create policy "competitor_top_pages_delete" on public.competitor_top_pages
  for delete using (has_project_access(project_id));
