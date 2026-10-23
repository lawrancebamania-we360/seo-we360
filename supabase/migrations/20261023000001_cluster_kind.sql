-- Content pipeline: a cluster is either a Blog cluster or a Guide cluster
-- (guides live under a separate URL section). Chosen when the cluster is
-- created and shown on its card; every post inherits it unless a per-post
-- override is set (topic_cluster_items.content_kind, migration 20261019000004).
--
-- Existing clusters default to 'blog' (NOT NULL default), so the 8 already
-- imported become Blog and can be switched to Guide from the card. Additive,
-- idempotent. Apply MANUALLY in Supabase.

alter table public.topic_clusters
  add column if not exists kind text not null default 'blog'
  check (kind in ('blog', 'guide'));
