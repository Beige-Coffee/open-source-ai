-- Open-Source AI Stack: end-to-end encryption for course user content
--
-- Adds a per-user wrapped data key (DK) plus encrypted columns for the
-- three tables that hold user-authored text: chat_turns, synthesize_notes,
-- why_open_notes. Cleartext columns are kept (nullable) through Phase 7;
-- the next migration (00031) drops them once both users have re-encrypted
-- their existing data.
--
-- Key model:
--   password ─PBKDF2(salt, iter)─▶ KEK ─AES-GCM─▶ wraps DK ─AES-GCM─▶ ciphertext
-- Server holds wrapped_dk + wrap_nonce + kdf_salt + kdf_iterations. Never
-- sees password, KEK, DK, or plaintext.
--
-- Apply via the Supabase SQL editor or `supabase db push`.

-- ---------------------------------------------------------------------------
-- user_keys: per-user wrapped data key + KDF parameters.
-- ---------------------------------------------------------------------------

create table if not exists public.user_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- All three byte fields are base64url-encoded by the client. Stored as
  -- text so PostgREST round-trips are lossless (bytea returns hex strings
  -- that would need parsing on every read).
  wrapped_dk text not null,
  wrap_nonce text not null,
  kdf_salt text not null,
  kdf_iterations int not null default 600000 check (kdf_iterations >= 100000),
  kdf_alg text not null default 'pbkdf2-sha256' check (kdf_alg in ('pbkdf2-sha256')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_keys enable row level security;

create policy user_keys_select_own on public.user_keys
  for select using (auth.uid() = user_id);

create policy user_keys_insert_own on public.user_keys
  for insert with check (auth.uid() = user_id);

create policy user_keys_update_own on public.user_keys
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy user_keys_delete_own on public.user_keys
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_keys to authenticated;

-- Keep updated_at fresh on rewrap (password change).
create or replace function public.touch_user_keys_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_keys_touch_updated_at on public.user_keys;
create trigger user_keys_touch_updated_at
  before update on public.user_keys
  for each row execute function public.touch_user_keys_updated_at();

-- ---------------------------------------------------------------------------
-- Encrypted columns alongside the existing cleartext ones. JSONB so the
-- {v, n, c} envelope from src/lib/crypto/e2ee.ts goes in directly without
-- a server-side encoder.
-- ---------------------------------------------------------------------------

alter table public.chat_turns add column if not exists content_enc jsonb;
alter table public.synthesize_notes add column if not exists body_enc jsonb;
alter table public.why_open_notes add column if not exists body_enc jsonb;

-- Drop the NOT NULL on cleartext columns so new (encrypted) rows can be
-- written without a plaintext fallback. App layer enforces "exactly one of
-- {content, content_enc} is set"; we deliberately don't enforce that in
-- SQL because the encrypt-on-first-login migration transitions rows with
-- both set briefly.
alter table public.chat_turns alter column content drop not null;
alter table public.synthesize_notes alter column body drop not null;
alter table public.why_open_notes alter column body drop not null;
