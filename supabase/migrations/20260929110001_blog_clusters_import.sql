-- Blog Clusters (Ticket 1): extend the existing topic_clusters /
-- topic_cluster_items tables (built for the AI "Plan topic cluster" flow) to
-- also hold clusters pasted in from a content-planning spreadsheet, rather
-- than building a second parallel "cluster" concept.
--
-- topic_clusters gets a human name distinct from pillar_title (an imported
-- cluster doesn't necessarily have a single pillar row) and a source flag.
-- topic_cluster_items gets the columns the spreadsheet has that the AI-only
-- shape never needed: a sub-category, funnel stage, content type, search
-- volume, SERP verdict, supporting keywords, FAQ candidates, interlink
-- targets, and on-page metadata. H2 candidates reuse the existing `outline`
-- jsonb column (same shape: an array of H2 strings) rather than duplicating it.

alter table public.topic_clusters
  add column if not exists cluster_name text,
  add column if not exists source text not null default 'ai_generated' check (source in ('ai_generated', 'import'));

-- Backfill existing AI-generated clusters with a sensible display name so the
-- future cluster-list page has something to show for rows that predate this
-- column, instead of a blank card.
update public.topic_clusters set cluster_name = pillar_title where cluster_name is null;

alter table public.topic_clusters alter column cluster_name set not null;

alter table public.topic_cluster_items
  add column if not exists category text,
  add column if not exists funnel_stage text,
  add column if not exists content_type text,
  add column if not exists vol_mo integer,
  add column if not exists serp_verdict text,
  add column if not exists supporting_keywords jsonb not null default '[]'::jsonb,   -- [{keyword, volume}, ...] up to 15
  add column if not exists faq_candidates jsonb not null default '[]'::jsonb,        -- ["question?", ...]
  add column if not exists interlinks_to text[] not null default '{}',              -- paths/slugs this row should link to
  add column if not exists interlinks_from text[] not null default '{}',            -- paths/slugs that should link to this row
  add column if not exists meta_description text,
  add column if not exists url_slug text,
  add column if not exists primary_cta text;

create index if not exists idx_topic_clusters_name on public.topic_clusters(project_id, cluster_name);
