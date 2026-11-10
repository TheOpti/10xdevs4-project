-- A bounded array keeps assignment updates atomic and inherits set ownership RLS.
create function public.valid_flashcard_set_tags(tags text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select tags is not null
    and (
      cardinality(tags) = 0
      or (
        array_ndims(tags) = 1
        and array_lower(tags, 1) = 1
        and cardinality(tags) <= 10
        and (
          select count(distinct tag) = cardinality(tags)
            and bool_and(
              char_length(tag) between 1 and 30
              -- Match ECMAScript whitespace for blank-label validation.
              and btrim(tag, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> ''
            )
          from unnest(tags) as entries(tag)
        )
      )
    );
$$;

revoke all on function public.valid_flashcard_set_tags(text[]) from public, anon, authenticated;
grant execute on function public.valid_flashcard_set_tags(text[]) to authenticated, service_role;

alter table public.flashcard_sets
  add column tags text[] not null default '{}'::text[],
  add constraint flashcard_sets_tags_valid check (public.valid_flashcard_set_tags(tags));
