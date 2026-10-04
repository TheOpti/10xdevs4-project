alter table public.flashcard_sets
  add constraint flashcard_sets_title_code_point_limit
  check (char_length(title) <= 255);

alter table public.flashcard_sources
  add constraint flashcard_sources_source_text_code_point_limit
  check (char_length(source_text) <= 10000);
