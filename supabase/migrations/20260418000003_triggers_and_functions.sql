-- SEO · we360.ai: Triggers & Functions
-- Auto-create profile on signup, invite flow helpers, competition label derivation.

-- ============================================================
-- Auto-create profile on auth.users insert
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_name text;
  v_role text;
begin
  -- Name: from raw_user_meta_data.name (Supabase Auth signup form) OR from email local-part
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  -- Role: default 'member' unless email is the bootstrap super_admin
  v_role := case
    when new.email = 'sakshi@goodlives.in' then 'super_admin'
    else coalesce(new.raw_user_meta_data->>'role', 'member')
  end;

  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, v_name, v_role)
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Derive competition label from KD (Keyword Difficulty)
-- ============================================================
create or replace function public.competition_from_kd(p_kd int)
returns text as $$
begin
  if p_kd is null then return null; end if;
  if p_kd < 30 then return 'Low Competition';
  elsif p_kd <= 60 then return 'Medium Competition';
  else return 'High Competition';
  end if;
end;
$$ language plpgsql immutable;

-- Auto-fill competition on keyword insert/update if null
create or replace function public.fill_keyword_competition()
returns trigger as $$
begin
  if new.competition is null and new.kd is not null then
    new.competition := public.competition_from_kd(new.kd);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_keywords_auto_competition
  before insert or update on public.keywords
  for each row execute procedure public.fill_keyword_competition();

-- ============================================================
-- Word count auto-calc on article save
-- ============================================================
create or replace function public.update_article_word_count()
returns trigger as $$
begin
  if new.content is not null then
    new.word_count := array_length(regexp_split_to_array(trim(new.content), '\s+'), 1);
  else
    new.word_count := 0;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_articles_word_count
  before insert or update of content on public.articles
  for each row execute procedure public.update_article_word_count();

-- ============================================================
-- Prune old CWV snapshots (keep last 30 days per project+device)
-- ============================================================
create or replace function public.prune_cwv_snapshots()
returns void as $$
begin
  delete from public.cwv_snapshots
  where captured_at < now() - interval '30 days';
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Prune old pillar scores (keep last 90 days)
-- ============================================================
create or replace function public.prune_pillar_scores()
returns void as $$
begin
  delete from public.pillar_scores
  where captured_at < now() - interval '90 days';
end;
$$ language plpgsql security definer set search_path = public;
