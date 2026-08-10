-- AI Citation - Bucket 2: off-site outreach DRAFTS.
-- Build 3 added the tracker (action_type + todo/drafted/posted). This adds the
-- generated draft itself, so a target goes from "tracked to-do" to ready-to-post
-- copy: a Reddit/Quora answer, or a pitch/listing email. Apply MANUALLY in
-- Supabase. Reads degrade gracefully before this applies (no draft shown).

alter table public.ai_citation_outreach add column if not exists draft text;
alter table public.ai_citation_outreach add column if not exists draft_subject text;
alter table public.ai_citation_outreach add column if not exists draft_kind text
  check (draft_kind is null or draft_kind in ('answer', 'email'));
alter table public.ai_citation_outreach add column if not exists drafted_at timestamptz;
