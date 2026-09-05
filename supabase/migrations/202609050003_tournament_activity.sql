-- Persist the game or activity associated with a tournament.

alter table public.tournaments
  add column if not exists activity text not null default 'General'
  check (char_length(activity) between 2 and 60);

create or replace function public.draftix_create_tournament_with_activity(
  p_name text,
  p_teams text[],
  p_best_of integer default 3,
  p_format text default 'single_elimination',
  p_activity text default 'General'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  result jsonb;
  clean_activity text := left(trim(regexp_replace(coalesce(p_activity, ''), '\s+', ' ', 'g')), 60);
begin
  if char_length(clean_activity) < 2 then
    raise exception 'Choose a game or activity';
  end if;

  result := public.draftix_create_tournament(p_name, p_teams, p_best_of, p_format);

  update public.tournaments
  set activity = clean_activity,
      updated_at = now()
  where slug = result->>'slug'
    and owner_id = auth.uid();

  return result || jsonb_build_object('activity', clean_activity);
end $$;

grant execute on function public.draftix_create_tournament_with_activity(text, text[], integer, text, text) to authenticated;

alter function public.draftix_tournament_state(text, text)
  rename to draftix_tournament_state_base;

revoke all on function public.draftix_tournament_state_base(text, text) from public, anon, authenticated;

create function public.draftix_tournament_state(p_slug text, p_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  result jsonb;
  tournament_activity text;
begin
  result := public.draftix_tournament_state_base(p_slug, p_token);
  select activity into tournament_activity
  from public.tournaments
  where slug = lower(trim(p_slug));

  return result || jsonb_build_object('activity', coalesce(tournament_activity, 'General'));
end $$;

grant execute on function public.draftix_tournament_state(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
