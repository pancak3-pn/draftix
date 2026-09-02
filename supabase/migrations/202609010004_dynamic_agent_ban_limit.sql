alter table public.draft_rooms
  drop constraint if exists draft_rooms_agent_ban_count_check;

alter table public.draft_rooms
  add constraint draft_rooms_agent_ban_count_check
  check (agent_ban_count between 0 and 64 and agent_ban_count % 2 = 0);

create or replace function public.draftix_set_game_settings(p_code text,p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  r public.draft_rooms;
  playable_count integer;
  max_bans integer;
  requested_bans integer;
  safe_bans integer;
begin
  select * into r from public.draft_rooms where code=upper(trim(p_code)) for update;
  if not found then raise exception 'Session not found'; end if;
  if r.host_id<>uid then raise exception 'Host only'; end if;
  if r.phase<>'lobby' then raise exception 'Settings lock at draft start'; end if;

  playable_count:=coalesce(jsonb_array_length(r.catalog->'agents'),0);
  max_bans:=greatest(0,playable_count-(playable_count%2));
  requested_bans:=greatest(0,coalesce((p_settings->>'agentBanCount')::integer,6));
  safe_bans:=least(max_bans,requested_bans);
  safe_bans:=safe_bans-(safe_bans%2);

  update public.draft_rooms set
    draft_preset=case when p_settings->>'draftPreset' in ('competitive','quick','no-agents','custom') then p_settings->>'draftPreset' else 'custom' end,
    agent_ban_count=safe_bans,
    turn_timeout_ms=case when (p_settings->>'turnTimeoutMs')::integer in (15000,30000,45000,60000) then (p_settings->>'turnTimeoutMs')::integer else 30000 end,
    auto_ban_enabled=coalesce((p_settings->>'autoBanEnabled')::boolean,true),
    side_pick_enabled=coalesce((p_settings->>'sidePickEnabled')::boolean,true),
    updated_at=now(),
    expires_at=now()+interval '2 hours',
    version=version+1
  where id=r.id;

  return jsonb_build_object('ok',true,'code',r.code,'agentBanCount',safe_bans,'maxAgentBans',max_bans);
end $$;

grant execute on function public.draftix_set_game_settings(text,jsonb) to authenticated;
