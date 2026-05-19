-- Open-Source AI Stack: E2EE cleanup migration (follow-up to 00030)
--
-- Drops the cleartext columns now that all user data has been migrated to
-- ciphertext columns via the encrypt-on-first-login path in
-- src/lib/course/keys.ts:migrateCleartextRowsToCipher.
--
-- DO NOT RUN this migration until you've confirmed:
--   1. Every active user has logged in at least once post-00030 (which
--      triggers migrateCleartextRowsToCipher on first login).
--   2. The following queries return zero rows:
--        select count(*) from chat_turns where content is not null;
--        select count(*) from synthesize_notes where body is not null;
--        select count(*) from why_open_notes where body is not null;
--
-- After applying this migration, any row with a cleartext column set is
-- permanently lost; the column type itself goes away. The app stops
-- referencing the cleartext columns (no fallback path remains).

alter table public.chat_turns drop column if exists content;
alter table public.synthesize_notes drop column if exists body;
alter table public.why_open_notes drop column if exists body;
