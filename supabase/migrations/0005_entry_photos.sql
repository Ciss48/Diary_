create table public.entry_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  storage_path text not null unique,
  width integer,
  height integer,
  size_bytes integer not null,
  created_at timestamptz not null default now()
);

create index entry_photos_entry_idx
  on public.entry_photos (entry_id, created_at);

alter table public.entry_photos enable row level security;

create policy "entry_photos_select_own" on public.entry_photos
  for select using (auth.uid() = user_id);
create policy "entry_photos_insert_own" on public.entry_photos
  for insert with check (auth.uid() = user_id);
create policy "entry_photos_delete_own" on public.entry_photos
  for delete using (auth.uid() = user_id);
