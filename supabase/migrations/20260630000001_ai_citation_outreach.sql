-- AI Citation - Build 3: off-site outreach tracker.
-- The Source-Gap engine ranks the third-party domains AI cites for COMPETITORS
-- but not for us (computed live from ai_citation_sources, no storage). This table
-- persists the user's OUTREACH WORKFLOW against those targets: one tracker row per
-- (project, domain), with an action type + a todo/drafted/posted status + notes.
--
-- Same multi-tenant RLS as the rest of the AI-citation tables (has_project_access).
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Reads degrade
-- gracefully before this is applied (the outreach tracker shows an empty state).

create table if not exists public.ai_citation_outreach (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_domain text not null,                  -- the third-party domain to pitch
  source_url text,                              -- a representative cited page, if known
  action_type text not null default 'pitch'
    check (action_type in ('pitch','guest_post','get_listed','comment','other')),
  status text not null default 'todo'
    check (status in ('todo','drafted','posted')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One tracker row per (project, domain) - the action UI upserts on this.
create unique index if not exists ai_citation_outreach_uniq
  on public.ai_citation_outreach(project_id, source_domain);
create index if not exists idx_ai_cit_outreach_project
  on public.ai_citation_outreach(project_id, status);

alter table public.ai_citation_outreach enable row level security;
drop policy if exists ai_citation_outreach_access on public.ai_citation_outreach;
create policy ai_citation_outreach_access on public.ai_citation_outreach
  for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));
