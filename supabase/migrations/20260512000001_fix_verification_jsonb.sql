-- Fix: enqueue_task_verification was declared with v_supporting_links as
-- text[], but tasks.supporting_links is jsonb (added in 20260419000007).
-- Result: every call to the RPC failed with `malformed array literal "[]"`,
-- updateTaskStatus caught the error and continued, and the AI verification
-- panel hid itself because ai_verification_status stayed null. The feature
-- never produced a single row in task_verifications.
--
-- This rewrites the function to read supporting_links as jsonb and unnest
-- it via jsonb_array_elements_text. Behaviour is otherwise identical.

create or replace function public.enqueue_task_verification(
  p_task_id uuid,
  p_trigger_status text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_supporting_links jsonb;
  v_published_url text;
  v_doc_url text;
  v_source_type text;
  v_status ai_verification_status := 'queued';
  v_prev_score int;
begin
  if p_trigger_status not in ('review', 'done') then
    return null;
  end if;

  -- Pull the current supporting_links + published_url from the task.
  select supporting_links, published_url
  into v_supporting_links, v_published_url
  from public.tasks
  where id = p_task_id;

  if p_trigger_status = 'done' then
    v_source_type := 'live_url';
    v_doc_url := v_published_url;
    -- Done tasks may still want a doc fallback if the published_url is null
    -- (e.g. task got marked done before the URL was filled in). Look in
    -- supporting_links the same way the 'review' branch does.
    if v_doc_url is null and v_supporting_links is not null then
      select link into v_doc_url
      from jsonb_array_elements_text(v_supporting_links) link
      where link ilike '%docs.google.com%'
      limit 1;
      if v_doc_url is not null then
        v_source_type := 'google_doc';
      end if;
    end if;
  else
    -- Find the first Google Doc URL in supporting_links.
    v_source_type := 'google_doc';
    select link into v_doc_url
    from jsonb_array_elements_text(coalesce(v_supporting_links, '[]'::jsonb)) link
    where link ilike '%docs.google.com%'
    limit 1;
  end if;

  if v_doc_url is null then
    v_status := 'doc_missing';
  end if;

  -- Look up the previous score so the delta can render even if this row
  -- ends up doc_missing.
  select overall_score into v_prev_score
  from public.task_verifications
  where task_id = p_task_id and overall_score is not null
  order by completed_at desc nulls last
  limit 1;

  insert into public.task_verifications (
    task_id, status, trigger_status, source_type, source_url, prev_score
  ) values (
    p_task_id, v_status, p_trigger_status, v_source_type, v_doc_url, v_prev_score
  )
  returning id into v_id;

  -- Mirror the latest status onto the task row for fast UI reads.
  update public.tasks
  set
    ai_verification_status = v_status,
    ai_verification_id = v_id,
    ai_verification_summary = case
      when v_status = 'doc_missing' then 'Doc link missing — paste a Google Doc URL into Supporting links'
      else 'AI review queued — checks at next 10am IST window'
    end
  where id = p_task_id;

  return v_id;
end;
$$;

-- Reload PostgREST schema so the new signature is callable immediately
notify pgrst, 'reload schema';
