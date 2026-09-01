alter table public.draft_rooms
  add column if not exists team_logos jsonb not null default '{"A":null,"B":null}'::jsonb;

create or replace function public.draftix_set_team_logos(p_code text,p_logos jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := auth.uid();
  r public.draft_rooms;
  logo_a text := nullif(p_logos->>'A','');
  logo_b text := nullif(p_logos->>'B','');
begin
  select * into r from public.draft_rooms where code=upper(trim(p_code)) for update;
  if not found then raise exception 'Session not found'; end if;
  if r.host_id<>uid then raise exception 'Host only'; end if;
  if r.phase<>'lobby' then raise exception 'Logos lock at draft start'; end if;
  if logo_a is not null and (length(logo_a)>100000 or logo_a !~ '^data:image/(webp|png|jpeg);base64,') then raise exception 'Invalid Squad A logo'; end if;
  if logo_b is not null and (length(logo_b)>100000 or logo_b !~ '^data:image/(webp|png|jpeg);base64,') then raise exception 'Invalid Squad B logo'; end if;
  update public.draft_rooms
  set team_logos=jsonb_build_object('A',logo_a,'B',logo_b),version=version+1
  where id=r.id;
  return jsonb_build_object('ok',true,'code',r.code);
end $$;

create or replace function public.draftix_team_logos(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := auth.uid();
  r public.draft_rooms;
begin
  select * into r from public.draft_rooms where code=upper(trim(p_code));
  if not found then raise exception 'Session not found'; end if;
  if not exists(select 1 from public.draft_players where room_id=r.id and user_id=uid) then raise exception 'Not a room member'; end if;
  return coalesce(r.team_logos,'{"A":null,"B":null}'::jsonb);
end $$;

grant execute on function public.draftix_set_team_logos(text,jsonb) to authenticated;
grant execute on function public.draftix_team_logos(text) to authenticated;
