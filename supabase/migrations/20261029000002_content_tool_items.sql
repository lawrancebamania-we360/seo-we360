-- Up to 3 calculators per post.
-- Replaces the single topic_cluster_items.tool_id link with a join table so a
-- guide/blog can carry several calculators (product cap: 3, enforced in the app
-- layer + UI). The legacy tool_id column is KEPT (not dropped) so pre-migration
-- code paths and the single-tool read fallback keep working; it's maintained by
-- the app as a mirror of the post's primary (lowest-position) calculator.
-- Additive + idempotent. Apply MANUALLY in Supabase.

create table if not exists public.content_tool_items (
  item_id uuid not null references public.topic_cluster_items(id) on delete cascade,
  tool_id uuid not null references public.content_tools(id) on delete cascade,
  position smallint not null default 0,     -- display order within the post (0 = primary)
  created_at timestamptz not null default now(),
  primary key (item_id, tool_id)            -- a tool links to a post at most once
);

create index if not exists idx_content_tool_items_item on public.content_tool_items(item_id);
create index if not exists idx_content_tool_items_tool on public.content_tool_items(tool_id);

alter table public.content_tool_items enable row level security;

-- Access follows the parent post's project. topic_cluster_items carries
-- project_id directly, so a single-table subquery is enough.
drop policy if exists "content_tool_items_select" on public.content_tool_items;
create policy "content_tool_items_select" on public.content_tool_items
  for select using (exists (
    select 1 from public.topic_cluster_items i
    where i.id = content_tool_items.item_id and has_project_access(i.project_id)
  ));
drop policy if exists "content_tool_items_insert" on public.content_tool_items;
create policy "content_tool_items_insert" on public.content_tool_items
  for insert with check (exists (
    select 1 from public.topic_cluster_items i
    where i.id = content_tool_items.item_id and has_project_access(i.project_id)
  ));
drop policy if exists "content_tool_items_update" on public.content_tool_items;
create policy "content_tool_items_update" on public.content_tool_items
  for update using (exists (
    select 1 from public.topic_cluster_items i
    where i.id = content_tool_items.item_id and has_project_access(i.project_id)
  ));
drop policy if exists "content_tool_items_delete" on public.content_tool_items;
create policy "content_tool_items_delete" on public.content_tool_items
  for delete using (exists (
    select 1 from public.topic_cluster_items i
    where i.id = content_tool_items.item_id and has_project_access(i.project_id)
  ));

-- Backfill: every existing single link becomes a position-0 row here.
insert into public.content_tool_items (item_id, tool_id, position)
select id, tool_id, 0 from public.topic_cluster_items where tool_id is not null
on conflict (item_id, tool_id) do nothing;
