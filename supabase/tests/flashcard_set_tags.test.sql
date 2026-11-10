begin;
select plan(24);

select tests.create_supabase_user('tag_owner', 'tag-owner@example.com');
select tests.create_supabase_user('tag_intruder', 'tag-intruder@example.com');
select tests.authenticate_as('tag_owner');

insert into public.flashcard_sets (id, title)
values ('11111111-1111-4111-8111-111111111111', 'Tag test set');

select results_eq(
  $$select cardinality(tags) from public.flashcard_sets where id = '11111111-1111-4111-8111-111111111111'$$,
  array[0], 'Sets created without tags default to an empty array'
);

select lives_ok(
  $$update public.flashcard_sets set tags = array['react', 'żółć i kość'] where id = '11111111-1111-4111-8111-111111111111'$$,
  'Owner can assign tags'
);
select results_eq(
  $$select tags from public.flashcard_sets where id = '11111111-1111-4111-8111-111111111111'$$,
  $$values (array['react', 'żółć i kość'])$$, 'Tags persist exactly as assigned'
);
select results_eq(
  $$select title from public.flashcard_sets where id = '11111111-1111-4111-8111-111111111111'$$,
  array['Tag test set'], 'Tag updates preserve other set fields'
);
select lives_ok(
  $$update public.flashcard_sets set tags = array['replacement'] where id = '11111111-1111-4111-8111-111111111111'$$,
  'Owner can replace all assignments'
);
select results_eq(
  $$update public.flashcard_sets set tags = array['replacement'] where id = '11111111-1111-4111-8111-111111111111' returning tags$$,
  $$values (array['replacement'])$$, 'Repeating a replacement does not append tags'
);
select lives_ok(
  $$update public.flashcard_sets set tags = array(select 'tag' || n from generate_series(1, 10) n)$$,
  'Ten tags are permitted'
);
select lives_ok(
  $$update public.flashcard_sets set tags = array[repeat('😀', 30)]$$,
  'Thirty Unicode code points are permitted'
);

select throws_ok($$update public.flashcard_sets set tags = null$$, '23502', null, 'Null arrays are rejected');
select throws_ok($$update public.flashcard_sets set tags = array[null]::text[]$$, '23514', null, 'Null entries are rejected');
select throws_ok($$update public.flashcard_sets set tags = array['']$$, '23514', null, 'Empty entries are rejected');
select throws_ok($$update public.flashcard_sets set tags = array[E' \t\n']$$, '23514', null, 'Whitespace-only entries are rejected');
select throws_ok($$update public.flashcard_sets set tags = array[U&'\00A0\FEFF']$$, '23514', null, 'Unicode whitespace-only entries are rejected');
select throws_ok($$update public.flashcard_sets set tags = array['react', 'react']$$, '23514', null, 'Duplicate entries are rejected');
select throws_ok($$update public.flashcard_sets set tags = array[repeat('😀', 31)]$$, '23514', null, 'Thirty-one code points are rejected');
select throws_ok($$update public.flashcard_sets set tags = array(select 'tag' || n from generate_series(1, 11) n)$$, '23514', null, 'Eleven tags are rejected');
select throws_ok($$update public.flashcard_sets set tags = array[['react', 'sql']]$$, '23514', null, 'Multidimensional arrays are rejected');
select throws_ok($$update public.flashcard_sets set tags = '[0:0]={react}'::text[]$$, '23514', null, 'Nonstandard array bounds are rejected');

select tests.authenticate_as('tag_intruder');
select results_eq(
  $$select tags from public.flashcard_sets where id = '11111111-1111-4111-8111-111111111111'$$,
  $$select array[]::text[] where false$$, 'Second user cannot read tags even with the exact set ID'
);
select results_eq(
  $$update public.flashcard_sets set tags = array['stolen'] where id = '11111111-1111-4111-8111-111111111111' returning 1$$,
  array[]::integer[], 'Second user cannot change tag assignments'
);

select tests.clear_authentication();
select throws_ok($$select tags from public.flashcard_sets$$, '42501', null, 'Anonymous callers cannot read tags');
select throws_ok($$update public.flashcard_sets set tags = array['anonymous']$$, '42501', null, 'Anonymous callers cannot change tags');

select tests.authenticate_as('tag_owner');
select results_eq(
  $$select tags from public.flashcard_sets where id = '11111111-1111-4111-8111-111111111111'$$,
  $$values (array[repeat('😀', 30)])$$, 'Rejected and unauthorized updates preserve existing assignments'
);
select results_eq(
  $$update public.flashcard_sets set tags = '{}'::text[] where id = '11111111-1111-4111-8111-111111111111' returning cardinality(tags)$$,
  array[0], 'Owner can clear all tags'
);

select * from finish();
rollback;
