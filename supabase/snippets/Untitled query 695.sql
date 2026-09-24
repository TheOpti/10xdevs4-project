begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '8a8feaa6-95cb-4bc4-97d7-d64e01f3909f', true);

select public.create_flashcard_set_with_source(
  'Atomic success test',
  'Private source text'
) as created_set_id;

do $$
begin
  perform public.create_flashcard_set_with_source(
    'Atomic failure test',
    '   '
  );
  raise exception 'Expected empty source text to be rejected';
exception
  when check_violation then null;
end;
$$;

select count(*) as orphaned_sets
from public.flashcard_sets
where title = 'Atomic failure test';

rollback;
