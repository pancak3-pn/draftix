-- Hotfix for projects that already applied 202609020001_rate_limits.sql.
-- PostgREST invokes db_pre_request after switching to the request role.

grant execute on function public.draftix_check_request() to anon, authenticated, authenticator;
notify pgrst, 'reload config';
