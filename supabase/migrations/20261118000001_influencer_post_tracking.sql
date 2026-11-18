-- Influencer Collabs: post tracking.
--
--   1. post_body_link / comment_link: the we360.ai link in the post body and
--      the UTM link the influencer drops in a comment. Scraped ONCE per post
--      (links_scraped_at is stamped then) - the daily job never re-scrapes
--      them. Anyone can correct them; a manual edit also stamps
--      links_scraped_at so the scraper leaves the row alone.
--   2. influencer_post_metrics: one row per post per day for its first 15
--      days - reactions, comments, reposts. source = 'auto' (daily scraper) or
--      'manual' (a person's edit). The scraper never overwrites a manual row.
--   3. scrape_error: the last scraper failure for a post, shown in the UI so a
--      broken post link is visible instead of silently empty.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

alter table public.influencer_collabs add column if not exists post_body_link text;
alter table public.influencer_collabs add column if not exists comment_link text;
alter table public.influencer_collabs add column if not exists links_scraped_at timestamptz;
alter table public.influencer_collabs add column if not exists scrape_error text;

create table if not exists public.influencer_post_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  collab_id uuid not null references public.influencer_collabs(id) on delete cascade,
  captured_on date not null,
  reactions integer check (reactions >= 0),
  comments integer check (comments >= 0),
  reposts integer check (reposts >= 0),
  source text not null default 'auto' check (source in ('auto', 'manual')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (collab_id, captured_on)
);

create index if not exists idx_influencer_post_metrics_collab
  on public.influencer_post_metrics(collab_id, captured_on desc);

alter table public.influencer_post_metrics enable row level security;
do $$
begin
  execute 'drop policy if exists influencer_post_metrics_access on public.influencer_post_metrics;';
  execute 'create policy influencer_post_metrics_access on public.influencer_post_metrics for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));';
end $$;
