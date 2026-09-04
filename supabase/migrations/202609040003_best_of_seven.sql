-- Allow tournament series to use Best of 7 in storage and creation validation.
alter table public.tournaments
  drop constraint if exists tournaments_best_of_check;

alter table public.tournaments
  add constraint tournaments_best_of_check
  check (best_of in (1, 3, 5, 7));

do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.draftix_create_tournament(text,text[],integer,text)'::regprocedure
  ) into function_definition;

  function_definition := replace(
    function_definition,
    'p_best_of not in (1,3,5)',
    'p_best_of not in (1,3,5,7)'
  );
  function_definition := replace(
    function_definition,
    'Choose best of 1, 3, or 5',
    'Choose best of 1, 3, 5, or 7'
  );

  if position('p_best_of not in (1,3,5,7)' in function_definition) = 0 then
    raise exception 'Could not update draftix_create_tournament Best of validation';
  end if;

  execute function_definition;
end
$migration$;
