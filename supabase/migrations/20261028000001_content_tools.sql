-- Calculator / Tool library for guides & blogs.
-- A reusable "tool" (usually an interactive calculator) is defined once and can
-- be linked to many planned posts. The spec fields (content/inputs/output/
-- formula) are free text; the real built widget is an uploaded HTML code bundle
-- (a .zip) kept in the private `content-tool-bundles` Storage bucket, downloaded
-- by whoever builds the live page. Additive + idempotent. Apply MANUALLY in Supabase.

create table if not exists public.content_tools (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  content text,                 -- copy shown inside the tool
  inputs text,                  -- free-text: the fields a visitor fills in
  output text,                  -- free-text: the result(s)
  formula text,                 -- free-text: how the output is computed
  bundle_path text,             -- object path inside the content-tool-bundles bucket
  bundle_name text,             -- original .zip filename, for display/download
  embed_url text,               -- optional: externally hosted calculator
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_tools_project on public.content_tools(project_id);

alter table public.content_tools enable row level security;

drop policy if exists "content_tools_select" on public.content_tools;
create policy "content_tools_select" on public.content_tools
  for select using (has_project_access(project_id));
drop policy if exists "content_tools_insert" on public.content_tools;
create policy "content_tools_insert" on public.content_tools
  for insert with check (has_project_access(project_id));
drop policy if exists "content_tools_update" on public.content_tools;
create policy "content_tools_update" on public.content_tools
  for update using (has_project_access(project_id));
drop policy if exists "content_tools_delete" on public.content_tools;
create policy "content_tools_delete" on public.content_tools
  for delete using (has_project_access(project_id));

-- One calculator per post (v1). A tool is still reused across many posts, since
-- many posts can point at the same content_tools row. Unlinking is a null here;
-- deleting the tool nulls this automatically (on delete set null).
alter table public.topic_cluster_items
  add column if not exists tool_id uuid references public.content_tools(id) on delete set null;
create index if not exists idx_cluster_items_tool
  on public.topic_cluster_items(tool_id) where tool_id is not null;

-- Private bucket for the HTML code bundles (.zip). Not public: downloaded via a
-- short-lived signed URL by signed-in team members only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-tool-bundles',
  'content-tool-bundles',
  false,
  10485760,  -- 10MB
  array['application/zip', 'application/x-zip-compressed', 'application/octet-stream', 'multipart/x-zip']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "content_tool_bundles_auth_read" on storage.objects;
create policy "content_tool_bundles_auth_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'content-tool-bundles');

drop policy if exists "content_tool_bundles_auth_upload" on storage.objects;
create policy "content_tool_bundles_auth_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'content-tool-bundles');

drop policy if exists "content_tool_bundles_auth_delete" on storage.objects;
create policy "content_tool_bundles_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'content-tool-bundles');
