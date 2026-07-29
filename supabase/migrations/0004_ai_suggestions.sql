create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  usage_date date not null,
  source_content text not null,
  corrected_version text not null,
  changes jsonb not null default '[]'::jsonb,
  overall_feedback text not null default '',
  model text not null,
  created_at timestamptz not null default now()
);

create index ai_suggestions_user_usage_idx
  on public.ai_suggestions (user_id, usage_date);
create index ai_suggestions_entry_idx
  on public.ai_suggestions (entry_id, created_at desc);

alter table public.ai_suggestions enable row level security;

create policy "ai_suggestions_select_own" on public.ai_suggestions
  for select using (auth.uid() = user_id);
create policy "ai_suggestions_insert_own" on public.ai_suggestions
  for insert with check (auth.uid() = user_id);
create policy "ai_suggestions_delete_own" on public.ai_suggestions
  for delete using (auth.uid() = user_id);
