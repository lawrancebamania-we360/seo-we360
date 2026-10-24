-- Content pipeline -> Team Targets: who WROTE each planned post, so a page
-- going live can credit the writer's Team Target (not just Dinesh's upload target).
-- The Blog Clusters "assignee" creates a Sprint task; this is a lightweight tag
-- instead, backfilled from the content sheet's Owner column (matched to a team
-- member by first name). Additive + idempotent. Apply MANUALLY in Supabase.

alter table public.topic_cluster_items
  add column if not exists writer_id uuid references public.profiles(id) on delete set null;
create index if not exists idx_cluster_items_writer
  on public.topic_cluster_items(writer_id) where writer_id is not null;

-- Backfill the 56 imported guides that have an owner (6 have none). Only fills
-- rows where writer_id is still null, so re-running never overwrites a later edit.
do $$
declare
  v_project uuid;
  v_writer uuid;
  r record;
begin
  select id into v_project from public.projects where lower(domain) = 'we360.ai' order by created_at limit 1;
  if v_project is null then return; end if;
  for r in select * from (values
    ('we360.ai/guide/call-center-productivity-metrics', 'Lokesh'),
    ('we360.ai/guide/call-center-agent-monitoring', 'Lokesh'),
    ('we360.ai/guide/employee-gps-tracking', 'Lokesh'),
    ('we360.ai/guide/call-center-shrinkage', 'Lokesh'),
    ('we360.ai/guide/resource-utilization', 'Lokesh'),
    ('we360.ai/guide/employee-utilization-rate', 'Lokesh'),
    ('we360.ai/guide/workforce-capacity-planning', 'Lokesh'),
    ('we360.ai/guide/employee-workload-management', 'Lokesh'),
    ('we360.ai/blog/how-do-you-reduce-bench-time', 'Lokesh'),
    ('we360.ai/guide/employee-privacy-rights', 'Lokesh'),
    ('we360.ai/guide/employee-monitoring-ethics', 'Lokesh'),
    ('we360.ai/guide/employee-monitoring-laws', 'Lokesh'),
    ('we360.ai/guide/gdpr-employee-monitoring', 'Lokesh'),
    ('we360.ai/guide/pros-and-cons-of-employee-monitoring', 'Lokesh'),
    ('we360.ai/guide/bossware', 'Lokesh'),
    ('we360.ai/guide/is-employee-monitoring-legal', 'Lokesh'),
    ('we360.ai/guide/employee-computer-monitoring-software', 'Lokesh'),
    ('we360.ai/guide/best-employee-monitoring-software', 'Lokesh'),
    ('we360.ai/guide/how-to-monitor-employee-computer-activity', 'Lokesh'),
    ('we360.ai/guide/what-is-employee-monitoring', 'Lokesh'),
    ('we360.ai/guide/employee-keystroke-monitoring', 'Lokesh'),
    ('we360.ai/guide/screen-monitoring-software', 'Lokesh'),
    ('we360.ai/guide/employee-time-tracking-software', 'Namrata'),
    ('we360.ai/guide/insider-threat-indicators', 'Naveen'),
    ('we360.ai/guide/employee-data-theft', 'Naveen'),
    ('we360.ai/guide/predictive-analytics-in-hr', 'Naveen'),
    ('we360.ai/guide/quiet-quitting', 'Naveen'),
    ('we360.ai/guide/people-analytics', 'Naveen'),
    ('we360.ai/guide/workforce-analytics', 'Naveen'),
    ('we360.ai/guide/employee-engagement-metrics', 'Naveen'),
    ('we360.ai/guide/employee-turnover-rate-formula', 'Naveen'),
    ('we360.ai/guide/employee-burnout', 'Naveen'),
    ('we360.ai/guide/project-time-tracking', 'Namrata'),
    ('we360.ai/guide/how-to-track-billable-hours', 'Namrata'),
    ('we360.ai/guide/employee-attendance-tracking-system', 'Namrata'),
    ('we360.ai/guide/remote-employee-time-tracking', 'Namrata'),
    ('we360.ai/guide/timesheet-software-for-agencies', 'Namrata'),
    ('we360.ai/guide/idle-time-tracking', 'Namrata'),
    ('we360.ai/guide/how-to-monitor-remote-employees', 'Namrata'),
    ('we360.ai/guide/remote-team-productivity-tools', 'Naveen'),
    ('we360.ai/guide/how-to-manage-remote-employees', 'Naveen'),
    ('we360.ai/guide/how-to-manage-a-distributed-team', 'Naveen'),
    ('we360.ai/guide/remote-work-policy-template', 'Naveen'),
    ('we360.ai/guide/remote-employee-performance-review', 'Naveen'),
    ('we360.ai/guide/employee-time-theft', 'Namrata'),
    ('we360.ai/guide/buddy-punching', 'Namrata'),
    ('we360.ai/guide/moonlighting-employees', 'Namrata'),
    ('we360.ai/guide/how-to-reduce-labor-costs', 'Namrata'),
    ('we360.ai/guide/workforce-cost-analysis', 'Namrata'),
    ('we360.ai/guide/hybrid-work-productivity', 'Namrata'),
    ('we360.ai/guide/how-to-measure-developer-productivity', 'Namrata'),
    ('we360.ai/guide/employee-productivity-tracking', 'Namrata'),
    ('we360.ai/guide/productivity-tracking', 'Namrata'),
    ('we360.ai/guide/productivity-metrics', 'Namrata'),
    ('we360.ai/guide/how-to-measure-employee-productivity', 'Namrata'),
    ('we360.ai/guide/employee-productivity-roi". Read the answers carefully — they may request clarification, changes, or that you not proceed — and follow what they actually say.', 'Namrata')
  ) as t(slug, owner_name) loop
    select id into v_writer from public.profiles
      where lower(split_part(name, ' ', 1)) = lower(r.owner_name) and role <> 'client' limit 1;
    if v_writer is null then continue; end if;
    update public.topic_cluster_items set writer_id = v_writer
      where project_id = v_project and url_slug = r.slug and writer_id is null;
  end loop;
end $$;
