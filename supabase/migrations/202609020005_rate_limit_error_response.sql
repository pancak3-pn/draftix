-- Repair the custom PostgREST rate-limit response for projects that already
-- applied 202609020001. The PGRST message object requires all four fields.

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
  if req_method not in ('POST', 'PUT', 'PATCH', 'DELETE') then return; end if;

  begin
    req_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    req_ip := split_part(coalesce(req_headers->>'x-forwarded-for', ''), ',', 1)::inet;
  exception when invalid_text_representation then
    return;
  end;

  if req_ip is null then return; end if;

  case
    when req_path = 'rpc/draftix_create_room' then max_requests := 6; window_length := interval '10 minutes';
    when req_path = 'rpc/draftix_join_room' then max_requests := 40; window_length := interval '5 minutes';
    when req_path = 'rpc/draftix_admin_stats' then max_requests := 12; window_length := interval '5 minutes';
    when req_path = 'site_pageviews' then max_requests := 60; window_length := interval '1 minute';
    when req_path in (
      'rpc/draftix_action', 'rpc/draftix_undo', 'rpc/draftix_expire_turn',
      'rpc/draftix_leave_room', 'rpc/draftix_set_team_logos',
      'rpc/draftix_set_game_settings'
    ) then max_requests := 120; window_length := interval '1 minute';
    else return;
  end case;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(req_ip::text || ':' || req_path, 0)
  );

  select count(*) into request_count
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
        'headers', jsonb_build_object(
          'Retry-After', greatest(1, extract(epoch from window_length)::integer)::text
        )
      )::text;
  end if;

  insert into private.draftix_api_rate_limits (ip, request_path, request_at)
  values (req_ip, req_path, clock_timestamp());

  if random() < 0.02 then
    delete from private.draftix_api_rate_limits
    where request_at < clock_timestamp() - interval '1 day';
  end if;
end;
$$;

revoke all on function public.draftix_check_request() from public;
grant execute on function public.draftix_check_request() to anon, authenticated, authenticator;
notify pgrst, 'reload config';
