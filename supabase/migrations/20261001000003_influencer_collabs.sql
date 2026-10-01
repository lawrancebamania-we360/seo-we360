-- Influencer Collabs: a flat, no-drill-down tracker for paid/gifted
-- influencer collaborations - same shape as Earned Backlinks (one table,
-- no seed data, starts empty, RLS via has_project_access). amount_paid is
-- in scope from day one here (unlike Earned Backlinks, which got it in a
-- follow-up migration), so no currency/is_free columns - the user asked for
-- a plain "Amount Paid" this time, no currency selector.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

create table if not exists public.influencer_collabs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  influencer_name text not null,
  profile_link text not null,
  platform text not null check (platform in ('YouTube','Instagram','Facebook','Twitter','LinkedIn')),
  post_date date not null,
  closing_date date,
  amount_paid numeric(10,2),
  post_link text,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_influencer_collabs_project_date
  on public.influencer_collabs(project_id, post_date desc);
create index if not exists idx_influencer_collabs_assignee
  on public.influencer_collabs(assigned_to);

alter table public.influencer_collabs enable row level security;
do $$
begin
  execute 'drop policy if exists influencer_collabs_access on public.influencer_collabs;';
  execute 'create policy influencer_collabs_access on public.influencer_collabs for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));';
end $$;
