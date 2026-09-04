-- Remove the retired site-wide live viewer counter.
-- The draft-player heartbeat was only used by the retired counter, so it is
-- removed as well. Realtime room synchronization is independent of it.

drop function if exists public.draftix_presence();
drop function if exists public.draftix_visitor_heartbeat(text);
drop function if exists public.draftix_visitor_leave();
drop function if exists public.draftix_heartbeat(text);
drop table if exists public.draftix_visitors;

notify pgrst, 'reload schema';
