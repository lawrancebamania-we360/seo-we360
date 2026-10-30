-- Blog Clusters: a cluster owner / point-of-contact (POC), chosen from the
-- project's team (profiles). Additive + nullable, so existing clusters are
-- simply "unassigned" until someone picks an owner. Reads fall back to the
-- ownerless select until this is applied.
alter table public.topic_clusters
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_topic_clusters_owner on public.topic_clusters(owner_id);
