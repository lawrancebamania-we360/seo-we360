-- Content pipeline: writers attach the artifact they produced to each planned
-- blog/guide (their draft doc + a Google Drive link for images), then whoever
-- uploads it to the site records the live URL. "Is it actually live" is read
-- off the daily sitemap snapshot (url_metrics_runs.url_list), so no new cron.
--
-- All additive on topic_cluster_items. Reads degrade before this is applied
-- (the cluster pages and the To Publish queue show no artifact / no publish
-- state rather than crashing). Apply MANUALLY in Supabase. Idempotent.

alter table public.topic_cluster_items
  add column if not exists artifact_url text;         -- the writer's draft/doc link
alter table public.topic_cluster_items
  add column if not exists artifact_drive_url text;   -- Google Drive link (images live here)
alter table public.topic_cluster_items
  add column if not exists published_url text;         -- the live page URL, once uploaded
alter table public.topic_cluster_items
  add column if not exists published_at timestamptz;
alter table public.topic_cluster_items
  add column if not exists published_by uuid references public.profiles(id) on delete set null;

-- The To Publish queue scans for items that have an artifact but no live URL.
create index if not exists idx_cluster_items_publish
  on public.topic_cluster_items(project_id)
  where artifact_url is not null and published_url is null;
