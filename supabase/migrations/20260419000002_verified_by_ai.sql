-- SEO · we360.ai: Task verification tracking
-- Adds a flag so the Kanban card can show an "AI verified" check
-- when Phase 2 (task verification) auto-closes a task after confirming
-- the underlying SEO issue is actually resolved on the live page.

alter table public.tasks
  add column if not exists verified_by_ai boolean default false;

create index if not exists idx_tasks_verified_by_ai on public.tasks(verified_by_ai);
