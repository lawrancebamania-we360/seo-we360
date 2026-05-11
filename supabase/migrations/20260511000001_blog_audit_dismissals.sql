-- Audit findings worklist state.
--
-- We do NOT materialize findings — they're derived live from url_metrics
-- on every page load by applying classifyUrl(). That keeps the audit
-- always current with the latest GSC + GA4 data.
--
-- What we DO persist is admin-controlled state:
--   • dismissals  — "I saw this finding and decided not to action it"
--                   so the same row doesn't keep nagging the team
--
-- Task linkage is computed at query time via tasks.url, with a 90-day
-- window: an Update-Blog task that's been Published for >90 days no
-- longer blocks a fresh refresh task.

create table if not exists public.blog_audit_dismissals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  decision text not null check (decision in ('prune', 'merge', 'refresh', 'keep')),
  dismissed_by_id uuid references public.profiles(id) on delete set null,
  dismissed_at timestamptz not null default now(),
  reason text,
  unique(project_id, url, decision)
);

create index if not exists idx_blog_audit_dismissals_project on public.blog_audit_dismissals(project_id);
create index if not exists idx_blog_audit_dismissals_url on public.blog_audit_dismissals(project_id, url);

alter table public.blog_audit_dismissals enable row level security;

create policy "audit_dismissals_select" on public.blog_audit_dismissals
  for select using (public.has_project_access(project_id));

create policy "audit_dismissals_write_admin" on public.blog_audit_dismissals
  for all using (public.is_admin());
