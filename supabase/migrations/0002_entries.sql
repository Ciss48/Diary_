create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null,
  content text not null default '',
  word_count integer not null default 0,
  is_backfill boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create index entries_user_date_idx on public.entries (user_id, entry_date);

alter table public.entries enable row level security;

create policy "entries_select_own" on public.entries
  for select using (auth.uid() = user_id);
create policy "entries_insert_own" on public.entries
  for insert with check (auth.uid() = user_id);
create policy "entries_update_own" on public.entries
  for update using (auth.uid() = user_id);
create policy "entries_delete_own" on public.entries
  for delete using (auth.uid() = user_id);

create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger entries_set_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();
