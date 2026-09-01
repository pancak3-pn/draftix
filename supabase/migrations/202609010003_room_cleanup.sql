create extension if not exists pg_cron;

create or replace function public.draftix_delete_expired_rooms(batch_size integer default 1000)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  deleted_count integer;
begin
  with expired as (
    select id
    from public.draft_rooms
    where expires_at < now()
    order by expires_at
    limit greatest(1,least(batch_size,5000))
    for update skip locked
  )
  delete from public.draft_rooms rooms
  using expired
  where rooms.id=expired.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end $$;

revoke all on function public.draftix_delete_expired_rooms(integer) from public;
revoke all on function public.draftix_delete_expired_rooms(integer) from anon;
revoke all on function public.draftix_delete_expired_rooms(integer) from authenticated;

select cron.schedule(
  'draftix-delete-expired-rooms',
  '17 * * * *',
  $$select public.draftix_delete_expired_rooms(1000);$$
);
