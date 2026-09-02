-- ═══════════════════════════════════════════════════════════════════
-- DRAFTIX — First-party visit analytics (Vercel + Supabase deploy)
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query.
-- Safe to re-run (idempotent).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Raw pageview rows ─────────────────────────────────────────
-- One row per page view. The client sends: path, referrer host, and an
-- anonymous visitor UUID (random cookie — no IP / fingerprint / PII).
create table if not exists public.site_pageviews (
  id      bigint generated always as identity primary key,
  ts      timestamptz not null default now(),
  day     date        not null default current_date,
  path    text        not null,
  ref_host text,
  visitor uuid        not null
);

create index if not exists site_pageviews_day_idx   on public.site_pageviews (day);
create index if not exists site_pageviews_visitor_idx on public.site_pageviews (visitor);

alter table public.site_pageviews enable row level security;

-- Visitors may ONLY insert rows — no reads, no updates, no deletes.
drop policy if exists "anon can record pageviews" on public.site_pageviews;
create policy "anon can record pageviews"
  on public.site_pageviews for insert
  to anon
  with check (true);

-- ── 2) Admin token (private — RLS on, zero policies) ─────────────
-- With RLS enabled and no policies, the anon/authenticated API keys can
-- NEVER read this table. Only the security-definer function below can.
create table if not exists public.draftix_admin_config (
  id          int primary key default 1 check (id = 1),
  admin_token text not null
);

alter table public.draftix_admin_config enable row level security;

-- ⚠️ CHANGE THIS: set your own secret (min ~24 random chars).
-- Generate one with: openssl rand -hex 24  (or your password manager).
insert into public.draftix_admin_config (id, admin_token)
values (1, 'CHANGE_ME_replace_with_a_long_random_secret')
on conflict (id) do nothing;

-- ── 3) Stats RPC (token-gated, SECURITY DEFINER) ─────────────────
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
  if v_stored is null or p_token is null or p_token <> v_stored then
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

-- ── 4) Housekeeping: prune raw rows older than 180 days ──────────
-- Optional: run monthly, or schedule with pg_cron if you enable it.
-- delete from site_pageviews where day < current_date - 180;
