-- Rebuild an existing tournament's match graph while preserving its URL,
-- organizer token, activity, and registry identity.

create or replace function public.draftix_update_tournament_format(
  p_slug text,
  p_token text,
  p_format text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target public.tournaments;
  generated public.tournaments;
  generated_result jsonb;
  entrant_names text[];
  requested_format text := lower(trim(coalesce(p_format, '')));
  prior_attempts timestamptz[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if requested_format not in ('single_elimination', 'double_elimination', 'round_robin', 'swiss') then
    raise exception 'Unknown tournament format';
  end if;

  select * into target
  from public.tournaments
  where slug = lower(trim(p_slug))
  for update;

  if not found then raise exception 'Tournament not found'; end if;
  if not public.draftix_tournament_token_valid(target, p_token) then raise exception 'Organizer access required'; end if;
  if target.format = requested_format then return jsonb_build_object('ok', true, 'format', target.format); end if;

  select array_agg(name order by seed) into entrant_names
  from public.tournament_teams
  where tournament_id = target.id;

  -- Reuse the canonical graph generator without treating an edit as a new
  -- tournament against the organizer's creation quota.
  select array_agg(created_at) into prior_attempts
  from private.draftix_tournament_create_limits
  where user_id = auth.uid();
  delete from private.draftix_tournament_create_limits where user_id = auth.uid();
  generated_result := public.draftix_create_tournament(target.name, entrant_names, target.best_of, requested_format);

  select * into generated
  from public.tournaments
  where slug = generated_result->>'slug'
  for update;

  if not found then raise exception 'Could not rebuild tournament format'; end if;

  delete from public.tournament_matches where tournament_id = target.id;
  delete from public.tournament_teams where tournament_id = target.id;

  update public.tournament_teams set tournament_id = target.id where tournament_id = generated.id;
  update public.tournament_matches set tournament_id = target.id where tournament_id = generated.id;

  update public.tournaments
  set format = generated.format,
      total_rounds = generated.total_rounds,
      status = 'live',
      updated_at = now()
  where id = target.id;

  delete from public.tournaments where id = generated.id;

  -- A format rebuild is not a new organizer-created tournament, so remove the
  -- temporary generator's rate-limit event from this same locked transaction.
  delete from private.draftix_tournament_create_limits where user_id = auth.uid();
  insert into private.draftix_tournament_create_limits(user_id, created_at)
  select auth.uid(), previous_time
  from unnest(coalesce(prior_attempts, array[]::timestamptz[])) previous_time;

  return jsonb_build_object('ok', true, 'slug', target.slug, 'format', requested_format);
end $$;

grant execute on function public.draftix_update_tournament_format(text, text, text) to authenticated;

notify pgrst, 'reload schema';
