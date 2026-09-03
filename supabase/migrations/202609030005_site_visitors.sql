-- ═══════════════════════════════════════════════════════════════════
-- 202609030005_site_visitors.sql
-- Site-wide live visitor counter ("N people viewing now").
--
-- Counts every visitor on ANY page of the site, not just players inside
-- draft rooms:
--   • draftix_visitors          one row per visitor session, keyed by the
--                               visitor's anonymous auth user id.
--   • draftix_visitor_heartbeat called by the site client every 30s from
--                               every page; upserts the visitor row.
--   • draftix_visitor_leave     called via a keepalive fetch on pagehide
--                               (tab close / navigate away) so the visitor
--                               is removed immediately. The 120s staleness
--                               window in draftix_presence is only a safety
--                               net for cases where pagehide never fires.
--   • draftix_presence()        liveUsers now = site visitors seen in the
--                               last 120 seconds. activeDrafts unchanged.
--
-- Why 120s: background tabs throttle setInterval to ~60s, so a 30s
-- heartbeat can be delayed. The pagehide keepalive handles instant
-- removal; the window just prevents lingering ghosts.
--
-- Idempotent: safe to re-run. Requires 202609020001_rate_limits.sql and
-- 202609030004_presence.sql (applied earlier).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Visitor table ────────────────────────────────────────────────
create table if not exists public.draftix_visitors (
  client_id uuid primary key references auth.users (id) on delete cascade,
  page text not null default '/',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.draftix_visitors enable row level security;

-- No table policies on purpose: visitors only touch their row through the
-- security-definer RPCs below, so anon cannot read the visitor list or
-- forge another visitor's row.

-- ── 2) Visitor heartbeat (authenticated anonymous users) ───────────
create or replace function public.draftix_visitor_heartbeat(p_page text)
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
  insert into public.draftix_visitors (client_id, page, last_seen_at)
  values (uid, left(coalesce(nullif(trim(p_page), ''), '/'), 200), now())
  on conflict (client_id) do update
    set page = excluded.page,
        last_seen_at = now();

  -- Opportunistic cleanup of ghosts (pagehide never fired, e.g. crash).
  if random() < 0.05 then
    delete from public.draftix_visitors
    where last_seen_at < now() - interval '1 hour';
  end if;

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.draftix_visitor_heartbeat(text) to authenticated;

-- ── 3) Visitor leave (tab closed / navigated away) ─────────────────
create or replace function public.draftix_visitor_leave()
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
  delete from public.draftix_visitors where client_id = uid;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.draftix_visitor_leave() to authenticated;

-- ── 4) Presence count: liveUsers = site visitors ───────────────────
create or replace function public.draftix_presence()
returns json
language sql
security definer
set search_path = public, pg_temp
as $$
  select json_build_object(
    'liveUsers', (
      select count(*)::int
      from public.draftix_visitors
      where last_seen_at > now() - interval '120 seconds'
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


-- ── 5) Rate limits for the new RPCs ────────────────────────────────
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
    when req_path = 'rpc/draftix_visitor_heartbeat' then
      max_requests := 30;
      window_length := interval '1 minute';
    when req_path = 'rpc/draftix_visitor_leave' then
      max_requests := 30;
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

  if random() < 0.02 then
    delete from private.draftix_api_rate_limits
    where request_at < clock_timestamp() - interval '1 day';
  end if;
end $$;

revoke all on function public.draftix_check_request() from public, anon, authenticated;
grant execute on function public.draftix_check_request() to anon, authenticated, authenticator;

alter role authenticator set pgrst.db_pre_request = 'public.draftix_check_request';
notify pgrst, 'reload config';
