-- ═══════════════════════════════════════════════════════════════════
-- 202609030006_feedback.sql
-- User feedback: public submission RPC + token-gated admin feed.
--
--   • draftix_feedback          one row per submitted feedback.
--   • draftix_submit_feedback   anon-executable, validates rating/message,
--                               rate-limited through draftix_check_request
--                               (5 submissions per 10 minutes per IP) so
--                               the endpoint cannot be spammed.
--   • draftix_admin_feedback    gated by the shared draftix_admin_config
--                               admin token; returns totals, rating
--                               distribution, and the 50 latest entries.
--
-- Idempotent: safe to re-run. Requires 202609020001_rate_limits.sql
-- (private.draftix_api_rate_limits) and supabase/analytics.sql
-- (public.draftix_admin_config) to be applied.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Feedback table ───────────────────────────────────────────────
create table if not exists public.draftix_feedback (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  message text not null check (char_length(message) between 3 and 600),
  page text not null default '/' check (char_length(page) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists draftix_feedback_created_idx
  on public.draftix_feedback (created_at desc);

alter table public.draftix_feedback enable row level security;

-- No table policies: writes go through draftix_submit_feedback, reads
-- through the token-gated draftix_admin_feedback. Anon cannot read,
-- update, or delete rows directly.

-- ── 2) Public submission RPC ────────────────────────────────────────
create or replace function public.draftix_submit_feedback(
  p_rating integer,
  p_message text,
  p_page text default '/'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message text := left(coalesce(trim(p_message), ''), 600);
  v_page text := left(coalesce(nullif(trim(p_page), ''), '/'), 200);
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Invalid rating' using errcode = '22023';
  end if;
  if char_length(v_message) < 3 then
    raise exception 'Message too short' using errcode = '22023';
  end if;

  insert into public.draftix_feedback (user_id, rating, message, page)
  values (auth.uid(), p_rating::smallint, v_message, v_page);

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.draftix_submit_feedback(integer, text, text) to anon, authenticated;

-- ── 3) Token-gated admin feed ───────────────────────────────────────
create or replace function public.draftix_admin_feedback(p_token text)
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
    'total', (select count(*)::int from draftix_feedback),
    'today', (select count(*)::int from draftix_feedback where created_at >= current_date),
    'last7', (select count(*)::int from draftix_feedback where created_at >= current_date - 6),
    'average', (
      select round(avg(rating)::numeric, 2)::float8
      from draftix_feedback
    ),
    'distribution', coalesce((
      select json_object_agg(r.cnt, r.c)
      from (
        select rating as cnt, count(*)::int as c
        from draftix_feedback
        group by rating
      ) r
    ), '{}'::json),
    'recent', coalesce((
      select json_agg(json_build_object(
        'id', f.id,
        'rating', f.rating,
        'message', f.message,
        'page', f.page,
        'createdAt', f.created_at
      ) order by f.created_at desc)
      from (
        select id, rating, message, page, created_at
        from draftix_feedback
        order by created_at desc
        limit 50
      ) f
    ), '[]'::json)
  );
end $$;

grant execute on function public.draftix_admin_feedback(text) to anon;

-- ── 4) Rate limits for the new RPCs ────────────────────────────────
-- draftix_submit_feedback: 5 per 10 minutes per IP — prevents unlimited
-- feedback spam while still letting a user correct a mistake.
-- draftix_admin_feedback: 30 per 5 minutes per IP — the dashboard
-- auto-refreshes, keep it comfortable but bounded.
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
