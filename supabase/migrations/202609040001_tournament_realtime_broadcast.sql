-- Instant bracket updates without exposing table data. Triggers broadcast a
-- lightweight "tournament_change" event on the per-tournament realtime
-- channel (topic "tournament:<id>") whenever a bracket's matches, teams, or
-- state row change. Clients listen on that channel and refetch the full
-- public state through draftix_tournament_state, so no table grants or
-- realtime publication changes are required and the organizer token hash
-- and owner id never leave the database.

create or replace function private.notify_tournament_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_tournament_id uuid;
begin
  v_tournament_id := coalesce(new.tournament_id, old.tournament_id);
  begin
    perform realtime.send(
      jsonb_build_object('tournament_id', v_tournament_id),
      'tournament_change',
      'tournament:' || v_tournament_id::text,
      false
    );
  exception when others then
    -- Realtime unavailable (e.g. self-hosted without the extension):
    -- swallow and let clients fall back to their slow poll.
    null;
  end;
  return coalesce(new, old);
end;
$$;

drop trigger if exists draftix_tournament_matches_notify on public.tournament_matches;
create trigger draftix_tournament_matches_notify
after insert or update or delete on public.tournament_matches
for each row execute function private.notify_tournament_change();

drop trigger if exists draftix_tournament_teams_notify on public.tournament_teams;
create trigger draftix_tournament_teams_notify
after insert or update or delete on public.tournament_teams
for each row execute function private.notify_tournament_change();

drop trigger if exists draftix_tournaments_notify on public.tournaments;
create trigger draftix_tournaments_notify
after update on public.tournaments
for each row execute function private.notify_tournament_change();
