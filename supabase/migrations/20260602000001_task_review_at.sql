-- Add review_at timestamp to tasks so the Blog Sprint custom-range filter can
-- show tasks based on lifecycle activity (allocated / reviewed / published)
-- within the selected date range, not just scheduled_date.
--
-- Background: the existing filter only matched on scheduled_date, so picking
-- "May 1-31" showed tasks SCHEDULED in May regardless of whether work
-- actually happened in May. Users want to see tasks where any of these
-- activities happened in May: scheduled, moved to Done (review), or moved
-- to Published (done).
--
-- Mapping:
--   tasks.status='review' → kanban column "Done"      (writing complete)
--   tasks.status='done'   → kanban column "Published" (live on site)
--   tasks.completed_at    → already exists; stamps when status moves to 'done'
--   tasks.review_at       → NEW; stamps when status moves to 'review'
--
-- Backfill strategy: for existing rows in review/done states, we don't have
-- the actual transition timestamps, so we use updated_at as the best-known
-- proxy (the last time the row was touched, which for most published tasks
-- IS the publish event). For tasks in 'done', also backfill completed_at
-- where it's currently null (a few historical rows missed the stamp).

alter table public.tasks
  add column if not exists review_at timestamptz;

create index if not exists idx_tasks_review_at
  on public.tasks(project_id, review_at desc)
  where review_at is not null;

create index if not exists idx_tasks_completed_at
  on public.tasks(project_id, completed_at desc)
  where completed_at is not null;

-- Backfill review_at for tasks that ARE currently in review/done states.
-- Tasks in 'done' (Published) passed through 'review' (Done) on the way,
-- so they also need review_at populated.
update public.tasks
   set review_at = coalesce(completed_at, updated_at)
 where status in ('review', 'done')
   and review_at is null;

-- Backfill completed_at for tasks in 'done' status that somehow missed it
-- (historical rows from before the stamp was added to updateTaskStatus).
update public.tasks
   set completed_at = updated_at
 where status = 'done'
   and completed_at is null;
