create or replace function public.draftix_undo(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid();
  r public.draft_rooms;
  snap jsonb;
  last_index integer;
begin
  select * into r from public.draft_rooms where code=upper(trim(p_code)) for update;
  if not found then raise exception 'Session not found'; end if;
  if r.host_id<>uid then raise exception 'Host only'; end if;
  last_index:=jsonb_array_length(r.undo_stack)-1;
  if last_index<0 or r.phase='lobby' then raise exception 'Nothing to undo'; end if;
  snap:=r.undo_stack->last_index;
  update public.draft_rooms set
    phase=snap->>'phase',
    map_bans=array(select jsonb_array_elements_text(coalesce(snap->'mapBans','[]'::jsonb))),
    agent_bans=array(select jsonb_array_elements_text(coalesce(snap->'agentBans','[]'::jsonb))),
    current_turn=nullif(snap->>'currentTurn',''),
    selected_map=case when snap->'selectedMap'='null'::jsonb then null else snap->'selectedMap' end,
    selected_side=nullif(snap->>'selectedSide',''),
    side_picker_team=nullif(snap->>'sidePickerTeam',''),
    turn_ends_at=case when snap->>'turnEndsAt' is null then null else (snap->>'turnEndsAt')::timestamptz end,
    undo_stack=undo_stack-last_index,
    version=version+1,updated_at=now(),expires_at=now()+interval '2 hours'
  where id=r.id;
  return jsonb_build_object('ok',true,'code',r.code);
end $$;

create or replace function public.draftix_expire_turn(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid();
  r public.draft_rooms;
  item jsonb;
  item_id text;
  remaining_count integer;
  selected jsonb;
  next_team text;
  snap jsonb;
begin
  select * into r from public.draft_rooms where code=upper(trim(p_code)) for update;
  if not found then raise exception 'Session not found'; end if;
  if not public.draftix_is_room_member(r.id) then raise exception 'Not a room member'; end if;
  if not r.auto_ban_enabled or r.phase not in ('map_ban','agent_ban') or r.turn_ends_at is null or r.turn_ends_at>now() then
    return jsonb_build_object('ok',true,'code',r.code,'expired',false);
  end if;
  snap:=jsonb_build_object('phase',r.phase,'mapBans',to_jsonb(r.map_bans),'agentBans',to_jsonb(r.agent_bans),'currentTurn',r.current_turn,'selectedMap',r.selected_map,'selectedSide',r.selected_side,'sidePickerTeam',r.side_picker_team,'turnEndsAt',r.turn_ends_at);
  if r.phase='map_ban' then
    select x into item from jsonb_array_elements(r.catalog->'maps') x where not (x->>'uuid'=any(r.map_bans)) order by random() limit 1;
    if item is null then return jsonb_build_object('ok',true,'expired',false); end if;
    item_id:=item->>'uuid'; r.map_bans:=array_append(r.map_bans,item_id);
    select count(*),(jsonb_agg(x)->0) into remaining_count,selected from jsonb_array_elements(r.catalog->'maps') x where not (x->>'uuid'=any(r.map_bans));
    if remaining_count=1 then
      next_team:=case when r.current_turn='A' then 'B' else 'A' end;
      update public.draft_rooms set map_bans=r.map_bans,selected_map=selected,side_picker_team=next_team,phase=case when side_pick_enabled then 'side_pick' when agent_ban_count>0 then 'agent_ban' else 'done' end,current_turn=next_team,turn_ends_at=case when not side_pick_enabled and agent_ban_count>0 then now()+make_interval(secs=>turn_timeout_ms/1000) else null end,undo_stack=undo_stack||jsonb_build_array(snap),version=version+1 where id=r.id;
    else
      update public.draft_rooms set map_bans=r.map_bans,current_turn=case when current_turn='A' then 'B' else 'A' end,turn_ends_at=now()+make_interval(secs=>turn_timeout_ms/1000),undo_stack=undo_stack||jsonb_build_array(snap),version=version+1 where id=r.id;
    end if;
  else
    select x into item from jsonb_array_elements(r.catalog->'agents') x where not (x->>'uuid'=any(r.agent_bans)) order by random() limit 1;
    if item is null then return jsonb_build_object('ok',true,'expired',false); end if;
    r.agent_bans:=array_append(r.agent_bans,item->>'uuid');
    update public.draft_rooms set agent_bans=r.agent_bans,phase=case when cardinality(r.agent_bans)>=agent_ban_count then 'done' else 'agent_ban' end,current_turn=case when current_turn='A' then 'B' else 'A' end,turn_ends_at=case when cardinality(r.agent_bans)<agent_ban_count then now()+make_interval(secs=>turn_timeout_ms/1000) else null end,undo_stack=undo_stack||jsonb_build_array(snap),version=version+1 where id=r.id;
  end if;
  update public.draft_rooms set updated_at=now(),expires_at=now()+interval '2 hours' where id=r.id;
  return jsonb_build_object('ok',true,'code',r.code,'expired',true);
end $$;

create or replace function public.draftix_leave_room(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid();
  r public.draft_rooms;
  next_host uuid;
begin
  select * into r from public.draft_rooms where code=upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok',true); end if;
  delete from public.draft_players where room_id=r.id and user_id=uid;
  select user_id into next_host from public.draft_players where room_id=r.id order by joined_at limit 1;
  if next_host is null then
    delete from public.draft_rooms where id=r.id;
  else
    update public.draft_rooms set host_id=case when host_id=uid then next_host else host_id end,captain_a=case when captain_a=uid then null else captain_a end,captain_b=case when captain_b=uid then null else captain_b end,version=version+1,updated_at=now() where id=r.id;
  end if;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.draftix_trim_chat()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from public.draft_messages where room_id=new.room_id and id in (
    select id from public.draft_messages where room_id=new.room_id order by created_at desc offset 50
  );
  return new;
end $$;

drop trigger if exists draftix_chat_retention on public.draft_messages;
create trigger draftix_chat_retention after insert on public.draft_messages for each row execute function public.draftix_trim_chat();

grant execute on function public.draftix_undo(text) to authenticated;
grant execute on function public.draftix_expire_turn(text) to authenticated;
grant execute on function public.draftix_leave_room(text) to authenticated;
