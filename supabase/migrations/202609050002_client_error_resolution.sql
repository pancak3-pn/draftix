-- Add persistent resolution tracking to the admin client-error feed.

alter table public.draftix_client_errors
  add column if not exists resolved boolean not null default false,
  add column if not exists resolved_at timestamptz;

create index if not exists draftix_client_errors_resolution_idx
  on public.draftix_client_errors (resolved, created_at desc);

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
    'open', (select count(*)::int from draftix_client_errors where not resolved),
    'resolved', (select count(*)::int from draftix_client_errors where resolved),
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
        'createdAt', e.created_at,
        'resolved', e.resolved,
        'resolvedAt', e.resolved_at
      ) order by e.created_at desc)
      from (
        select id, kind, message, stack, page, user_agent, visitor,
               created_at, resolved, resolved_at
        from draftix_client_errors
        order by created_at desc
        limit 50
      ) e
    ), '[]'::json)
  );
end $$;

create or replace function public.draftix_admin_set_error_resolved(
  p_token text,
  p_error_id bigint,
  p_resolved boolean default true
)
returns jsonb
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

  update draftix_client_errors
  set resolved = coalesce(p_resolved, true),
      resolved_at = case when coalesce(p_resolved, true) then now() else null end
  where id = p_error_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.draftix_admin_set_error_resolved(text, bigint, boolean) from public;
grant execute on function public.draftix_admin_set_error_resolved(text, bigint, boolean) to anon;

notify pgrst, 'reload schema';
