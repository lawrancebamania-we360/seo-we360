-- SEO · we360.ai — Add blog_audit to member_permissions sections
--
-- The Blog Audit nav route was added after the initial schema; the section
-- enum on member_permissions didn't include it, so admins had no way to
-- grant or revoke per-user access to blog audit specifically. This widens
-- the check constraint to accept 'blog_audit' as a valid section key.

alter table public.member_permissions
  drop constraint if exists member_permissions_section_check;

alter table public.member_permissions
  add constraint member_permissions_section_check
  check (section in (
    'overview', 'tasks', 'seo_gaps', 'keywords', 'technical',
    'competitors', 'sprint', 'wins', 'articles', 'team', 'blog_audit'
  ));
