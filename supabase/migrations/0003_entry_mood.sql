alter table public.entries
  add column if not exists mood text;

alter table public.entries
  drop constraint if exists entries_mood_check;

alter table public.entries
  add constraint entries_mood_check
  check (mood is null or mood in ('happy', 'normal', 'sad'));
