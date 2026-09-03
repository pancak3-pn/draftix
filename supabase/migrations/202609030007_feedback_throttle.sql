-- ═══════════════════════════════════════════════════════════════════
-- 202609030007_feedback_throttle.sql
-- Hard cooldown for feedback: max ONE submission per IP per 10 minutes.
--
-- The PostgREST hook rate limit (5 per 10 min, from 006) still applies,
-- but by itself it still allowed quick reload-resend spam. This patch
-- adds an in-function per-IP cooldown recorded on the feedback rows:
--   • draftix_feedback.ip      first forwarded client IP (set by the
--                              security-definer insert; never exposed
--                              — table has RLS and no policies).
--   • draftix_submit_feedback  returns { ok:false, retryMinutes } when
--                              the same IP submitted within 10 minutes.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

alter table public.draftix_feedback add column if not exists ip inet;

create index if not exists draftix_feedback_ip_created_idx
  on public.draftix_feedback (ip, created_at desc);

create or replace function public.draftix_submit_feedback(
  p_rating integer,
  p_message text,
  p_page text default '/'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message text := left(coalesce(trim(p_message), ''), 600);
  v_page text := left(coalesce(nullif(trim(p_page), ''), '/'), 200);
  v_ip inet;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Invalid rating' using errcode = '22023';
  end if;
  if char_length(v_message) < 3 then
    raise exception 'Message too short' using errcode = '22023';
  end if;

  begin
    v_ip := split_part(
      coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for', ''),
      ',', 1
    )::inet;
  exception when invalid_text_representation or invalid_parameter_value then
    v_ip := null;
  end;

  -- Hard cooldown: one submission per IP per 10 minutes, enforced on the
  -- rows themselves so reload-resend and multi-tab spam both stop here.
  if v_ip is not null then
    perform 1
    from public.draftix_feedback
    where ip = v_ip
      and created_at > now() - interval '10 minutes';
    if found then
      return jsonb_build_object('ok', false, 'retryMinutes', 10);
    end if;
  end if;

  insert into public.draftix_feedback (user_id, ip, rating, message, page)
  values (auth.uid(), v_ip, p_rating::smallint, v_message, v_page);

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.draftix_submit_feedback(integer, text, text) to anon, authenticated;
