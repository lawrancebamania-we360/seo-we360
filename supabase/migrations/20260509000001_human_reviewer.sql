-- Human reviewer sign-off on a task.
--
-- The AI verification gives you an automated quality pass; this is the
-- editor's sign-off after they've read the article themselves. Lokesh is
-- the primary reviewer at We360 but any admin can mark/unmark.

alter table public.tasks
  add column if not exists reviewed_by_id uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_tasks_reviewed_by on public.tasks(reviewed_by_id) where reviewed_by_id is not null;
