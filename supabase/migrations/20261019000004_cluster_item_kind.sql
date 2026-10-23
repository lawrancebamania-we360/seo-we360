-- Content pipeline: an explicit Blog / Guide / Listicle / Pillar tag per planned
-- item. The import's "Content type" column is an SEO-planning taxonomy (Existing
-- refresh, Consolidation, New content, Comparison page, ...), not blog-vs-guide,
-- so the team tags each item's real kind here. Reads fall back to inferring the
-- kind from content_type when this is null, so the filter keeps working before
-- anything is tagged.
--
-- Additive, idempotent. Apply MANUALLY in Supabase, after 20261019000003.

alter table public.topic_cluster_items
  add column if not exists content_kind text
  check (content_kind is null or content_kind in ('blog', 'guide', 'listicle', 'pillar'));
