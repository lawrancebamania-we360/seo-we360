-- AI Citation - per-run per-competitor hit. The project's own hit (mentioned /
-- cited / position) already lives on ai_citation_runs; this records the SAME for
-- each competitor named or cited in an answer, which is what powers the
-- persona / topic / model x competitor heatmaps (the Gumshoe-style report).
-- Only rows where a competitor was mentioned OR cited are stored; absence = 0,
-- and the denominator is the run count for that slice.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Reads degrade
-- gracefully before this is applied (heatmaps just show the project column).

create table if not exists public.ai_citation_competitor_hits (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_citation_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  competitor_id uuid references public.competitors(id) on delete set null,
  competitor_name text not null,
  mentioned boolean not null default false,
  cited boolean not null default false,
  position int,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_cit_comp_hits_run on public.ai_citation_competitor_hits(run_id);
create index if not exists idx_ai_cit_comp_hits_project on public.ai_citation_competitor_hits(project_id, created_at desc);

alter table public.ai_citation_competitor_hits enable row level security;

do $$
begin
  drop policy if exists ai_citation_competitor_hits_access on public.ai_citation_competitor_hits;
  create policy ai_citation_competitor_hits_access on public.ai_citation_competitor_hits
    for all using (public.has_project_access(project_id))
    with check (public.has_project_access(project_id));
end $$;
