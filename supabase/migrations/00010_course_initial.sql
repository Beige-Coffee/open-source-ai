-- Open-Source AI Stack: course schema (initial)
--
-- Tables for the self-paced course at /learn. Spec lives at docs/COURSE.md.
-- All tables use auth.users(id) as the user FK. Row-level security is on
-- for every table; the only policy is "the row belongs to the user."
--
-- Apply this migration via the Supabase SQL editor or the Supabase CLI:
--   supabase db push
-- Or paste into the SQL editor in the Supabase dashboard.

-- ---------------------------------------------------------------------------
-- profiles: per-user metadata, 1:1 with auth.users
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  pass_choice text check (pass_choice in ('fast', 'deep')) default 'fast',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select using (auth.uid() = user_id);

create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = user_id);

create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id);

create policy profiles_delete_own on public.profiles
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- module_progress: which module/phase the user is in, and whether they
-- got there in-order or jumped
-- ---------------------------------------------------------------------------

create table if not exists public.module_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_slug text not null,
  phase text not null check (phase in (
    'read', 'probe', 'compare', 'why_open', 'synthesize', 'complete'
  )),
  phase_started_at timestamptz not null default now(),
  phase_completed_at timestamptz,
  jumped boolean not null default false,
  primary key (user_id, module_slug)
);

create index if not exists module_progress_user_idx
  on public.module_progress(user_id);

alter table public.module_progress enable row level security;

create policy module_progress_select_own on public.module_progress
  for select using (auth.uid() = user_id);

create policy module_progress_insert_own on public.module_progress
  for insert with check (auth.uid() = user_id);

create policy module_progress_update_own on public.module_progress
  for update using (auth.uid() = user_id);

create policy module_progress_delete_own on public.module_progress
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- synthesize_notes: per-module summary the user wrote in their own words
-- (the Synthesize phase output). Accumulates into the Personal Notes doc.
-- ---------------------------------------------------------------------------

create table if not exists public.synthesize_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_slug text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_slug)
);

alter table public.synthesize_notes enable row level security;

create policy synthesize_notes_select_own on public.synthesize_notes
  for select using (auth.uid() = user_id);

create policy synthesize_notes_insert_own on public.synthesize_notes
  for insert with check (auth.uid() = user_id);

create policy synthesize_notes_update_own on public.synthesize_notes
  for update using (auth.uid() = user_id);

create policy synthesize_notes_delete_own on public.synthesize_notes
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- why_open_notes: per-module answer to "why does open source matter here?"
-- The accumulated thread is the user's evolving sovereignty thesis.
-- ---------------------------------------------------------------------------

create table if not exists public.why_open_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_slug text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_slug)
);

alter table public.why_open_notes enable row level security;

create policy why_open_notes_select_own on public.why_open_notes
  for select using (auth.uid() = user_id);

create policy why_open_notes_insert_own on public.why_open_notes
  for insert with check (auth.uid() = user_id);

create policy why_open_notes_update_own on public.why_open_notes
  for update using (auth.uid() = user_id);

create policy why_open_notes_delete_own on public.why_open_notes
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- chat_turns: the per-module agent dialogue (Probe + Compare + Why-Open).
-- Append-only by convention; the agent reads recent turns to continue the
-- dialogue and writes the new turn at the end.
-- ---------------------------------------------------------------------------

create table if not exists public.chat_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_slug text not null,
  phase text not null check (phase in (
    'probe', 'compare', 'why_open', 'synthesize'
  )),
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  turn_index int not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_turns_user_module_idx
  on public.chat_turns(user_id, module_slug);
create index if not exists chat_turns_module_phase_idx
  on public.chat_turns(user_id, module_slug, phase, turn_index);

alter table public.chat_turns enable row level security;

create policy chat_turns_select_own on public.chat_turns
  for select using (auth.uid() = user_id);

create policy chat_turns_insert_own on public.chat_turns
  for insert with check (auth.uid() = user_id);

create policy chat_turns_delete_own on public.chat_turns
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- handle_new_user trigger: auto-create a profiles row when auth.users
-- gets a new entry, so signup flow doesn't need an extra round-trip.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();
