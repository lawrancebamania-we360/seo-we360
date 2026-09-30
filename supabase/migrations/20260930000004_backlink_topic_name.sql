-- Backlinks (Ticket 18): a free-text "Topic" per submission - separate from
-- blog_post_label/blog_post_url, which is specifically the verified-against-
-- sitemap post reference (Ticket 2). Topic is just whatever the team typed in
-- their sheet's Topic column, captured as-is with no matching/validation.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

alter table public.backlink_submissions add column if not exists topic_name text;
