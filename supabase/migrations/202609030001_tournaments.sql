-- Shareable single-elimination tournaments with token-protected organizer controls.

create schema if not exists private;
create table private.draftix_tournament_create_limits (
  user_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index draftix_tournament_create_limits_idx on private.draftix_tournament_create_limits(user_id,created_at desc);
revoke all on table private.draftix_tournament_create_limits from public,anon,authenticated;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{4,63}$'),
  name text not null check (char_length(name) between 3 and 80),
  format text not null default 'single_elimination' check (format = 'single_elimination'),
  team_count integer not null check (team_count between 3 and 16),
  best_of integer not null default 3 check (best_of in (1, 3, 5)),
  status text not null default 'live' check (status in ('live', 'completed')),
  organizer_token_hash text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  seed integer not null,
  unique (tournament_id, seed)
);

create table public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 4),
  position integer not null check (position > 0),
  team_a_id uuid references public.tournament_teams(id) on delete set null,
  team_b_id uuid references public.tournament_teams(id) on delete set null,
  score_a integer check (score_a between 0 and 99),
  score_b integer check (score_b between 0 and 99),
  winner_team_id uuid references public.tournament_teams(id) on delete set null,
  next_match_id uuid references public.tournament_matches(id) on delete set null,
  next_slot text check (next_slot in ('A', 'B')),
  updated_at timestamptz not null default now(),
  unique (tournament_id, round_number, position)
);

create index tournament_matches_tournament_idx on public.tournament_matches(tournament_id, round_number, position);
alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_matches enable row level security;
-- No direct table policies are defined. Public reads go through the state RPC,
-- which deliberately excludes the organizer hash and owner identifier.
revoke all on table public.tournaments, public.tournament_teams, public.tournament_matches from anon, authenticated;

create or replace function public.draftix_tournament_token_valid(target public.tournaments, supplied text)
returns boolean language sql stable security definer set search_path=public,extensions,pg_temp as $$
  select supplied is not null and target.organizer_token_hash = encode(digest(supplied, 'sha256'), 'hex')
$$;

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
  if (select count(*) from private.draftix_tournament_create_limits where user_id=uid and created_at>clock_timestamp()-interval '30 minutes') >= 5 then
    raise exception 'Too many tournament attempts';
  end if;
  if char_length(clean_name) not between 3 and 80 then raise exception 'Tournament name must be 3 to 80 characters'; end if;
  if size not between 3 and 16 then raise exception 'Choose between 3 and 16 teams'; end if;
  if p_best_of not in (1,3,5) then raise exception 'Choose best of 1, 3, or 5'; end if;

  for seed_no in 1..size loop
    clean_team := trim(regexp_replace(coalesce(p_teams[seed_no],''), '\s+', ' ', 'g'));
    if char_length(clean_team) not between 1 and 40 then raise exception 'Every team needs a name of 40 characters or fewer'; end if;
    if exists(select 1 from unnest(p_teams[1:seed_no-1]) previous_name where lower(trim(previous_name))=lower(clean_team)) then
      raise exception 'Team names must be unique';
    end if;
  end loop;

  tournament_slug := trim(both '-' from regexp_replace(lower(clean_name), '[^a-z0-9]+', '-', 'g'));
  if char_length(tournament_slug) < 3 then tournament_slug := 'tournament'; end if;
  tournament_slug := left(tournament_slug,50) || '-' || lower(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  organizer_token := encode(gen_random_bytes(24), 'hex');

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
    for match_no in 1..(bracket_size / power(2,round_no)::integer) loop
      insert into public.tournament_matches(tournament_id,round_number,position)
      values(v_tournament_id,round_no,match_no);
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
    next_match_id=next_match.id,
    next_slot=case when current_match.position % 2 = 1 then 'A' else 'B' end
  from public.tournament_matches next_match
  where current_match.tournament_id=v_tournament_id
    and next_match.tournament_id=v_tournament_id
    and next_match.round_number=current_match.round_number+1
    and next_match.position=ceil(current_match.position/2.0)::integer;

  -- A missing seed is a bye. Advance the real team without requiring a score.
  update public.tournament_matches m set winner_team_id=coalesce(m.team_a_id,m.team_b_id),updated_at=now()
  where m.tournament_id=v_tournament_id and m.round_number=1
    and ((m.team_a_id is null) <> (m.team_b_id is null));
  update public.tournament_matches next_match set
    team_a_id=case when source.next_slot='A' then source.winner_team_id else next_match.team_a_id end,
    team_b_id=case when source.next_slot='B' then source.winner_team_id else next_match.team_b_id end,
    updated_at=now()
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

create or replace function public.draftix_set_match_result(p_slug text, p_token text, p_match_id uuid, p_score_a integer, p_score_b integer, p_winner_team_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare t public.tournaments; m public.tournament_matches; downstream public.tournament_matches;
begin
  select * into t from public.tournaments where slug=lower(trim(p_slug)) for update;
  if not found then raise exception 'Tournament not found'; end if;
  if not public.draftix_tournament_token_valid(t,p_token) then raise exception 'Organizer access required'; end if;
  select * into m from public.tournament_matches where id=p_match_id and tournament_id=t.id for update;
  if not found then raise exception 'Match not found'; end if;
  if m.team_a_id is null or m.team_b_id is null then raise exception 'This match is not ready'; end if;
  if p_winner_team_id not in (m.team_a_id,m.team_b_id) then raise exception 'Choose a team from this match'; end if;
  if p_score_a is null or p_score_b is null or p_score_a<0 or p_score_b<0 or p_score_a=p_score_b then raise exception 'Enter a valid non-tied score'; end if;
  if (p_winner_team_id=m.team_a_id and p_score_a<=p_score_b) or (p_winner_team_id=m.team_b_id and p_score_b<=p_score_a) then
    raise exception 'Winner must have the higher score';
  end if;

  if m.next_match_id is not null then
    select * into downstream from public.tournament_matches where id=m.next_match_id for update;
    if m.winner_team_id is distinct from p_winner_team_id and downstream.winner_team_id is not null then
      raise exception 'Clear the next match before changing this winner';
    end if;
    update public.tournament_matches set
      team_a_id=case when m.next_slot='A' then p_winner_team_id else team_a_id end,
      team_b_id=case when m.next_slot='B' then p_winner_team_id else team_b_id end,
      updated_at=now()
    where id=m.next_match_id;
  end if;

  update public.tournament_matches set score_a=p_score_a,score_b=p_score_b,winner_team_id=p_winner_team_id,updated_at=now() where id=m.id;
  update public.tournaments set status=case when m.next_match_id is null then 'completed' else 'live' end,updated_at=now() where id=t.id;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.draftix_clear_match_result(p_slug text, p_token text, p_match_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare t public.tournaments; m public.tournament_matches; downstream public.tournament_matches;
begin
  select * into t from public.tournaments where slug=lower(trim(p_slug)) for update;
  if not found then raise exception 'Tournament not found'; end if;
  if not public.draftix_tournament_token_valid(t,p_token) then raise exception 'Organizer access required'; end if;
  select * into m from public.tournament_matches where id=p_match_id and tournament_id=t.id for update;
  if not found or m.winner_team_id is null then return jsonb_build_object('ok',true); end if;
  if m.next_match_id is not null then
    select * into downstream from public.tournament_matches where id=m.next_match_id for update;
    if downstream.winner_team_id is not null then raise exception 'Clear the next match first'; end if;
    update public.tournament_matches set
      team_a_id=case when m.next_slot='A' then null else team_a_id end,
      team_b_id=case when m.next_slot='B' then null else team_b_id end,
      updated_at=now()
    where id=m.next_match_id;
  end if;
  update public.tournament_matches set score_a=null,score_b=null,winner_team_id=null,updated_at=now() where id=m.id;
  update public.tournaments set status='live',updated_at=now() where id=t.id;
  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.draftix_tournament_token_valid(public.tournaments,text) from public,anon,authenticated;
grant execute on function public.draftix_create_tournament(text,text[],integer) to authenticated;
grant execute on function public.draftix_tournament_state(text,text) to anon,authenticated;
grant execute on function public.draftix_set_match_result(text,text,uuid,integer,integer,uuid) to authenticated;
grant execute on function public.draftix_clear_match_result(text,text,uuid) to authenticated;
notify pgrst, 'reload schema';
