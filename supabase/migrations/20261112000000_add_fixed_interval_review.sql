alter table public.flashcards
  add column due_at timestamptz not null default now(),
  add column revision integer not null default 0 check (revision >= 0);

create index flashcards_set_due_id_idx on public.flashcards (set_id, due_at, id);

create function public.invalidate_flashcard_review_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.question is distinct from old.question or new.answer is distinct from old.answer then
    new.revision := old.revision + 1;
    new.due_at := old.due_at;
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_flashcard_review_revision() from public, anon, authenticated;
create trigger flashcard_content_revision
before update on public.flashcards
for each row execute function public.invalidate_flashcard_review_revision();

-- Keep text editing and proposal saving available without exposing scheduling writes.
revoke insert, update on public.flashcards from authenticated;
grant insert (id, set_id, save_operation_id, question, answer) on public.flashcards to authenticated;
grant update (question, answer) on public.flashcards to authenticated;

create table public.flashcard_review_operations (
  owner_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  card_id uuid not null references public.flashcards (id) on delete cascade,
  expected_revision integer not null check (expected_revision >= 0),
  rating text not null check (rating in ('dont_know', 'hard', 'know')),
  revision integer not null check (revision = expected_revision + 1),
  rated_at timestamptz not null,
  due_at timestamptz not null check (due_at > rated_at),
  primary key (owner_id, request_id)
);
create index flashcard_review_operations_card_idx on public.flashcard_review_operations (card_id);
alter table public.flashcard_review_operations enable row level security;
revoke all on public.flashcard_review_operations from public, anon, authenticated;

create function public.rate_flashcard(card_id uuid, expected_revision integer, rating text, request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  locked_card public.flashcards%rowtype;
  receipt public.flashcard_review_operations%rowtype;
  rating_time timestamptz;
  interval_hours integer;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if card_id is null or request_id is null or expected_revision is null or expected_revision < 0
    or rating is null or rating not in ('dont_know', 'hard', 'know') then
    raise exception 'Invalid rating request' using errcode = '22023';
  end if;

  -- Serialize reuse across cards too; a hash collision only adds serialization.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller_id::text || ':' || request_id::text, 0));

  select c.* into locked_card
  from public.flashcards c
  join public.flashcard_sets s on s.id = c.set_id
  where c.id = rate_flashcard.card_id and s.owner_id = caller_id
  for update of c;
  if not found then
    raise exception 'Flashcard not found' using errcode = 'P0002';
  end if;

  select o.* into receipt from public.flashcard_review_operations o
  where o.owner_id = caller_id and o.request_id = rate_flashcard.request_id;
  if found then
    if receipt.card_id <> card_id or receipt.expected_revision <> expected_revision or receipt.rating <> rating then
      raise exception 'Rating request conflict' using errcode = 'P0001';
    end if;
  else
    -- now() is transaction-start time, which can predate a wait for this row.
    rating_time := pg_catalog.clock_timestamp();
    if locked_card.revision <> expected_revision or locked_card.due_at > rating_time then
      raise exception 'Rating request conflict' using errcode = 'P0001';
    end if;
    interval_hours := case rating when 'dont_know' then 24 when 'hard' then 72 else 168 end;
    update public.flashcards c
    set revision = c.revision + 1, due_at = rating_time + interval_hours * interval '1 hour'
    where c.id = locked_card.id
    returning c.* into locked_card;

    insert into public.flashcard_review_operations
      (owner_id, request_id, card_id, expected_revision, rating, revision, rated_at, due_at)
    values
      (caller_id, request_id, card_id, expected_revision, rating, locked_card.revision, rating_time, locked_card.due_at)
    returning * into receipt;
  end if;

  return pg_catalog.jsonb_build_object(
    'requestId', receipt.request_id, 'cardId', receipt.card_id, 'rating', receipt.rating,
    'expectedRevision', receipt.expected_revision, 'revision', receipt.revision,
    'ratedAt', receipt.rated_at, 'dueAt', receipt.due_at
  );
end;
$$;
revoke all on function public.rate_flashcard(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.rate_flashcard(uuid, integer, text, uuid) to authenticated;

create function public.get_flashcard_review_queue(set_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  -- One statement snapshot and database clock for set existence and membership.
  select pg_catalog.jsonb_build_object(
    'setId', s.id, 'title', s.title,
    'totalCards', (select count(*) from public.flashcards c where c.set_id = s.id),
    'cards', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id, 'question', c.question, 'answer', c.answer, 'dueAt', c.due_at, 'revision', c.revision
      ) order by c.due_at, c.id)
      from public.flashcards c where c.set_id = s.id and c.due_at <= pg_catalog.statement_timestamp()
    ), '[]'::jsonb)
  ) into result
  from public.flashcard_sets s where s.id = get_flashcard_review_queue.set_id;
  if result is null then
    raise exception 'Flashcard set not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;
revoke all on function public.get_flashcard_review_queue(uuid) from public, anon, authenticated;
grant execute on function public.get_flashcard_review_queue(uuid) to authenticated;
