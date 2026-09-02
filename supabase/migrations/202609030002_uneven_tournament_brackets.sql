-- Upgrade existing tournament installs to support 3 through 16 teams with byes.

alter table public.tournaments drop constraint if exists tournaments_team_count_check;
alter table public.tournaments add constraint tournaments_team_count_check check (team_count between 3 and 16);

create or replace function public.draftix_create_tournament(p_name text, p_teams text[], p_best_of integer default 3)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  uid uuid := auth.uid();
  clean_name text := trim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
  size integer := coalesce(array_length(p_teams,1),0);
  bracket_size integer;
  v_tournament_id uuid;
  tournament_slug text;
  organizer_token text;
  rounds integer;
  round_no integer;
  match_no integer;
  seed_no integer;
  seed_order integer[];
  team_ids uuid[] := '{}';
  team_id uuid;
  clean_team text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tournament:' || uid::text,0));
  if (select count(*) from private.draftix_tournament_create_limits where user_id=uid and created_at>clock_timestamp()-interval '30 minutes') >= 5 then raise exception 'Too many tournament attempts'; end if;
  if char_length(clean_name) not between 3 and 80 then raise exception 'Tournament name must be 3 to 80 characters'; end if;
  if size not between 3 and 16 then raise exception 'Choose between 3 and 16 teams'; end if;
  if p_best_of not in (1,3,5) then raise exception 'Choose best of 1, 3, or 5'; end if;

  for seed_no in 1..size loop
    clean_team := trim(regexp_replace(coalesce(p_teams[seed_no],''), '\s+', ' ', 'g'));
    if char_length(clean_team) not between 1 and 40 then raise exception 'Every team needs a name of 40 characters or fewer'; end if;
    if exists(select 1 from unnest(p_teams[1:seed_no-1]) previous_name where lower(trim(previous_name))=lower(clean_team)) then raise exception 'Team names must be unique'; end if;
  end loop;

  tournament_slug := trim(both '-' from regexp_replace(lower(clean_name), '[^a-z0-9]+', '-', 'g'));
  if char_length(tournament_slug)<3 then tournament_slug := 'tournament'; end if;
  tournament_slug := left(tournament_slug,50)||'-'||lower(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  organizer_token := encode(gen_random_bytes(24),'hex');
  insert into private.draftix_tournament_create_limits(user_id) values(uid);
  insert into public.tournaments(slug,name,team_count,best_of,organizer_token_hash,owner_id)
    values(tournament_slug,clean_name,size,p_best_of,encode(digest(organizer_token,'sha256'),'hex'),uid)
    returning id into v_tournament_id;

  for seed_no in 1..size loop
    insert into public.tournament_teams(tournament_id,name,seed)
      values(v_tournament_id,trim(regexp_replace(p_teams[seed_no], '\s+', ' ', 'g')),seed_no)
      returning id into team_id;
    team_ids := array_append(team_ids,team_id);
  end loop;

  bracket_size := case when size<=4 then 4 when size<=8 then 8 else 16 end;
  rounds := case bracket_size when 4 then 2 when 8 then 3 else 4 end;
  for round_no in 1..rounds loop
    for match_no in 1..(bracket_size/power(2,round_no)::integer) loop
      insert into public.tournament_matches(tournament_id,round_number,position) values(v_tournament_id,round_no,match_no);
    end loop;
  end loop;

  seed_order := case bracket_size
    when 4 then array[1,4,2,3]
    when 8 then array[1,8,4,5,2,7,3,6]
    else array[1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11]
  end;
  for match_no in 1..(bracket_size/2) loop
    update public.tournament_matches set
      team_a_id=case when seed_order[(match_no*2)-1]<=size then team_ids[seed_order[(match_no*2)-1]] else null end,
      team_b_id=case when seed_order[match_no*2]<=size then team_ids[seed_order[match_no*2]] else null end
    where tournament_id=v_tournament_id and round_number=1 and position=match_no;
  end loop;

  update public.tournament_matches current_match set
    next_match_id=next_match.id,next_slot=case when current_match.position%2=1 then 'A' else 'B' end
  from public.tournament_matches next_match
  where current_match.tournament_id=v_tournament_id and next_match.tournament_id=v_tournament_id
    and next_match.round_number=current_match.round_number+1
    and next_match.position=ceil(current_match.position/2.0)::integer;

  update public.tournament_matches m set winner_team_id=coalesce(m.team_a_id,m.team_b_id),updated_at=now()
  where m.tournament_id=v_tournament_id and m.round_number=1 and ((m.team_a_id is null)<>(m.team_b_id is null));
  update public.tournament_matches next_match set
    team_a_id=case when source.next_slot='A' then source.winner_team_id else next_match.team_a_id end,
    team_b_id=case when source.next_slot='B' then source.winner_team_id else next_match.team_b_id end,updated_at=now()
  from public.tournament_matches source
  where source.tournament_id=v_tournament_id and source.round_number=1
    and source.winner_team_id is not null and source.next_match_id=next_match.id;

  return jsonb_build_object('ok',true,'slug',tournament_slug,'organizerToken',organizer_token);
end $$;

create or replace function public.draftix_tournament_state(p_slug text, p_token text default null)
returns jsonb language plpgsql stable security definer set search_path=public,extensions,pg_temp as $$
declare t public.tournaments;
begin
  select * into t from public.tournaments where slug=lower(trim(p_slug));
  if not found then raise exception 'Tournament not found'; end if;
  return jsonb_build_object(
    'id',t.id,'slug',t.slug,'name',t.name,'format',t.format,'teamCount',t.team_count,
    'bestOf',t.best_of,'status',t.status,'createdAt',t.created_at,
    'canManage',public.draftix_tournament_token_valid(t,p_token),
    'teams',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'seed',seed) order by seed),'[]'::jsonb) from public.tournament_teams where tournament_id=t.id),
    'matches',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'round',round_number,'position',position,'teamAId',team_a_id,'teamBId',team_b_id,'scoreA',score_a,'scoreB',score_b,'winnerTeamId',winner_team_id,'nextMatchId',next_match_id) order by round_number,position),'[]'::jsonb) from public.tournament_matches where tournament_id=t.id)
  );
end $$;

grant execute on function public.draftix_create_tournament(text,text[],integer) to authenticated;
grant execute on function public.draftix_tournament_state(text,text) to anon,authenticated;
notify pgrst, 'reload schema';
