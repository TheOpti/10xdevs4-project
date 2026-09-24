create table public.flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  created_at timestamptz not null default now()
);

create table public.flashcard_sources (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null unique references public.flashcard_sets (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_text text not null check (length(trim(source_text)) > 0),
  created_at timestamptz not null default now()
);

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.flashcard_sets (id) on delete cascade,
  question text not null check (length(trim(question)) > 0),
  answer text not null check (length(trim(answer)) > 0),
  created_at timestamptz not null default now()
);

create index flashcard_sets_owner_id_idx on public.flashcard_sets (owner_id);
create index flashcard_sources_owner_id_idx on public.flashcard_sources (owner_id);
create index flashcards_set_id_idx on public.flashcards (set_id);

alter table public.flashcard_sets enable row level security;
alter table public.flashcard_sources enable row level security;
alter table public.flashcards enable row level security;

revoke all on table public.flashcard_sets from anon, authenticated;
revoke all on table public.flashcard_sources from anon, authenticated;
revoke all on table public.flashcards from anon, authenticated;

grant select, insert, update, delete on table public.flashcard_sets to authenticated;
grant select, insert, update on table public.flashcard_sources to authenticated;
grant select, insert, update, delete on table public.flashcards to authenticated;

create policy "flashcard sets are selectable by their owner"
  on public.flashcard_sets for select to authenticated
  using (owner_id = auth.uid());

create policy "flashcard sets are insertable by their owner"
  on public.flashcard_sets for insert to authenticated
  with check (owner_id = auth.uid());

create policy "flashcard sets are updatable by their owner"
  on public.flashcard_sets for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "flashcard sets are deletable by their owner"
  on public.flashcard_sets for delete to authenticated
  using (owner_id = auth.uid());

create policy "flashcard sources are selectable by their owner"
  on public.flashcard_sources for select to authenticated
  using (owner_id = auth.uid());

create policy "flashcard sources are insertable by their owner"
  on public.flashcard_sources for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.flashcard_sets as flashcard_sets
      where flashcard_sets.id = flashcard_sources.set_id
        and flashcard_sets.owner_id = auth.uid()
    )
  );

create policy "flashcard sources are updatable by their owner"
  on public.flashcard_sources for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.flashcard_sets as flashcard_sets
      where flashcard_sets.id = flashcard_sources.set_id
        and flashcard_sets.owner_id = auth.uid()
    )
  );

create policy "flashcards are selectable through their owner set"
  on public.flashcards for select to authenticated
  using (
    exists (
      select 1
      from public.flashcard_sets as flashcard_sets
      where flashcard_sets.id = flashcards.set_id
        and flashcard_sets.owner_id = auth.uid()
    )
  );

create policy "flashcards are insertable through their owner set"
  on public.flashcards for insert to authenticated
  with check (
    exists (
      select 1
      from public.flashcard_sets as flashcard_sets
      where flashcard_sets.id = flashcards.set_id
        and flashcard_sets.owner_id = auth.uid()
    )
  );

create policy "flashcards are updatable through their owner set"
  on public.flashcards for update to authenticated
  using (
    exists (
      select 1
      from public.flashcard_sets as flashcard_sets
      where flashcard_sets.id = flashcards.set_id
        and flashcard_sets.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.flashcard_sets as flashcard_sets
      where flashcard_sets.id = flashcards.set_id
        and flashcard_sets.owner_id = auth.uid()
    )
  );

create policy "flashcards are deletable through their owner set"
  on public.flashcards for delete to authenticated
  using (
    exists (
      select 1
      from public.flashcard_sets as flashcard_sets
      where flashcard_sets.id = flashcards.set_id
        and flashcard_sets.owner_id = auth.uid()
    )
  );

create function public.create_flashcard_set_with_source(set_title text, set_source_text text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_set_id uuid;
begin
  insert into public.flashcard_sets (title)
  values (set_title)
  returning id into created_set_id;

  insert into public.flashcard_sources (set_id, source_text)
  values (created_set_id, set_source_text);

  return created_set_id;
end;
$$;

revoke all on function public.create_flashcard_set_with_source(text, text) from public, anon, authenticated;
grant execute on function public.create_flashcard_set_with_source(text, text) to authenticated;
