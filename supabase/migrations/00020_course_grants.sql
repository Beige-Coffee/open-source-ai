-- Open-Source AI Stack: course schema grants (follow-up to 00010)
--
-- 00010 created the tables and the RLS policies, but did not GRANT base
-- SQL privileges to the `authenticated` and `anon` roles. In Supabase
-- Postgres, RLS policies are evaluated only AFTER the underlying table
-- grants have been checked. Without these grants, every authenticated
-- write returns 42501 ("permission denied for table ...") regardless
-- of what the RLS policy says.
--
-- Apply via the Supabase SQL editor or `supabase db push`.

-- profiles
grant select, insert, update, delete on public.profiles to authenticated;

-- module_progress
grant select, insert, update, delete on public.module_progress to authenticated;

-- synthesize_notes
grant select, insert, update, delete on public.synthesize_notes to authenticated;

-- why_open_notes
grant select, insert, update, delete on public.why_open_notes to authenticated;

-- chat_turns (RLS in 00010 omits an UPDATE policy on purpose; this matches it.)
grant select, insert, delete on public.chat_turns to authenticated;
