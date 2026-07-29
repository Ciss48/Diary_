-- Phase 05b: add caption and taken_at to entry_photos.
-- Migration is intentionally additive: no existing rows or policies are removed.

alter table public.entry_photos
  add column if not exists caption text,
  add column if not exists taken_at time;

alter table public.entry_photos
  drop constraint if exists entry_photos_caption_len;
alter table public.entry_photos
  add constraint entry_photos_caption_len
  check (caption is null or char_length(caption) <= 80);

-- Phase 5 deliberately omitted an UPDATE policy to keep photo rows immutable.
-- Caption and taken_at are user-editable metadata, so we open UPDATE here
-- intentionally. Both USING and WITH CHECK are scoped to the row owner.
create policy "entry_photos_update_own" on public.entry_photos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
