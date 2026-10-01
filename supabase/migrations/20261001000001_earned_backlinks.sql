-- Earned Backlinks: a separate, standalone log of backlinks the team has
-- actually LANDED via outreach/link-building strategies (guest posts, HARO,
-- broken-link building, resource pages, etc.) - conceptually distinct from
-- Backlink Submissions (backlink_websites/backlink_submissions), which
-- tracks content DISTRIBUTION to a fixed, pre-seeded platform list.
--
-- Deliberately ONE flat table, not the two-table (website + submissions)
-- pattern used for Backlink Submissions: there's no fixed/curated website
-- list to group rows under and no "0 activity for this platform" row to
-- preserve - every row here IS a real, individual backlink, so a single
-- table with no parent is the honest shape. No seed data either - this
-- starts empty by design (nothing is pre-known about links the team hasn't
-- landed yet).
--
-- domain_rating is a plain manually-typed number - this codebase's only
-- existing DR source (domain_authority table, lib/cron/phase-9-intelligence.ts)
-- is scoped to the project's own domain + tracked competitors on a monthly
-- cron, with no mechanism for an arbitrary third-party domain on demand.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations).

create table if not exists public.earned_backlinks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  website text not null,
  acquired_date date not null,
  domain_rating int,
  backlink_url text not null,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint earned_backlinks_domain_rating_range check (domain_rating is null or (domain_rating >= 0 and domain_rating <= 100))
);

create index if not exists idx_earned_backlinks_project_date
  on public.earned_backlinks(project_id, acquired_date desc);
create index if not exists idx_earned_backlinks_assignee
  on public.earned_backlinks(assigned_to);

alter table public.earned_backlinks enable row level security;
do $$
begin
  execute 'drop policy if exists earned_backlinks_access on public.earned_backlinks;';
  execute 'create policy earned_backlinks_access on public.earned_backlinks for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));';
end $$;
