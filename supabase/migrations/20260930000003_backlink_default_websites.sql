-- Backlinks (Ticket 16): seed the team's standing content-distribution
-- platform list as backlink_websites rows for every existing project, so the
-- list page shows all of them as rows from day one (each at 0 submissions
-- until real activity is logged), instead of the team having to paste them
-- in manually first.
--
-- domain uses lower(trim(name)) - the exact normalization hostFromUrl()
-- applies to a plain (non-URL) pasted value in lib/url.ts, so a future
-- submissions-paste or "+ Add platform" entry of e.g. "Substack" resolves to
-- this same row rather than creating a duplicate.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent -
-- the unique (project_id, domain) constraint + ON CONFLICT DO NOTHING means
-- re-running this is a no-op.

insert into public.backlink_websites (project_id, domain)
select p.id, lower(trim(platforms.name))
from public.projects p
cross join (values
  ('Substack'), ('Medium'), ('Quora'), ('G2'), ('Issuu'), ('WordPress.com'),
  ('Telegra.ph'), ('Scoop.it'), ('Blogger'), ('HackerNoon'), ('HubPages'),
  ('DEV.to'), ('APSense'), ('Write.as'), ('Hashnode'), ('IndiBlogHub'),
  ('Tumblr'), ('Weebly'), ('Vocal Media'), ('LiveJournal'), ('Indie Hackers'),
  ('GrowthHackers'), ('Ghost'), ('Hive.blog'), ('SooperArticles'),
  ('SelfGrowth'), ('Minds')
) as platforms(name)
on conflict (project_id, domain) do nothing;
