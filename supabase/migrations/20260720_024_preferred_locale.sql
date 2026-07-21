-- Persist UI language preference on profiles (Ona i18n).
-- Valid codes: en, pcm, yo, ig, ha, fr, pt, ar, es, sw, zh

alter table public.profiles
  add column if not exists preferred_locale text;

comment on column public.profiles.preferred_locale is
  'App UI language code (en, pcm, yo, …). Null = use client default/localStorage.';

-- Optional light check: allow null or short locale codes
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_preferred_locale_len'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_locale_len
      check (
        preferred_locale is null
        or char_length(preferred_locale) between 2 and 12
      );
  end if;
end $$;
