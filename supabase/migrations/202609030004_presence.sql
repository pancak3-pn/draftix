-- ═══════════════════════════════════════════════════════════════════
-- 202609030004_presence.sql
-- Landing-page "live now" counter for the Supabase backend.
--
-- This mirrors the Express `/api/presence` endpoint so the footer badge
-- keeps working when the site runs on Supabase instead of the Node server
-- (the footer polls `/api/presence` today, which does not exist there).
--
--   • draftix_presence()     anon-readable, security-definer count that
--                            returns { liveUsers, activeDrafts } exactly
--                            like the Node endpoint.
--   • draftix_heartbeat()    authenticated player RPC that keeps
--                            last_seen_at fresh while a room is open.
--
-- "Live" is a player in an active (non-expired) room whose last_seen_at
-- is within the last 5 minutes. The draft room client heartbeats every
-- 30s, so anyone who closes their tab drops off the counter within ~5
-- minutes — no disconnect hook needed (Supabase realtime has none).
--
-- Idempotent: safe to re-run. Requires the `private.draftix_api_rate_limits`
-- table from 202609020001_rate_limits.sql (applied earlier).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Public presence count ───────────────────────────────────────
create or replace function public.draftix_presence()
returns json
language sql
security definer
set search_path = public, pg_temp
as $$
  select json_build_object(
    'liveUsers', (
      select count(*)::int
      from public.draft_players p
      join public.draft_rooms r on r.id = p.room_id
      where p.connected = true
        and r.expires_at > now()
        and p.last_seen_at > now() - interval '5 minutes'
    ),
    'activeDrafts', (
      select count(*)::int
      from public.draft_rooms
      where expires_at > now()
    )
  );
$$;

grant execute on function public.draftix_presence() to anon;
grant execute on function public.draftix_presence() to authenticated;

-- ── 2) Player heartbeat ────────────────────────────────────────────
-- Called by the draft room client every 30s while a room is open so the
-- live counter only counts people who are actually there.
create or replace function public.draftix_heartbeat(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false);
  end if;
  update public.draft_players p
    set last_seen_at = now()
  from public.draft_rooms r
  where r.code = upper(trim(p_code))
    and r.id = p.room_id
    and p.user_id = uid;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.draftix_heartbeat(text) to authenticated;

-- ── 3) Rate limits for the new RPCs ────────────────────────────────
-- PostgREST applies this pre-request hook to every POST, including RPCs.
-- Without a matching case the request is allowed, so we re-create the
-- function with `rpc/draftix_presence` and `rpc/draftix_heartbeat` added.
create or replace function public.draftix_check_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req_method text := upper(coalesce(current_setting('request.method', true), ''));
  req_path text := lower(trim(both '/' from coalesce(current_setting('request.path', true), '')));
  req_headers jsonb;
  req_ip inet;
  max_requests integer;
  window_length interval;
  request_count integer;
begin
  if req_method not in ('POST', 'PUT', 'PATCH', 'DELETE') then
    return;
  end if;

  begin
    req_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    req_ip := split_part(coalesce(req_headers->>'x-forwarded-for', ''), ',', 1)::inet;
  exception when invalid_text_representation then
    return;
  end;

  if req_ip is null then
    return;
  end if;

  case
    when req_path = 'rpc/draftix_create_room' then
      max_requests := 6;
      window_length := interval '10 minutes';
    when req_path = 'rpc/draftix_join_room' then
      max_requests := 40;
      window_length := interval '5 minutes';
    when req_path = 'rpc/draftix_admin_stats' then
      max_requests := 12;
      window_length := interval '5 minutes';
    when req_path = 'rpc/draftix_presence' then
      max_requests := 240;
      window_length := interval '1 minute';
    when req_path = 'rpc/draftix_heartbeat' then
      max_requests := 120;
      window_length := interval '1 minute';
    when req_path = 'site_pageviews' then
      max_requests := 60;
      window_length := interval '1 minute';
    when req_path in (
      'rpc/draftix_action',
      'rpc/draftix_undo',
      'rpc/draftix_expire_turn',
      'rpc/draftix_leave_room',
      'rpc/draftix_set_team_logos',
      'rpc/draftix_set_game_settings'
    ) then
      max_requests := 120;
      window_length := interval '1 minute';
    else
      return;
  end case;

  -- Serialize checks for this IP/path pair so parallel requests cannot all
  -- pass between the count and insert.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(req_ip::text || ':' || req_path, 0)
  );

  select count(*)
  into request_count
  from private.draftix_api_rate_limits
  where ip = req_ip
    and request_path = req_path
    and request_at >= clock_timestamp() - window_length;

  if request_count >= max_requests then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object(
        'code', 'rate_limit_exceeded',
        'message', 'Too many requests. Try again shortly.',
        'details', null,
        'hint', null
      )::text,
      detail = jsonb_build_object(
        'status', 429,
        'headers', jsonb_build_object('Retry-After', greatest(1, extract(epoch from window_length)::integer)::text)
      )::text;
  end if;

  insert into private.draftix_api_rate_limits (ip, request_path, request_at)
  values (req_ip, req_path, clock_timestamp());

  -- Opportunistic cleanup keeps the private log bounded without requiring
  -- pg_cron. Only two percent of accepted requests perform the cleanup.
  if random() < 0.02 then
    delete from private.draftix_api_rate_limits
    where request_at < clock_timestamp() - interval '1 day';
  end if;
end $$;

revoke all on function public.draftix_check_request() from public, anon, authenticated;
grant execute on function public.draftix_check_request() to anon, authenticated, authenticator;

alter role authenticator set pgrst.db_pre_request = 'public.draftix_check_request';
notify pgrst, 'reload config';