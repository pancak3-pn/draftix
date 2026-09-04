-- Fix for 202609040001: the notify function referenced new.tournament_id for
-- every table, but public.tournaments has no tournament_id column — its id IS
-- the tournament id — so every match write that also touched the tournaments
-- row (set result, live score, clear) failed with undefined column. Use the
-- right column per table, and make the whole body fail-safe: a notification
-- problem must never break bracket writes.

create or replace function private.notify_tournament_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_tournament_id uuid;
begin
  if tg_table_name = 'tournaments' then
    v_tournament_id := new.id;
  else
    v_tournament_id := coalesce(new.tournament_id, old.tournament_id);
  end if;
  perform realtime.send(
    jsonb_build_object('tournament_id', v_tournament_id),
    'tournament_change',
    'tournament:' || v_tournament_id::text,
    false
  );
  return coalesce(new, old);
exception
  when others then
    -- Missing realtime extension, channel issues, anything unexpected:
    -- swallow so clients fall back to their slow poll instead of the
    -- write failing.
    return coalesce(new, old);
end;
$$;
