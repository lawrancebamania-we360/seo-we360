-- The topic/keyword the brand most wants to get cited for. Pre-filled from the
-- project's tracked keywords, editable in the scope drawer; clusters the generated
-- discovery prompts around it.
alter table public.ai_visibility_scope add column if not exists target_keyword text;
