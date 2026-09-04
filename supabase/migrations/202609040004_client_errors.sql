-- ═══════════════════════════════════════════════════════════════════
-- 202609040004_client_errors.sql
-- Client error reporter: anonymous crash reports + token-gated admin feed.
--
--   • draftix_client_errors       one row per reported client crash.
--   • draftix_report_client_error anon-executable, validates + truncates
--                                 input, rate-limited through
--                                 draftix_check_request (10 reports per
--                                 10 minutes per IP). Also performs
--                                 opportunistic 30-day retention cleanup.
--   • draftix_admin_errors        gated by the shared draftix_admin_config
--                                 admin token; returns totals, a per-kind
--                                 breakdown, and the 50 latest entries.
--
-- Privacy: rows store the error message, stack, page path, user-agent
-- string and the anonymous dx_v visitor id — never an IP address (the
-- rate limiter's private IP records are covered by the existing
-- abuse-prevention retention). Disclosed in the privacy policy.
--
-- Idempotent: safe to re-run. Requires 202609020001_rate_limits.sql
-- (private.draftix_api_rate_limits) and supabase/analytics.sql
-- (public.draftix_admin_config) to be applied.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Client errors table ──────────────────────────────────────────
create table if not exists public.draftix_client_errors (
  id bigint generated always as identity primary key,
  kind text not null default 'window'
    check (kind in ('render', 'window', 'unhandledrejection')),
  message text not null check (char_length(message) between 2 and 1000),
  stack text check (stack is null or char_length(stack) <= 4000),
  page text not null default '/' check (char_length(page) <= 200),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  visitor text check (visitor is null or char_length(visitor) <= 64),
  created_at timestamptz not null default now()
);

create index if not exists draftix_client_errors_created_idx
  on public.draftix_client_errors (created_at desc);

alter table public.draftix_client_errors enable row level security;

-- No table policies: writes go through draftix_report_client_error,
-- reads through the token-gated draftix_admin_errors. Anon cannot read,
-- update, or delete rows directly.

-- ── 2) Public submission RPC ────────────────────────────────────────
create or replace function public.draftix_report_client_error(
  p_kind text,
  p_message text,
  p_stack text default null,
  p_page text default '/',
  p_user_agent text default null,
  p_visitor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text := lower(coalesce(trim(p_kind), 'window'));
  v_message text := left(coalesce(trim(p_message), ''), 1000);
  v_stack text := left(p_stack, 4000);
  v_page text := left(coalesce(nullif(trim(p_page), ''), '/'), 200);
  v_user_agent text := left(nullif(trim(p_user_agent), ''), 300);
  v_visitor text := left(nullif(trim(p_visitor), ''), 64);
begin
  if v_kind not in ('render', 'window', 'unhandledrejection') then
    v_kind := 'window';
  end if;
  if char_length(v_message) < 2 then
    v_message := 'Unknown error';
  end if;

  insert into public.draftix_client_errors (kind, message, stack, page, user_agent, visitor)
  values (v_kind, v_message, v_stack, v_page, v_user_agent, v_visitor);

  -- Opportunistic retention: error reports are diagnostics, not archives.
  if random() < 0.02 then
    delete from public.draftix_client_errors
    where created_at < now() - interval '30 days';
  end if;

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.draftix_report_client_error(text, text, text, text, text, text) to anon, authenticated;

-- ── 3) Token-gated admin feed ───────────────────────────────────────
create or replace function public.draftix_admin_errors(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored text;
begin
  select admin_token into v_stored from draftix_admin_config where id = 1;
  if v_stored is null or p_token is null or p_token <> v_stored then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return json_build_object(
    'total', (select count(*)::int from draftix_client_errors),
    'today', (select count(*)::int from draftix_client_errors where created_at >= current_date),
    'last7', (select count(*)::int from draftix_client_errors where created_at >= current_date - 6),
    'kinds', coalesce((
      select json_object_agg(k.kind, k.c)
      from (
        select kind, count(*)::int as c
        from draftix_client_errors
        group by kind
      ) k
    ), '{}'::json),
    'recent', coalesce((
      select json_agg(json_build_object(
        'id', e.id,
        'kind', e.kind,
        'message', e.message,
        'stack', e.stack,
        'page', e.page,
        'userAgent', e.user_agent,
        'visitor', e.visitor,
        'createdAt', e.created_at
      ) order by e.created_at desc)
      from (
        select id, kind, message, stack, page, user_agent, visitor, created_at
        from draftix_client_errors
        order by created_at desc
        limit 50
      ) e
    ), '[]'::json)
  );
end $$;

grant execute on function public.draftix_admin_errors(text) to anon;

-- ── 4) Rate limits for the new RPCs ────────────────────────────────
-- draftix_report_client_error: 10 per 10 minutes per IP — the client
-- already dedupes identical messages per page load, so this only stops
-- deliberate flooding.
-- draftix_admin_errors: 30 per 5 minutes per IP — matches the other
-- admin feeds; the dashboard auto-refreshes, keep it comfortable but
-- bounded.
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
    when req_path = 'rpc/draftix_admin_feedback' then
      max_requests := 30;
      window_length := interval '5 minutes';
    when req_path = 'rpc/draftix_admin_errors' then
      max_requests := 30;
      window_length := interval '5 minutes';
    when req_path = 'rpc/draftix_report_client_error' then
      max_requests := 10;
      window_length := interval '10 minutes';
    when req_path = 'rpc/draftix_submit_feedback' then
      max_requests := 5;
      window_length := interval '10 minutes';
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
