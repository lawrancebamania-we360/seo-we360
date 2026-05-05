-- SEO · we360.ai: internal-only pivot.
-- Rip out the legacy billing + multi-tenant layer (orgs, plans, subs, invoices).
-- Everyone is implicitly on the same we360 workspace now; no paid plans.

-- ----------------------------------------------------------------
-- 1. Drop billing + tenant tables (in dependency order)
-- ----------------------------------------------------------------
drop table if exists public.usage_events        cascade;
drop table if exists public.webhook_events      cascade;
drop table if exists public.invoices            cascade;
drop table if exists public.razorpay_orders     cascade;
drop table if exists public.subscriptions       cascade;
drop table if exists public.plans               cascade;
drop table if exists public.organization_members cascade;
drop table if exists public.organizations       cascade;

-- ----------------------------------------------------------------
-- 2. Strip the org_id FK from projects (older deploys added it)
-- ----------------------------------------------------------------
alter table public.projects drop column if exists org_id;

-- ----------------------------------------------------------------
-- 3. Drop any billing-adjacent indexes / policies left dangling
-- ----------------------------------------------------------------
drop index if exists idx_projects_org;

-- ----------------------------------------------------------------
-- 4. Purge legacy demo project (SkyHigh India) if it was seeded.
--    Child rows cascade via existing FKs on project_id.
-- ----------------------------------------------------------------
delete from public.projects where id = '00000000-0000-4000-8000-000000000001';
delete from public.projects where domain = 'skyhighindia.com';

-- ----------------------------------------------------------------
-- 5. Re-add platform_admin column on profiles.
--    It was originally introduced in the now-deleted billing migration but is
--    still load-bearing for admin/* gating + getUserContext.
-- ----------------------------------------------------------------
alter table public.profiles
  add column if not exists platform_admin boolean not null default false;

create index if not exists idx_profiles_platform_admin
  on public.profiles(platform_admin) where platform_admin = true;

-- ----------------------------------------------------------------
-- 6. Restrict signups to @we360.ai Google accounts.
--    Defense-in-depth: the /auth/callback route also checks, but this
--    ensures the DB itself refuses non-we360 profiles even if someone
--    hits Supabase Auth directly.
-- ----------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_name text;
begin
  if lower(new.email) not like '%@we360.ai' then
    raise exception 'Only @we360.ai accounts are permitted (got %).', new.email
      using errcode = '42501';
  end if;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, v_name, 'member')
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

