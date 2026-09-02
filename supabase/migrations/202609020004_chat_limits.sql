-- Upgrade room chat to a ten-second cooldown and 100-character messages.
-- This migration is safe to run after the original five-second cooldown migration.

create schema if not exists private;

create or replace function private.draftix_enforce_chat_cooldown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or new.user_id <> caller_id then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if pg_catalog.char_length(new.body) > 100 then
    raise exception 'Messages are limited to 100 characters' using errcode = '22001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('draftix-chat:' || caller_id::text, 0)
  );

  if exists (
    select 1
    from public.draft_messages
    where user_id = caller_id
      and created_at > pg_catalog.clock_timestamp() - interval '10 seconds'
  ) then
    raise exception 'Please wait 10 seconds before sending another message'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function private.draftix_enforce_chat_cooldown() from public, anon, authenticated;

drop trigger if exists draftix_chat_cooldown on public.draft_messages;
create trigger draftix_chat_cooldown
before insert on public.draft_messages
for each row execute function private.draftix_enforce_chat_cooldown();

alter table public.draft_messages
  drop constraint if exists draft_messages_body_check;

alter table public.draft_messages
  add constraint draft_messages_body_check
  check (char_length(body) between 1 and 100) not valid;
