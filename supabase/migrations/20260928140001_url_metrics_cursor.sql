-- Resumable-cursor columns for url_metrics_runs, needed to move the daily
-- GA4+GSC sync from a single unbounded GitHub Actions job to several
-- Vercel Cron invocations (each bounded by the 300s Hobby function limit).
--
-- run_date + url_list + next_index let a batch pick up exactly where the
-- previous one left off: the FIRST batch of a day builds url_list (the
-- deduped URL list for that day) and starts at next_index=0; every
-- subsequent batch that day reads the same row, resumes from next_index,
-- and updates it as it goes. next_index is a flat cursor into the virtual
-- (url x period) task array, so a batch can stop mid-URL without losing
-- the periods it already finished.

alter table public.url_metrics_runs
  add column if not exists run_date date not null default current_date,
  add column if not exists url_list jsonb,
  add column if not exists next_index int not null default 0;

-- One row per project per day — lets a batch find (or safely race-create)
-- "today's" run with a simple upsert-style lookup instead of date-math on
-- started_at every time.
create unique index if not exists url_metrics_runs_project_date_uq
  on public.url_metrics_runs (project_id, run_date);
