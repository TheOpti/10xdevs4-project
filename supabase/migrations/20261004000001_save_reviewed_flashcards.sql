create table public.flashcard_save_operations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid not null references public.flashcard_sets (id) on delete cascade,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, request_id)
);

alter table public.flashcards
  add column save_operation_id uuid references public.flashcard_save_operations (id) on delete cascade,
  add constraint flashcards_question_code_point_limit check (char_length(question) <= 1000),
  add constraint flashcards_answer_code_point_limit check (char_length(answer) <= 1000);

create index flashcard_save_operations_owner_id_idx on public.flashcard_save_operations (owner_id);
create index flashcard_save_operations_set_id_idx on public.flashcard_save_operations (set_id);
create index flashcards_save_operation_id_idx on public.flashcards (save_operation_id);

alter table public.flashcard_save_operations enable row level security;

revoke all on table public.flashcard_save_operations from anon, authenticated;
grant select, insert on table public.flashcard_save_operations to authenticated;

create policy "flashcard save operations are selectable by their owner"
  on public.flashcard_save_operations for select to authenticated
  using (owner_id = auth.uid());

create policy "flashcard save operations are insertable through their owner set"
  on public.flashcard_save_operations for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.flashcard_sets
      where flashcard_sets.id = flashcard_save_operations.set_id
        and flashcard_sets.owner_id = auth.uid()
    )
  );

create function public.save_reviewed_flashcards(set_id uuid, request_id uuid, cards jsonb)
returns table (was_created boolean, id uuid, question text, answer text, created_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  operation_id uuid;
  operation_set_id uuid;
begin
  if jsonb_typeof(cards) is distinct from 'array' or jsonb_array_length(cards) not between 1 and 15 then
    raise exception 'Invalid flashcard batch' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(cards) as card(value)
    where jsonb_typeof(value) <> 'object'
      or jsonb_typeof(value -> 'question') <> 'string'
      or jsonb_typeof(value -> 'answer') <> 'string'
      or length(trim(value ->> 'question')) = 0
      or length(trim(value ->> 'answer')) = 0
      or char_length(value ->> 'question') > 1000
      or char_length(value ->> 'answer') > 1000
  ) then
    raise exception 'Invalid flashcard batch' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.flashcard_sets
    where flashcard_sets.id = save_reviewed_flashcards.set_id
      and flashcard_sets.owner_id = auth.uid()
  ) then
    raise exception 'Flashcard set not found' using errcode = 'P0002';
  end if;

  insert into public.flashcard_save_operations (set_id, request_id)
  values (save_reviewed_flashcards.set_id, save_reviewed_flashcards.request_id)
  on conflict on constraint flashcard_save_operations_owner_id_request_id_key do nothing
  returning flashcard_save_operations.id into operation_id;

  if operation_id is null then
    select flashcard_save_operations.id, flashcard_save_operations.set_id
    into operation_id, operation_set_id
    from public.flashcard_save_operations
    where flashcard_save_operations.owner_id = auth.uid()
      and flashcard_save_operations.request_id = save_reviewed_flashcards.request_id;

    if operation_set_id is distinct from save_reviewed_flashcards.set_id then
      raise exception 'Request key belongs to a different flashcard set' using errcode = '22023';
    end if;

    return query
    select false, flashcards.id, flashcards.question, flashcards.answer, flashcards.created_at
    from public.flashcards
    where flashcards.save_operation_id = operation_id
    order by flashcards.created_at, flashcards.id;
    return;
  end if;

  insert into public.flashcards (set_id, save_operation_id, question, answer)
  select
    save_reviewed_flashcards.set_id,
    operation_id,
    trim(value ->> 'question'),
    trim(value ->> 'answer')
  from jsonb_array_elements(cards) as card(value);

  return query
  select true, flashcards.id, flashcards.question, flashcards.answer, flashcards.created_at
  from public.flashcards
  where flashcards.save_operation_id = operation_id
  order by flashcards.created_at, flashcards.id;
end;
$$;

revoke all on function public.save_reviewed_flashcards(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_reviewed_flashcards(uuid, uuid, jsonb) to authenticated;
