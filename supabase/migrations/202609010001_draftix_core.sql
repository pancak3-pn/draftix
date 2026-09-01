create extension if not exists pgcrypto;

create table public.draft_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  phase text not null default 'lobby' check (phase in ('lobby','map_ban','side_pick','agent_ban','done')),
  team_a_name text not null default 'Team A',
  team_b_name text not null default 'Team B',
  captain_a uuid references auth.users(id) on delete set null,
  captain_b uuid references auth.users(id) on delete set null,
  current_turn text check (current_turn in ('A','B')),
  first_banner text check (first_banner in ('A','B')),
  side_picker_team text check (side_picker_team in ('A','B')),
  selected_map jsonb,
  selected_side text check (selected_side in ('attack','defense')),
  map_bans text[] not null default '{}',
  agent_bans text[] not null default '{}',
  draft_preset text not null default 'competitive',
  agent_ban_count integer not null default 6 check (agent_ban_count between 0 and 12 and agent_ban_count % 2 = 0),
  turn_timeout_ms integer not null default 30000 check (turn_timeout_ms in (15000,30000,45000,60000)),
  auto_ban_enabled boolean not null default true,
  side_pick_enabled boolean not null default true,
  turn_ends_at timestamptz,
  catalog jsonb not null,
  undo_stack jsonb not null default '[]'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

create table public.draft_players (
  room_id uuid not null references public.draft_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  team text check (team in ('A','B')),
  connected boolean not null default true,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id,user_id)
);

create table public.draft_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.draft_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  team text check (team in ('A','B')),
  is_captain boolean not null default false,
  is_host boolean not null default false,
  body text not null check (char_length(body) between 1 and 240),
  created_at timestamptz not null default now()
);

create index draft_players_room_idx on public.draft_players(room_id);
create index draft_messages_room_created_idx on public.draft_messages(room_id,created_at desc);
create index draft_rooms_expires_idx on public.draft_rooms(expires_at);

alter table public.draft_rooms enable row level security;
alter table public.draft_players enable row level security;
alter table public.draft_messages enable row level security;

alter table public.draft_rooms replica identity full;
alter table public.draft_players replica identity full;
alter table public.draft_messages replica identity full;

create or replace function public.draftix_is_room_member(target_room uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.draft_players where room_id=target_room and user_id=auth.uid())
$$;

create policy "room members read rooms" on public.draft_rooms for select to authenticated
using (public.draftix_is_room_member(id));

create policy "room members read players" on public.draft_players for select to authenticated
using (public.draftix_is_room_member(room_id));

create policy "room members read messages" on public.draft_messages for select to authenticated
using (public.draftix_is_room_member(room_id));

alter publication supabase_realtime add table public.draft_rooms;
alter publication supabase_realtime add table public.draft_players;
alter publication supabase_realtime add table public.draft_messages;

create or replace function public.draftix_clean_text(value text, max_length integer)
returns text language sql immutable set search_path=public,pg_temp as $$
  select left(trim(regexp_replace(coalesce(value,''),'[[:cntrl:]]','','g')),max_length)
$$;

create or replace function public.draftix_create_room(p_nickname text,p_catalog jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := auth.uid();
  room_id uuid;
  room_code text;
  clean_name text := public.draftix_clean_text(p_nickname,24);
  tries integer := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if clean_name='' then clean_name := 'Host'; end if;
  if jsonb_array_length(coalesce(p_catalog->'maps','[]'::jsonb)) < 2 then raise exception 'Map catalog unavailable'; end if;
  if jsonb_array_length(coalesce(p_catalog->'agents','[]'::jsonb)) < 2 then raise exception 'Agent catalog unavailable'; end if;
  loop
    tries := tries + 1;
    room_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    begin
      insert into public.draft_rooms(code,host_id,catalog) values(room_code,uid,p_catalog) returning id into room_id;
      exit;
    exception when unique_violation then
      if tries >= 20 then raise exception 'Could not allocate room code'; end if;
    end;
  end loop;
  insert into public.draft_players(room_id,user_id,nickname) values(room_id,uid,clean_name);
  return jsonb_build_object('ok',true,'code',room_code);
end $$;

create or replace function public.draftix_join_room(p_code text,p_nickname text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := auth.uid();
  r public.draft_rooms;
  clean_name text := public.draftix_clean_text(p_nickname,24);
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into r from public.draft_rooms where code=upper(trim(p_code)) and expires_at>now();
  if not found then raise exception 'Session not found'; end if;
  if clean_name='' then clean_name := 'Player'; end if;
  insert into public.draft_players(room_id,user_id,nickname,connected,last_seen_at)
  values(r.id,uid,clean_name,true,now())
  on conflict(room_id,user_id) do update set nickname=excluded.nickname,connected=true,last_seen_at=now();
  update public.draft_rooms set updated_at=now(),expires_at=now()+interval '2 hours' where id=r.id;
  return jsonb_build_object('ok',true,'code',r.code);
end $$;

create or replace function public.draftix_room_state(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := auth.uid();
  r public.draft_rooms;
  me public.draft_players;
  players jsonb;
  chat jsonb;
  my_team text;
begin
  select * into r from public.draft_rooms where code=upper(trim(p_code));
  if not found then raise exception 'Session not found'; end if;
  select * into me from public.draft_players where room_id=r.id and user_id=uid;
  if not found then raise exception 'Not a room member'; end if;
  my_team := case when r.captain_a=uid then 'A' when r.captain_b=uid then 'B' else me.team end;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'nickname',p.nickname,'team',case when r.captain_a=p.user_id then 'A' when r.captain_b=p.user_id then 'B' else p.team end,'isCaptain',p.user_id in (r.captain_a,r.captain_b)) order by p.joined_at),'[]'::jsonb)
  into players from public.draft_players p where p.room_id=r.id;
  select coalesce(jsonb_agg(x.item order by x.id),'[]'::jsonb) into chat from (
    select m.id,jsonb_build_object('id',m.id,'ts',extract(epoch from m.created_at)*1000,'fromId',m.user_id,'fromName',m.nickname,'team',m.team,'isCap',m.is_captain,'isHost',m.is_host,'text',m.body) item
    from public.draft_messages m where m.room_id=r.id order by m.created_at desc limit 50
  ) x;
  return jsonb_build_object(
    '_roomId',r.id,'code',r.code,'phase',r.phase,'mapBans',to_jsonb(r.map_bans),'agentBans',to_jsonb(r.agent_bans),
    'currentTurn',r.current_turn,'firstBanner',r.first_banner,'selectedMap',r.selected_map,'selectedSide',r.selected_side,'sidePickerTeam',r.side_picker_team,
    'hostId',r.host_id,'teamNames',jsonb_build_object('A',r.team_a_name,'B',r.team_b_name),
    'settings',jsonb_build_object('draftPreset',r.draft_preset,'agentBanCount',r.agent_ban_count,'turnTimeoutMs',r.turn_timeout_ms,'autoBanEnabled',r.auto_ban_enabled,'sidePickEnabled',r.side_pick_enabled),
    'captainNames',jsonb_build_object('A',(select nickname from public.draft_players where room_id=r.id and user_id=r.captain_a),'B',(select nickname from public.draft_players where room_id=r.id and user_id=r.captain_b)),
    'teamRosters',jsonb_build_object(
      'A',coalesce((select jsonb_agg(jsonb_build_object('id',e->>'id','nickname',e->>'nickname','isCaptain',(e->>'isCaptain')::boolean)) from jsonb_array_elements(players) e where e->>'team'='A'),'[]'::jsonb),
      'B',coalesce((select jsonb_agg(jsonb_build_object('id',e->>'id','nickname',e->>'nickname','isCaptain',(e->>'isCaptain')::boolean)) from jsonb_array_elements(players) e where e->>'team'='B'),'[]'::jsonb),
      'spectators',coalesce((select jsonb_agg(jsonb_build_object('id',e->>'id','nickname',e->>'nickname','isCaptain',false)) from jsonb_array_elements(players) e where e->>'team' is null),'[]'::jsonb)
    ),
    'me',jsonb_build_object('id',uid,'isHost',r.host_id=uid,'myTeam',my_team,'isCaptain',uid in (r.captain_a,r.captain_b)),
    'turnEndsAt',case when r.turn_ends_at is null then null else extract(epoch from r.turn_ends_at)*1000 end,
    'serverNow',extract(epoch from now())*1000,'turnTimeoutMs',r.turn_timeout_ms,'chat',chat,
    'ops',jsonb_build_object('canUndo',r.host_id=uid and jsonb_array_length(r.undo_stack)>0 and r.phase<>'lobby','canRematch',r.host_id=uid and r.phase='done' and r.captain_a is not null and r.captain_b is not null,'canResetToLobby',r.host_id=uid and r.phase<>'lobby','undoCount',jsonb_array_length(r.undo_stack)),
    'catalog',r.catalog,'version',r.version
  );
end $$;

create or replace function public.draftix_action(p_code text,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := auth.uid();
  r public.draft_rooms;
  me public.draft_players;
  side text;
  item_id text;
  clean_a text;
  clean_b text;
  ban_count integer;
  remaining_count integer;
  selected jsonb;
  snapshot jsonb;
begin
  select * into r from public.draft_rooms where code=upper(trim(p_code)) for update;
  if not found then raise exception 'Session not found'; end if;
  select * into me from public.draft_players where room_id=r.id and user_id=uid;
  if not found then raise exception 'Not a room member'; end if;

  if p_action='claimCaptain' then
    if r.phase<>'lobby' then raise exception 'Invalid phase'; end if;
    side := p_payload->>'team';
    if side='A' then
      if r.captain_a is not null and r.captain_a<>uid then raise exception 'Team A captain taken'; end if;
      update public.draft_rooms set captain_a=uid,captain_b=case when captain_b=uid then null else captain_b end,version=version+1 where id=r.id;
    elsif side='B' then
      if r.captain_b is not null and r.captain_b<>uid then raise exception 'Team B captain taken'; end if;
      update public.draft_rooms set captain_b=uid,captain_a=case when captain_a=uid then null else captain_a end,version=version+1 where id=r.id;
    else raise exception 'Pick team A or B'; end if;
    update public.draft_players set team=side,last_seen_at=now() where room_id=r.id and user_id=uid;

  elsif p_action='setTeam' then
    if r.phase<>'lobby' then raise exception 'Cannot change team now'; end if;
    if uid in (r.captain_a,r.captain_b) then raise exception 'Captains stay on their team'; end if;
    side := p_payload->>'team';
    if side not in ('A','B') then side:=null; end if;
    update public.draft_players set team=side,last_seen_at=now() where room_id=r.id and user_id=uid;
    update public.draft_rooms set version=version+1 where id=r.id;

  elsif p_action='setTeamNames' then
    if r.host_id<>uid then raise exception 'Host only'; end if;
    if r.phase<>'lobby' then raise exception 'Names lock at draft start'; end if;
    clean_a:=public.draftix_clean_text(p_payload->>'A',24); clean_b:=public.draftix_clean_text(p_payload->>'B',24);
    update public.draft_rooms set team_a_name=coalesce(nullif(clean_a,''),'Team A'),team_b_name=coalesce(nullif(clean_b,''),'Team B'),version=version+1 where id=r.id;

  elsif p_action='setGameSettings' then
    if r.host_id<>uid then raise exception 'Host only'; end if;
    if r.phase<>'lobby' then raise exception 'Settings lock at draft start'; end if;
    ban_count:=least(12,greatest(0,coalesce((p_payload->>'agentBanCount')::integer,6))); ban_count:=ban_count-(ban_count%2);
    update public.draft_rooms set
      draft_preset=case when p_payload->>'draftPreset' in ('competitive','quick','no-agents','custom') then p_payload->>'draftPreset' else 'custom' end,
      agent_ban_count=ban_count,
      turn_timeout_ms=case when (p_payload->>'turnTimeoutMs')::integer in (15000,30000,45000,60000) then (p_payload->>'turnTimeoutMs')::integer else 30000 end,
      auto_ban_enabled=coalesce((p_payload->>'autoBanEnabled')::boolean,true),side_pick_enabled=coalesce((p_payload->>'sidePickEnabled')::boolean,true),version=version+1 where id=r.id;

  elsif p_action='startDraft' then
    if r.host_id<>uid then raise exception 'Only host can start'; end if;
    if r.captain_a is null or r.captain_b is null then raise exception 'Need both captains'; end if;
    side:=case when random()<.5 then 'A' else 'B' end;
    update public.draft_rooms set phase='map_ban',map_bans='{}',agent_bans='{}',selected_map=null,selected_side=null,side_picker_team=null,current_turn=side,first_banner=side,undo_stack='[]',turn_ends_at=case when auto_ban_enabled then now()+make_interval(secs=>turn_timeout_ms/1000) else null end,version=version+1 where id=r.id;

  elsif p_action in ('banMap','banAgent') then
    if (r.current_turn='A' and r.captain_a<>uid) or (r.current_turn='B' and r.captain_b<>uid) then raise exception 'Not your turn'; end if;
    item_id:=p_payload->>'uuid';
    snapshot:=jsonb_build_object('phase',r.phase,'mapBans',to_jsonb(r.map_bans),'agentBans',to_jsonb(r.agent_bans),'currentTurn',r.current_turn,'selectedMap',r.selected_map,'selectedSide',r.selected_side,'sidePickerTeam',r.side_picker_team,'turnEndsAt',r.turn_ends_at);
    if p_action='banMap' then
      if r.phase<>'map_ban' then raise exception 'Wrong phase'; end if;
      if item_id=any(r.map_bans) or not exists(select 1 from jsonb_array_elements(r.catalog->'maps') x where x->>'uuid'=item_id) then raise exception 'Bad map'; end if;
      r.map_bans:=array_append(r.map_bans,item_id);
      select count(*),(jsonb_agg(x)->0) into remaining_count,selected from jsonb_array_elements(r.catalog->'maps') x where not (x->>'uuid'=any(r.map_bans));
      if remaining_count=1 then
        side:=case when r.current_turn='A' then 'B' else 'A' end;
        update public.draft_rooms set map_bans=r.map_bans,selected_map=selected,side_picker_team=side,phase=case when side_pick_enabled then 'side_pick' when agent_ban_count>0 then 'agent_ban' else 'done' end,current_turn=side,turn_ends_at=case when not side_pick_enabled and agent_ban_count>0 and auto_ban_enabled then now()+make_interval(secs=>turn_timeout_ms/1000) else null end,undo_stack=undo_stack||jsonb_build_array(snapshot),version=version+1 where id=r.id;
      else
        update public.draft_rooms set map_bans=r.map_bans,current_turn=case when current_turn='A' then 'B' else 'A' end,turn_ends_at=case when auto_ban_enabled then now()+make_interval(secs=>turn_timeout_ms/1000) else null end,undo_stack=undo_stack||jsonb_build_array(snapshot),version=version+1 where id=r.id;
      end if;
    else
      if r.phase<>'agent_ban' then raise exception 'Wrong phase'; end if;
      if item_id=any(r.agent_bans) or not exists(select 1 from jsonb_array_elements(r.catalog->'agents') x where x->>'uuid'=item_id) then raise exception 'Bad agent'; end if;
      r.agent_bans:=array_append(r.agent_bans,item_id);
      update public.draft_rooms set agent_bans=r.agent_bans,phase=case when cardinality(r.agent_bans)>=agent_ban_count then 'done' else 'agent_ban' end,current_turn=case when current_turn='A' then 'B' else 'A' end,turn_ends_at=case when cardinality(r.agent_bans)<agent_ban_count and auto_ban_enabled then now()+make_interval(secs=>turn_timeout_ms/1000) else null end,undo_stack=undo_stack||jsonb_build_array(snapshot),version=version+1 where id=r.id;
    end if;

  elsif p_action='pickSide' then
    if r.phase<>'side_pick' then raise exception 'Wrong phase'; end if;
    if (r.side_picker_team='A' and r.captain_a<>uid) or (r.side_picker_team='B' and r.captain_b<>uid) then raise exception 'Not your pick'; end if;
    side:=p_payload->>'side'; if side not in ('attack','defense') then raise exception 'Pick attack or defense'; end if;
    update public.draft_rooms set selected_side=side,phase=case when agent_ban_count>0 then 'agent_ban' else 'done' end,current_turn=side_picker_team,turn_ends_at=case when agent_ban_count>0 and auto_ban_enabled then now()+make_interval(secs=>turn_timeout_ms/1000) else null end,version=version+1 where id=r.id;

  elsif p_action='chatMessage' then
    clean_a:=public.draftix_clean_text(p_payload->>'text',240); if clean_a='' then raise exception 'Empty message'; end if;
    insert into public.draft_messages(room_id,user_id,nickname,team,is_captain,is_host,body) values(r.id,uid,me.nickname,case when r.captain_a=uid then 'A' when r.captain_b=uid then 'B' else me.team end,uid in (r.captain_a,r.captain_b),r.host_id=uid,clean_a);

  elsif p_action='resetDraftToLobby' then
    if r.host_id<>uid then raise exception 'Host only'; end if;
    update public.draft_rooms set phase='lobby',map_bans='{}',agent_bans='{}',selected_map=null,selected_side=null,side_picker_team=null,current_turn=null,first_banner=null,turn_ends_at=null,undo_stack='[]',version=version+1 where id=r.id;

  elsif p_action='rematchDraft' then
    if r.host_id<>uid or r.phase<>'done' then raise exception 'Host only'; end if;
    side:=case when random()<.5 then 'A' else 'B' end;
    update public.draft_rooms set phase='map_ban',map_bans='{}',agent_bans='{}',selected_map=null,selected_side=null,side_picker_team=null,current_turn=side,first_banner=side,turn_ends_at=case when auto_ban_enabled then now()+make_interval(secs=>turn_timeout_ms/1000) else null end,undo_stack='[]',version=version+1 where id=r.id;

  elsif p_action='leaveSession' then
    delete from public.draft_players where room_id=r.id and user_id=uid;
    update public.draft_rooms set captain_a=case when captain_a=uid then null else captain_a end,captain_b=case when captain_b=uid then null else captain_b end,host_id=case when host_id=uid then coalesce((select user_id from public.draft_players where room_id=r.id order by joined_at limit 1),host_id) else host_id end,version=version+1 where id=r.id;
  else raise exception 'Unknown action'; end if;

  update public.draft_rooms set updated_at=now(),expires_at=now()+interval '2 hours' where id=r.id;
  return jsonb_build_object('ok',true,'code',r.code);
end $$;

grant execute on function public.draftix_create_room(text,jsonb) to authenticated;
grant execute on function public.draftix_join_room(text,text) to authenticated;
grant execute on function public.draftix_room_state(text) to authenticated;
grant execute on function public.draftix_action(text,text,jsonb) to authenticated;
grant execute on function public.draftix_is_room_member(uuid) to authenticated;
