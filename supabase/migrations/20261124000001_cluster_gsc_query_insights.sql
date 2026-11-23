-- Blog Clusters - GSC queries, round 2 (GC-8, GC-10, GC-12):
--   usages              - how to use the search term, one or more of:
--                         title_meta | template | h2 | faq | paragraph | link_text
--   drafts              - Claude's ready-to-use wording per option
--                         {title, meta, h2, faqQuestion, faqAnswer, paragraph, template}
--   ranking_page_title  - the live <title> of the page the query ranks on
--   ranking_page_h1     - the live first <h1> of that page
-- The app works before this is applied (it falls back to rule-based options and
-- shows no drafts); the next refresh fills drafts and live titles.

alter table public.topic_cluster_gsc_queries
  add column if not exists usages text[] not null default '{}',
  add column if not exists drafts jsonb,
  add column if not exists ranking_page_title text,
  add column if not exists ranking_page_h1 text;

-- Carry the old single "usage" over to the new list.
update public.topic_cluster_gsc_queries
set usages = case usage
  when 'h2' then array['h2']
  when 'faq' then array['faq']
  when 'body' then array['paragraph']
  else '{}'::text[] end
where usages = '{}'::text[] and usage is not null;
