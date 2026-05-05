-- SEO · we360.ai: add `client` role for external client users
-- Client = member (same granular permissions) BUT NOT assignable to tasks.
-- Used to give the client-side stakeholders read/comment access to their own project.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'member', 'client'));

create index if not exists idx_profiles_role_nonclient on public.profiles(role)
  where role != 'client';
