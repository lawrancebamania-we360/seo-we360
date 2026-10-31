-- Blog Clusters: a per-post owner / point-of-contact, chosen from the project's
-- team (profiles). Separate from the cluster-level owner (20261030000001) — a
-- cluster can span several owners across its posts. Additive + nullable; reads
-- fall back to the ownerless select until this is applied.
alter table public.topic_cluster_items
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_topic_cluster_items_owner on public.topic_cluster_items(owner_id);
