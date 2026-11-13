begin;
select no_plan();

select tests.create_supabase_user('review_owner', 'review-owner@example.com');
select tests.create_supabase_user('review_intruder', 'review-intruder@example.com');

-- Reconstruct the pre-migration card schema only inside this rolled-back test.
-- Reapply the actual migration, so backfill assertions exercise its real DDL.
drop function public.rate_flashcard(uuid, integer, text, uuid);
drop function public.get_flashcard_review_queue(uuid);
drop table public.flashcard_review_operations;
drop trigger flashcard_content_revision on public.flashcards;
drop function public.invalidate_flashcard_review_revision();
alter table public.flashcards drop column due_at, drop column revision;
grant insert, update on public.flashcards to authenticated;

select tests.authenticate_as('review_owner');
insert into public.flashcard_sets (id, title) values
  ('10000000-0000-4000-8000-000000000001', 'Review set'),
  ('10000000-0000-4000-8000-000000000002', 'Empty set');
insert into public.flashcards (id, set_id, question, answer) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Old question', 'Old answer');
reset role;
do $$
declare migration_statement text; migration_statements text[];
begin
  select statements into strict migration_statements from supabase_migrations.schema_migrations
    where version = '20261112000000';
  if cardinality(migration_statements) = 0 then raise exception 'Migration history has no SQL'; end if;
  foreach migration_statement in array migration_statements loop
    execute migration_statement;
  end loop;
end$$;

select is((select due_at from public.flashcards where id = '20000000-0000-4000-8000-000000000001'),
  now(), 'Existing cards are backfilled at migration transaction time');
select is((select revision from public.flashcards where id = '20000000-0000-4000-8000-000000000001'),
  0, 'Existing cards start at revision zero');
select ok(not has_table_privilege('authenticated', 'public.flashcards', 'INSERT'), 'No table-wide insert grant');
select ok(not has_table_privilege('authenticated', 'public.flashcards', 'UPDATE'), 'No table-wide update grant');
select ok(has_column_privilege('authenticated', 'public.flashcards', 'answer', 'UPDATE'), 'Content updates remain granted');
select ok(not has_column_privilege('authenticated', 'public.flashcards', 'revision', 'UPDATE'), 'Revision updates are private');
select ok(not has_column_privilege('authenticated', 'public.flashcards', 'due_at', 'INSERT'), 'Schedule inserts are private');
select ok((select relrowsecurity from pg_class where oid = 'public.flashcard_review_operations'::regclass), 'Receipts have RLS');

select tests.authenticate_as('review_owner');
insert into public.flashcards (id, set_id, question, answer)
select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001', 'Question ' || n, 'Answer ' || n
from generate_series(2, 8) n;
select ok((select bool_and(due_at = now() and revision = 0) from public.flashcards
  where set_id = '10000000-0000-4000-8000-000000000001'), 'New cards default to immediately due and revision zero');
select throws_ok($$update public.flashcards set due_at = now()$$, '42501', null, 'Owner cannot alter schedules');
select throws_ok($$update public.flashcards set revision = 99$$, '42501', null, 'Owner cannot alter revisions');
select throws_ok($$insert into public.flashcards (set_id, question, answer, due_at)
  values ('10000000-0000-4000-8000-000000000001', 'Q', 'A', now())$$,
  '42501', null, 'Owner cannot insert scheduling values');
select throws_ok($$select * from public.flashcard_review_operations$$, '42501', null, 'Owner cannot read receipts directly');
select throws_ok($$delete from public.flashcard_review_operations$$, '42501', null, 'Owner cannot delete receipts directly');
select throws_ok($$insert into public.flashcard_review_operations (request_id) values (gen_random_uuid())$$,
  '42501', null, 'Owner cannot insert receipts directly');
select throws_ok($$update public.flashcard_review_operations set rating = 'know'$$,
  '42501', null, 'Owner cannot update receipts directly');

select is(public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000002')->'cards',
  '[]'::jsonb, 'Empty visible set returns an empty array');
select is(public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000001')->>'totalCards',
  '8', 'Queue envelope counts all cards');
select is(public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000001')->>'title',
  'Review set', 'Queue includes set title');
select ok(not (public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000001') ? 'source_text'),
  'Queue omits private source text');

-- Pin only the rating clock in this transaction; leave interval logic unchanged.
-- This allows actual RPC calls on both sides of DST, without a production clock override.
reset role;
create function pg_temp.review_test_clock() returns timestamptz language sql as
  $$select current_setting('test.review_time')::timestamptz$$;
do $$begin
  execute replace(pg_get_functiondef('public.rate_flashcard(uuid,integer,text,uuid)'::regprocedure),
    'pg_catalog.clock_timestamp()', 'pg_temp.review_test_clock()');
end$$;
set local timezone = 'Europe/Warsaw';
select set_config('test.review_time', '2027-03-27 23:00:00+00', true);
select tests.authenticate_as('review_owner');
create temporary table review_results (rating text, receipt jsonb);
insert into review_results values
  ('dont_know', public.rate_flashcard('20000000-0000-4000-8000-000000000001', 0, 'dont_know', '30000000-0000-4000-8000-000000000001')),
  ('hard', public.rate_flashcard('20000000-0000-4000-8000-000000000002', 0, 'hard', '30000000-0000-4000-8000-000000000002')),
  ('know', public.rate_flashcard('20000000-0000-4000-8000-000000000003', 0, 'know', '30000000-0000-4000-8000-000000000003'));
select is((receipt->>'dueAt')::timestamptz - (receipt->>'ratedAt')::timestamptz,
  case rating when 'dont_know' then interval '24 hours' when 'hard' then interval '72 hours' else interval '168 hours' end,
  rating || ' uses exact elapsed hours across spring DST') from review_results;
select is((select (receipt->>'dueAt')::timestamptz from review_results where rating = 'dont_know'),
  '2027-03-28 23:00:00+00'::timestamptz, 'A 23:00 UTC rating stays at 23:00 UTC');
select ok((select bool_and(revision = 1) from public.flashcards where id in
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003')),
  'Each rating increments revision once');
select is(public.rate_flashcard('20000000-0000-4000-8000-000000000001', 0, 'dont_know', '30000000-0000-4000-8000-000000000001'),
  (select receipt from review_results where rating = 'dont_know'), 'Exact replay returns the stored receipt');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000001', 0, 'know', '30000000-0000-4000-8000-000000000001')$$,
  'P0001', null, 'Key reuse with a changed rating conflicts');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000001', 1, 'dont_know', '30000000-0000-4000-8000-000000000001')$$,
  'P0001', null, 'Key reuse with a changed revision conflicts');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000004', 0, 'dont_know', '30000000-0000-4000-8000-000000000001')$$,
  'P0001', null, 'Key reuse with another card conflicts');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000001', 0, 'know', gen_random_uuid())$$,
  'P0001', null, 'Another request against the old revision conflicts');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000001', 1, 'know', gen_random_uuid())$$,
  'P0001', null, 'A future card cannot be rated early');

update public.flashcards set answer = answer where id = '20000000-0000-4000-8000-000000000001';
select is((select revision from public.flashcards where id = '20000000-0000-4000-8000-000000000001'), 1, 'No-op edits preserve revision');
update public.flashcards set answer = 'Changed' where id = '20000000-0000-4000-8000-000000000001';
update public.flashcards set answer = 'Old answer' where id = '20000000-0000-4000-8000-000000000001';
select is((select revision from public.flashcards where id = '20000000-0000-4000-8000-000000000001'), 3, 'Change then revert still invalidates old content');
select is((select due_at from public.flashcards where id = '20000000-0000-4000-8000-000000000001'),
  (select (receipt->>'dueAt')::timestamptz from review_results where rating = 'dont_know'), 'Content changes preserve the schedule');
select is(public.rate_flashcard('20000000-0000-4000-8000-000000000001', 0, 'dont_know', '30000000-0000-4000-8000-000000000001'),
  (select receipt from review_results where rating = 'dont_know'), 'Replay remains valid after content edits');

select set_config('test.review_time', '2027-10-30 23:00:00+00', true);
insert into review_results values ('autumn', public.rate_flashcard('20000000-0000-4000-8000-000000000001', 3, 'dont_know', gen_random_uuid()));
select is((select (receipt->>'dueAt')::timestamptz from review_results where rating = 'autumn'),
  '2027-10-31 23:00:00+00'::timestamptz, 'Elapsed hours also survive autumn DST');
select is(public.rate_flashcard('20000000-0000-4000-8000-000000000001', 0, 'dont_know', '30000000-0000-4000-8000-000000000001'),
  (select receipt from review_results where rating = 'dont_know'), 'Replay returns original outcome after a later rating');

select throws_ok($$select public.rate_flashcard(null, 0, 'hard', gen_random_uuid())$$, '22023', null, 'Null card rejected');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000004', null, 'hard', gen_random_uuid())$$, '22023', null, 'Null revision rejected');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000004', -1, 'hard', gen_random_uuid())$$, '22023', null, 'Negative revision rejected');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000004', 0, null, gen_random_uuid())$$, '22023', null, 'Null rating rejected');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000004', 0, 'good', gen_random_uuid())$$, '22023', null, 'Unknown rating rejected');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000004', 0, 'hard', null)$$, '22023', null, 'Null request rejected');

-- Force a receipt insertion failure and verify the schedule update rolls back too.
reset role;
create function pg_temp.reject_review_receipt() returns trigger language plpgsql as $$
begin raise exception 'Test receipt failure' using errcode = '23514'; end$$;
create trigger test_reject_receipt before insert on public.flashcard_review_operations
  for each row execute function pg_temp.reject_review_receipt();
select tests.authenticate_as('review_owner');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000004', 0, 'hard', '30000000-0000-4000-8000-000000000004')$$,
  '23514', null, 'Receipt failure rejects the whole transaction');
select ok((select revision = 0 and due_at = now() from public.flashcards where id = '20000000-0000-4000-8000-000000000004'),
  'Failed receipt leaves both schedule and revision unchanged');
reset role;
select is((select count(*) from public.flashcard_review_operations where request_id = '30000000-0000-4000-8000-000000000004'),
  0::bigint, 'Failed operation leaves no receipt');
drop trigger test_reject_receipt on public.flashcard_review_operations;

-- Pin due times with privileged setup. Queue membership uses its statement clock.
update public.flashcards set due_at = '2100-01-01' where set_id = '10000000-0000-4000-8000-000000000001';
select tests.authenticate_as('review_owner');
select is(public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000001')->'cards',
  '[]'::jsonb, 'A nonempty set with only future cards returns an empty queue');
select is(public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000001')->>'totalCards',
  '8', 'An empty due queue still reports all saved cards');
reset role;
update public.flashcards set due_at = '2000-01-01' where id in
  ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000006');
select tests.authenticate_as('review_owner');
select is(jsonb_path_query_array(public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000001'), '$.cards[*].id'),
  '["20000000-0000-4000-8000-000000000005", "20000000-0000-4000-8000-000000000006"]'::jsonb,
  'Queue excludes future cards and sorts ties by ID');
reset role;
update public.flashcards set due_at = '1999-01-01' where id = '20000000-0000-4000-8000-000000000006';
select tests.authenticate_as('review_owner');
select is(public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000001')->'cards'->0->>'id',
  '20000000-0000-4000-8000-000000000006', 'Queue sorts by due time before ID');
reset role;
-- Both operations run in one statement so equality is exact, not a timing guess.
create function pg_temp.check_queue_boundary() returns boolean language plpgsql as $$
begin
  update public.flashcards set due_at = statement_timestamp() where id = '20000000-0000-4000-8000-000000000007';
  return public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000001')->'cards'
    @> '[{"id":"20000000-0000-4000-8000-000000000007"}]'::jsonb;
end$$;
select ok(pg_temp.check_queue_boundary(), 'Queue includes the exact due-time boundary');
update public.flashcards set due_at = '2027-10-30 23:00:00+00' where id = '20000000-0000-4000-8000-000000000008';
select tests.authenticate_as('review_owner');
select lives_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000008', 0, 'hard', gen_random_uuid())$$,
  'Rating is accepted exactly at due time');

select tests.authenticate_as('review_intruder');
select throws_ok($$select public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000001')$$,
  'P0002', null, 'Foreign queue is hidden');
select throws_ok($$select public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000099')$$,
  'P0002', null, 'Missing queue has the same result');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000001', 0, 'dont_know', '30000000-0000-4000-8000-000000000001')$$,
  'P0002', null, 'Foreign card is hidden even with an exact receipt payload');
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000099', 0, 'hard', gen_random_uuid())$$,
  'P0002', null, 'Missing card has the same result');
select tests.clear_authentication();
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000004', 0, 'hard', gen_random_uuid())$$,
  '42501', null, 'Anonymous rating execution is denied');
select throws_ok($$select public.get_flashcard_review_queue('10000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'Anonymous queue execution is denied');
select throws_ok($$select * from public.flashcard_review_operations$$, '42501', null, 'Anonymous receipt access is denied');
set local role authenticated;
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000004', 0, 'hard', gen_random_uuid())$$,
  '42501', null, 'Missing auth.uid is rejected even with execution permission');

select tests.authenticate_as('review_owner');
delete from public.flashcards where id = '20000000-0000-4000-8000-000000000001';
select throws_ok($$select public.rate_flashcard('20000000-0000-4000-8000-000000000001', 0, 'dont_know', '30000000-0000-4000-8000-000000000001')$$,
  'P0002', null, 'Retry cannot restore a deleted card');
reset role;
select is((select count(*) from public.flashcard_review_operations where card_id = '20000000-0000-4000-8000-000000000001'),
  0::bigint, 'Deleting a card cascades to every receipt');
select tests.authenticate_as('review_owner');
delete from public.flashcard_sets where id = '10000000-0000-4000-8000-000000000001';
reset role;
select is((select count(*) from public.flashcard_review_operations), 0::bigint, 'Deleting the set removes its receipts');

-- Proposal-save retries must not reset a schedule created by learning reviews.
select tests.authenticate_as('review_owner');
create temporary table saved_review_card as
  select * from public.save_reviewed_flashcards('10000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001', '[{"question":"Saved question","answer":"Saved answer"}]');
select public.rate_flashcard(id, 0, 'know', gen_random_uuid()) from saved_review_card;
create temporary table saved_schedule as select due_at, revision from public.flashcards
  where id = (select id from saved_review_card);
select lives_ok($$select * from public.save_reviewed_flashcards('10000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001', '[{"question":"Old draft","answer":"Old answer"}]')$$,
  'Proposal-save replay still succeeds after a rating');
select results_eq($$select due_at, revision from public.flashcards where id = (select id from saved_review_card)$$,
  $$select due_at, revision from saved_schedule$$, 'Proposal-save replay preserves scheduling and revision');
update public.flashcards set question = 'New question' where id = (select id from saved_review_card);
select is((select revision from public.flashcards where id = (select id from saved_review_card)),
  2, 'Question edits also invalidate the loaded revision');
select throws_ok($$select public.rate_flashcard((select id from saved_review_card), 1, 'hard', gen_random_uuid())$$,
  'P0001', null, 'Ratings against edited content are rejected');
reset role;
delete from auth.users where id = (select owner_id from public.flashcard_sets where id = '10000000-0000-4000-8000-000000000002');
select is((select count(*) from public.flashcard_review_operations), 0::bigint, 'Account deletion removes receipts');
select * from finish();
rollback;
