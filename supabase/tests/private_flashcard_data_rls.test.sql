begin;

select plan(21);

select tests.create_supabase_user('flashcard_owner', 'flashcard-owner@example.com');
select tests.create_supabase_user('flashcard_intruder', 'flashcard-intruder@example.com');

select tests.authenticate_as('flashcard_owner');

select lives_ok(
  $$select public.create_flashcard_set_with_source('Owner set', 'Private source text')$$,
  'Owner can atomically create a set and source'
);

select results_eq(
  $$select count(*) from public.flashcard_sets where title = 'Owner set'$$,
  array[1::bigint],
  'Owner can read its created set'
);

select results_eq(
  $$select count(*) from public.flashcard_sources where source_text = 'Private source text'$$,
  array[1::bigint],
  'Owner can read its source text'
);

select lives_ok(
  $$update public.flashcard_sources set source_text = 'Updated private source' where set_id = (select id from public.flashcard_sets where title = 'Owner set')$$,
  'Owner can update its source text'
);

select lives_ok(
  $$update public.flashcard_sets set title = 'Updated owner set' where title = 'Owner set'$$,
  'Owner can update its set'
);

select lives_ok(
  $$insert into public.flashcards (set_id, question, answer) select id, 'Owner question', 'Owner answer' from public.flashcard_sets where title = 'Updated owner set'$$,
  'Owner can create a card'
);

select lives_ok(
  $$update public.flashcards set answer = 'Updated owner answer' where question = 'Owner question'$$,
  'Owner can update a card'
);

select lives_ok(
  $$insert into public.flashcard_sets (id, title) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Attachment target')$$,
  'Owner can create a set that the second user cannot attach records to'
);

select throws_ok(
  $$delete from public.flashcard_sources where source_text = 'Updated private source'$$,
  '42501',
  'permission denied for table flashcard_sources',
  'Owner cannot delete a source directly'
);

select tests.authenticate_as('flashcard_intruder');

select results_eq(
  $$select count(*) from public.flashcard_sets where title = 'Updated owner set'$$,
  array[0::bigint],
  'Second user cannot read the owner set'
);

select results_eq(
  $$select count(*) from public.flashcard_sources where source_text = 'Updated private source'$$,
  array[0::bigint],
  'Second user cannot read the owner source'
);

select results_eq(
  $$select count(*) from public.flashcards where question = 'Owner question'$$,
  array[0::bigint],
  'Second user cannot read the owner card'
);

select results_eq(
  $$update public.flashcard_sets set title = 'Stolen set' where title = 'Updated owner set' returning 1$$,
  array[]::integer[],
  'Second user cannot change the owner set'
);

select results_eq(
  $$delete from public.flashcard_sets where title = 'Updated owner set' returning 1$$,
  array[]::integer[],
  'Second user cannot delete the owner set'
);

select throws_ok(
  $$insert into public.flashcard_sources (set_id, source_text) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Attached source')$$,
  '42501',
  'new row violates row-level security policy for table "flashcard_sources"',
  'Second user cannot attach a source to the owner set'
);

select throws_ok(
  $$insert into public.flashcards (set_id, question, answer) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Attached question', 'Attached answer')$$,
  '42501',
  'new row violates row-level security policy for table "flashcards"',
  'Second user cannot attach a card to the owner set'
);

select tests.clear_authentication();

select throws_ok(
  $$select count(*) from public.flashcard_sets$$,
  '42501',
  'permission denied for table flashcard_sets',
  'Anonymous callers cannot read flashcard sets'
);

select throws_ok(
  $$select public.create_flashcard_set_with_source('Anonymous set', 'Anonymous source')$$,
  '42501',
  'permission denied for function create_flashcard_set_with_source',
  'Anonymous callers cannot execute the atomic creation function'
);

select tests.authenticate_as('flashcard_owner');

select lives_ok(
  $$delete from public.flashcard_sets where title = 'Updated owner set'$$,
  'Owner can delete its set'
);

select results_eq(
  $$select count(*) from public.flashcard_sources where source_text = 'Updated private source'$$,
  array[0::bigint],
  'Deleting a set cascades to its source'
);

select results_eq(
  $$select count(*) from public.flashcards where question = 'Owner question'$$,
  array[0::bigint],
  'Deleting a set cascades to its cards'
);

select * from finish();
rollback;
