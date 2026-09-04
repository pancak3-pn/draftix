-- ═══════════════════════════════════════════════════════════════════
-- 202609040006_admin_token_fail_closed.sql
-- Fail closed while the admin token is still the shipped placeholder.
--
-- analytics.sql seeds draftix_admin_config with the literal placeholder
-- 'CHANGE_ME_replace_with_a_long_random_secret' and an "on conflict do
-- nothing" clause — so if the token is never rotated, the stored value
-- is a publicly-known constant from the repo, and every token-gated
-- admin RPC (stats / feedback / errors) becomes readable by anyone who
-- reads the source.
--
-- This migration re-creates all three admin RPCs so they refuse to
-- serve data while the stored token equals the placeholder. A forgotten
-- rotation then surfaces as 'Unauthorized' in the admin dashboard
-- instead of silently exposing analytics, feedback, and crash reports.
--
-- Idempotent: safe to re-run. Requires supabase/analytics.sql
-- (public.draftix_admin_config, draftix_admin_stats),
-- 202609030006_feedback.sql (draftix_feedback, draftix_admin_feedback),
-- and 202609040004_client_errors.sql (draftix_client_errors,
-- draftix_admin_errors) to be applied.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) draftix_admin_stats ─────────────────────────────────────────
create or replace function public.draftix_admin_stats(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored text;
  v_result json;
begin
  select admin_token into v_stored from draftix_admin_config where id = 1;
  if v_stored is null
     or v_stored = 'CHANGE_ME_replace_with_a_long_random_secret'
     or p_token is null
     or p_token <> v_stored then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select json_build_object(
    'today', json_build_object(
      'views',    (select count(*) from site_pageviews where day = current_date),
      'visitors', (select count(distinct visitor) from site_pageviews where day = current_date)
    ),
    'last7', json_build_object(
      'views',    (select count(*) from site_pageviews where day >= current_date - 6),
      'visitors', (select count(distinct visitor) from site_pageviews where day >= current_date - 6)
    ),
    'allTime', json_build_object(
      'views',    (select count(*) from site_pageviews),
      'visitors', (select count(distinct visitor) from site_pageviews)
    ),
    'daily', coalesce((
      select json_agg(json_build_object('date', d.day, 'views', coalesce(p.c, 0), 'visitors', coalesce(p.v, 0)) order by d.day)
      from (
        select (current_date - offs) as day
        from generate_series(0, 13) as offs
      ) d
      left join (
        select day, count(*) c, count(distinct visitor) v
        from site_pageviews group by day
      ) p on p.day = d.day
    ), '[]'::json),
    'topPages', coalesce((
      select json_agg(json_build_array(t.path, t.c))
      from (
        select path, count(*) c from site_pageviews
        group by path order by count(*) desc limit 8
      ) t
    ), '[]'::json),
    'topReferrers', coalesce((
      select json_agg(json_build_array(t.ref_host, t.c))
      from (
        select ref_host, count(*) c from site_pageviews
        where ref_host is not null and ref_host <> ''
        group by ref_host order by count(*) desc limit 8
      ) t
    ), '[]'::json),
    -- Bonus: real product usage from the draft system itself.
    -- If the draft_rooms table/columns differ this quietly returns nulls.
    'rooms', (select json_build_object('total', r.total, 'today', r.today)
      from (
        select
          (select count(*) from draft_rooms) as total,
          (select count(*) from draft_rooms where created_at >= current_date) as today
      ) r
    )
  ) into v_result;

  return v_result;
exception
  when undefined_table then
    -- draft_rooms missing: return stats without the rooms block.
    return v_result || json_build_object('rooms', null);
end $$;

grant execute on function public.draftix_admin_stats(text) to anon;

-- ── 2) draftix_admin_feedback ──────────────────────────────────────
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
  if v_stored is null
     or v_stored = 'CHANGE_ME_replace_with_a_long_random_secret'
     or p_token is null
     or p_token <> v_stored then
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

-- ── 3) draftix_admin_errors ────────────────────────────────────────
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
  if v_stored is null
     or v_stored = 'CHANGE_ME_replace_with_a_long_random_secret'
     or p_token is null
     or p_token <> v_stored then
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
