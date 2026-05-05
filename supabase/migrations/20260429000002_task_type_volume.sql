-- Adds task_type + est_volume to public.tasks so we can:
--   * display a clear "[New Post · 600/mo]" prefix on every content task
--   * filter the timeline / kanban by type (New vs Update vs Delete vs Modify)
--   * sort/prioritize by estimated keyword volume

alter table public.tasks
  add column if not exists task_type text
    check (
      task_type is null or task_type in (
        'New Post', 'New Page',
        'Update Post', 'Update Page',
        'Delete Post', 'Delete Page',
        'Modify Post', 'Modify Page'
      )
    ),
  add column if not exists est_volume int;

create index if not exists idx_tasks_task_type
  on public.tasks(project_id, task_type)
  where task_type is not null;

-- Reload PostgREST schema so the new columns are queryable immediately
notify pgrst, 'reload schema';
