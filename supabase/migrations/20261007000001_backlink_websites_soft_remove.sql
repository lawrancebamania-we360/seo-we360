-- Backlinks: let the team remove a website from the list without losing its
-- history. A removed website keeps its row (so every submission logged against
-- it, which cascade-deletes with the website, stays intact) and just gets a
-- removed_at timestamp. The list hides it, a "Removed websites" section shows
-- it with a Restore button, and pasting or adding the same domain again
-- restores it instead of tripping the unique (project_id, domain) constraint.
--
-- Additive only: one nullable column, one partial index. Safe to re-run.
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Until it is
-- applied the list keeps working exactly as before and Remove shows a notice.

alter table public.backlink_websites
  add column if not exists removed_at timestamptz;

create index if not exists idx_backlink_websites_live
  on public.backlink_websites(project_id)
  where removed_at is null;
