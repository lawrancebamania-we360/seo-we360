-- 100K Organic Traffic Plan v2 (Apr 27, 2026) requires every task to surface
-- the GSC/GA4/PSI evidence that justifies it. Mandatory for blog tasks (writers
-- need to know WHY this query/page is in the queue), optional but recommended
-- for web tasks. Rendered as a yellow callout pinned to the top of both
-- task-detail dialogs.

alter table public.tasks
  add column if not exists data_backing text;

-- Reload PostgREST schema so the new column becomes queryable immediately
-- (otherwise inserts/selects through the JS client get column-not-found until
-- the next pgrst restart).
notify pgrst, 'reload schema';
