begin;

select plan(47);

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
  $$insert into public.flashcards (id, set_id, question, answer) select 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', id, 'Owner question', 'Owner answer' from public.flashcard_sets where title = 'Updated owner set'$$,
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

select results_eq(
  $$select count(*) from public.save_reviewed_flashcards((select id from public.flashcard_sets where title = 'Updated owner set'), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '[{"question":"Reviewed question","answer":"Reviewed answer"},{"question":"Second question","answer":"Second answer"}]'::jsonb)$$,
  array[2::bigint],
  'Owner can atomically save a reviewed batch'
);

select results_eq(
  $$select count(*) from public.flashcards where save_operation_id is not null$$,
  array[2::bigint],
  'Reviewed cards retain a durable save-operation relation'
);

select results_eq(
  $$select bool_and(not was_created) from public.save_reviewed_flashcards((select id from public.flashcard_sets where title = 'Updated owner set'), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '[{"question":"Different retry question","answer":"Different retry answer"}]'::jsonb)$$,
  array[true],
  'Replaying a request key returns the original batch'
);

select results_eq(
  $$select count(*) from public.flashcards where save_operation_id is not null$$,
  array[2::bigint],
  'Replay does not duplicate reviewed cards'
);

select throws_ok(
  $$select * from public.save_reviewed_flashcards('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '[{"question":"Different set retry question","answer":"Different set retry answer"}]'::jsonb)$$,
  '22023',
  'Request key belongs to a different flashcard set',
  'Owner cannot replay a request key against a different owned set'
);

select throws_ok(
  $$insert into public.flashcards (set_id, save_operation_id, question, answer) select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, 'Mismatched operation question', 'Mismatched operation answer' from public.flashcard_save_operations where request_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '23503',
  null,
  'Owner cannot attach a save operation to a card in another set'
);

select throws_ok(
  $$delete from public.flashcard_sources where source_text = 'Updated private source'$$,
  '42501',
  'permission denied for table flashcard_sources',
  'Owner cannot delete a source directly'
);

select results_eq(
  $$select answer from public.flashcards where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$,
  array['Updated owner answer'::text],
  'Owner update persists the new answer'
);

select tests.authenticate_as('flashcard_intruder');

select results_eq(
  $$update public.flashcards set question = 'Stolen question', answer = 'Stolen answer' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' returning 1$$,
  array[]::integer[],
  'Second user cannot update a card even with its exact ID'
);

select results_eq(
  $$delete from public.flashcards where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' returning 1$$,
  array[]::integer[],
  'Second user cannot delete a card even with its exact ID'
);

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

select throws_ok(
  $$select * from public.save_reviewed_flashcards('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '[{"question":"Attached question","answer":"Attached answer"}]'::jsonb)$$,
  'P0002',
  'Flashcard set not found',
  'Second user cannot save a batch into the owner set'
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

select results_eq(
  $$select answer from public.flashcards where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$,
  array['Updated owner answer'::text],
  'Intruder mutations leave the owner card unchanged'
);

select results_eq(
  $$delete from public.flashcards where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' returning 1$$,
  array[1],
  'Owner can delete its card'
);

select results_eq(
  $$select count(*) from public.flashcards where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$,
  array[0::bigint],
  'Owner deletion persists'
);

select results_eq(
  $$select count(*) from public.flashcard_sets where title = 'Updated owner set'$$,
  array[1::bigint],
  'Deleting a card preserves its set'
);

select results_eq(
  $$select count(*) from public.flashcard_sources where source_text = 'Updated private source'$$,
  array[1::bigint],
  'Deleting a card preserves the private source'
);

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
  $$select count(*) from public.flashcards where question = 'Reviewed question'$$,
  array[0::bigint],
  'Deleting a set cascades to its cards'
);

select lives_ok(
  $$select public.create_flashcard_set_with_source('Replay set', 'Replay private source')$$,
  'Owner creates a separate set for editing and deletion replay'
);

select results_eq(
  $$select count(*) from public.save_reviewed_flashcards((select id from public.flashcard_sets where title = 'Replay set'), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '[{"question":"Original replay question","answer":"Original replay answer"}]'::jsonb)$$,
  array[1::bigint],
  'Owner saves the original replay card'
);

select results_eq(
  $$update public.flashcards set answer = 'Edited replay answer' where set_id = (select id from public.flashcard_sets where title = 'Replay set') returning 1$$,
  array[1],
  'Owner edits the saved replay card'
);

select results_eq(
  $$select answer from public.save_reviewed_flashcards((select id from public.flashcard_sets where title = 'Replay set'), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '[{"question":"Original replay question","answer":"Original replay answer"}]'::jsonb)$$,
  array['Edited replay answer'::text],
  'Retry returns the edited card instead of overwriting it with the old draft'
);

select results_eq(
  $$select count(*) from public.flashcards where set_id = (select id from public.flashcard_sets where title = 'Replay set')$$,
  array[1::bigint],
  'Retry after editing creates no duplicate cards'
);

select results_eq(
  $$delete from public.flashcards where set_id = (select id from public.flashcard_sets where title = 'Replay set') returning 1$$,
  array[1],
  'Owner deletes the last saved card'
);

select results_eq(
  $$select count(*) from public.save_reviewed_flashcards((select id from public.flashcard_sets where title = 'Replay set'), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '[{"question":"Original replay question","answer":"Original replay answer"}]'::jsonb)$$,
  array[0::bigint],
  'Retry after deletion returns an empty batch'
);

select results_eq(
  $$select count(*) from public.flashcards where set_id = (select id from public.flashcard_sets where title = 'Replay set')$$,
  array[0::bigint],
  'Retry does not restore deleted cards'
);

select results_eq(
  $$select count(*) from public.flashcard_sets where title = 'Replay set'$$,
  array[1::bigint],
  'Deleting the last card preserves the empty set'
);

select results_eq(
  $$select count(*) from public.flashcard_sources where source_text = 'Replay private source'$$,
  array[1::bigint],
  'Deleting the last card preserves its private source'
);

select results_eq(
  $$select count(*) from public.flashcard_save_operations where request_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'$$,
  array[1::bigint],
  'Deleting the last card preserves the durable save operation'
);

select * from finish();
rollback;
