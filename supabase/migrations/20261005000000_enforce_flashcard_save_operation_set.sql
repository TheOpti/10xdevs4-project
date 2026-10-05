alter table public.flashcard_save_operations
  add constraint flashcard_save_operations_id_set_id_key unique (id, set_id);

alter table public.flashcards
  drop constraint flashcards_save_operation_id_fkey,
  add constraint flashcards_save_operation_set_id_fkey
    foreign key (save_operation_id, set_id)
    references public.flashcard_save_operations (id, set_id)
    on delete cascade;
