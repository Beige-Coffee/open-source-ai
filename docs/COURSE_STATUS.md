# Course build status (handoff for next agent)

**Last updated**: 2026-05-18, end of session 2.

## CRITICAL BLOCKER (open as of session 2 end)

The 00010 migration is missing GRANTs to the `authenticated` role. Every
write from a logged-in user (synthesize_notes, why_open_notes,
module_progress, chat_turns) and reads on `profiles` return Postgres
42501 ("permission denied for table ..."). The prior session's claim
that "the course works in this sense ... persists to Supabase" was
never verified end-to-end; the writes were `await`ed but errors not
surfaced.

Fix written but NOT yet applied: `supabase/migrations/00020_course_grants.sql`.
Austin needs to paste it into the Supabase SQL editor (or
`supabase db push` if the CLI is linked); the three keys in his `.env`
do not allow remote DDL.

Until this is applied, all logged-in writes silently fail. Anonymous
flows still work since they don't hit Supabase. Build still passes.

A test user (`test-notes-flow@example.com`,
id `57d6c8a6-4a48-4ead-a708-2648f87aad66`) was created in this session
for verification; delete it after the grants are applied and Personal
Notes is smoke-tested.

This doc captures what's BUILT, what's PARTIAL, and what's PENDING for
the self-paced course at `/learn`. The design lives at
[docs/COURSE.md](COURSE.md). Read that FIRST for locked decisions; this
doc is the implementation snapshot.

## TL;DR

Build passes end-to-end. Foundation (Phases 1-5) is shipped. The
course works in the sense that: a user can sign up, log in, walk
through any module's Read phase, advance to Probe, have a Socratic
conversation with the agent (BYOK Anthropic/OpenRouter), and the
agent's `<PROBE_COMPLETE/>` token triggers an advance button.
Compare / Why-Open / Synthesize phases all render but the agent's
behavior in those phases hasn't been hand-tested.

What's missing is the take-home artifact (Personal Notes export),
the profile dashboard, the cross-reference sidebars, the anonymous
localStorage fallback, the module-aware agent context, the
why_open auto-save, and the `/about` rewrite. Roughly 6-10 days of
focused work remains.

## What's built (verified to compile)

### Infrastructure

- `astro.config.mjs` — switched from static-only to **hybrid SSR via
  `@astrojs/vercel`** (`output: "static"` + per-route
  `export const prerender = false` for `/learn/*` and `/api/*`).
- `supabase/migrations/00010_course_initial.sql` — 5 tables + RLS
  policies + auto-profile-create trigger. **Migration has been run
  against Austin's Supabase project (`hbbafcelrnyhtixkkcci`)**;
  schema is live.
- `src/lib/course/supabase.ts` — server + browser Supabase clients.
  Graceful degradation when env vars are missing.
- `src/middleware.ts` — loads session into `Astro.locals.user` for
  every SSR request.
- `src/env.d.ts` — typed `Astro.locals` (supabase + user).
- `.env.example` — committed with PUBLIC_SUPABASE_URL +
  publishable key pre-filled (both safe to commit).
- Austin has his local `.env` configured.

### Auth flow

- `src/pages/learn/login.astro` — email/password sign in via Supabase.
- `src/pages/learn/signup.astro` — email/password sign up. Shows
  email-confirmation notice unless that's disabled in Supabase.
- `src/pages/api/auth/logout.ts` — POST endpoint that signs the user
  out and redirects to `/learn`.

### Course shell

- `src/lib/course/modules.ts` — the 15-module curriculum registered
  with order, slug, title, type (core/meta/capstone), layer_slugs,
  one_liner, compare_axis_label, compare_anchors. Helpers:
  `MODULE_BY_SLUG`, `nextModule`, `prevModule`, `nextPhase`,
  `phaseLabel`, `PHASE_ORDER`.
- `src/pages/learn/index.astro` — course landing. Lists 15 modules,
  shows a login/signup banner for anonymous users and an
  email/logout/profile bar for logged-in users.
- `src/pages/learn/[module].astro` — per-module page. 60/40 split:
  ~60% left for phase-aware content (Read phase pulls the full
  `layer.mdx` + 5 glossary entries for that layer; other phases
  render placeholders that say "see the right-side panel"); ~40%
  right for the `CoursePanel` React island.
- `src/pages/api/course/advance.ts` — POST endpoint for the Read →
  Probe transition.

### Course agent (Phase 5)

- `src/lib/course/prompts.ts` — **per-phase system prompts**.
  - **Probe**: Socratic; asks questions, refuses to answer.
  - **Compare**: walks the locked `compare_anchors` per module;
    refuses to fill cells.
  - **Why-Open**: rejects vague answers, probes for concrete
    mechanisms.
  - **Synthesize**: mostly silent; final-check pass when learner
    indicates done.
  - Each phase emits a `<PHASE_COMPLETE/>` token when the learner
    has earned advancement.
- `src/components/CoursePanel.tsx` — React island, ~370 lines.
  Reuses existing `useSettings` (BYOK), `makeClient`, `streamText`,
  `TOOLS`, `executeTool` from the reference-site chat. Loads prior
  `chat_turns` on mount; persists new turns to Supabase. Phase-aware:
  Probe/Compare/Why-Open render as chat UI; Synthesize renders as a
  textarea with debounced save to `synthesize_notes`.

### Surrounding work

- Nav.astro + Footer.astro have `/learn` links.
- `src/pages/privacy.astro` — full plain-English privacy policy.
- Build: `npm run build` passes clean. 248 pages generated, including
  per-module routes via SSR.
- `docs/COURSE.md` — design doc with all locked decisions.

## Known limits in the shipped v1

These were called out at the end of session 1. Treat them as
backlog, not bugs (they reflect honest scope cuts).

1. **Anonymous-user writings are not persisted.** Anonymous users
   can read modules and use the agent (BYOK key still required) but
   their Why-Open / Synthesize writings live in React state only.
   Tab close loses them. Per the locked design, this should fall
   back to localStorage with a signup-flow restore.
2. **Why-Open answers don't auto-save to `why_open_notes`.** The
   substantive answer is buried in `chat_turns`. The Personal Notes
   doc won't pull it from there. Needs an explicit "save my answer"
   button at the end of Why-Open, OR auto-extraction of the user's
   last substantive turn.
3. **Agent has no memory of prior modules.** The Sovereignty
   capstone module (#15) was designed to reference what the learner
   wrote in earlier modules. Currently the system prompt for any
   module is independent. Fix: load `synthesize_notes` +
   `why_open_notes` from earlier modules, inject summaries into the
   per-module system prompt.
4. **Compare phase is just chat.** Not a structured table-fill UI.
   The agent prompts comparisons in dialogue; the learner answers
   freeform. Lower priority polish.
5. **Module-page Read phase is a raw dump.** Just renders the full
   `layer.mdx` plus 5 glossary entries. Per the locked decision
   ("curate from existing material") it should be a more careful
   selection of excerpts. Editorial work, one pass per layer.

## What's PENDING (in priority order)

### 1. Personal Notes view + Markdown + PDF export — BUILT, smoke test deferred

Code shipped:
- `src/lib/course/notes.ts` — loaders + Markdown serializer
- `src/pages/learn/profile/notes.astro` — HTML view + download buttons
- `src/pages/api/notes/markdown.ts` — Markdown download endpoint
- `src/lib/course/pdf.tsx` — `PersonalNotesPdf` (react-pdf)
- `src/pages/api/notes/pdf.ts` — PDF download endpoint

Build verified clean. End-to-end smoke test deferred until the
grants migration lands (see CRITICAL BLOCKER above).

### 2. Profile dashboard at `/learn/profile` — BUILT

- `src/pages/learn/profile.astro` — SSR page with progress across
  all 15 modules (phase per module + jumped/S/W badges), display-name
  edit, fast/deep toggle, logout, account delete.
- `src/pages/api/account/profile.ts` — POST handler for
  display_name + pass_choice changes.
- `src/pages/api/account/delete.ts` — POST handler that uses the
  service-role admin client to delete `auth.users(id)` (cascades to
  all course tables). Requires `confirm` field == user email.

### 3. Why-Open auto-save — BUILT

- `src/pages/api/course/save-why-open.ts` — POST endpoint.
- `src/components/CoursePanel.tsx` — when the agent emits
  `<WHY_OPEN_COMPLETE/>`, a "Save my answer for my Personal Notes"
  button appears. Takes the last user turn, posts to the endpoint.
  For anonymous users it persists to localStorage instead.

### 4. Cross-reference sidebars on module pages — BUILT

- `src/components/ModuleSidebar.astro` — predictions, recent news
  (filtered by `layer_buckets`), top funders (focus_layers),
  reading list. Each section collapsible.
- Wired into `src/pages/learn/[module].astro` below the CoursePanel
  in the right-hand aside.
- Empty-state copy when a new layer (e.g. Infrastructure) has no
  data yet.

### 5. Anonymous localStorage fallback + signup restore — BUILT

- `src/lib/course/anonStorage.ts` — versioned localStorage helpers
  for anonymous chat turns + synth + why-open bodies.
- `CoursePanel.tsx` — hydrates from localStorage when `userId` is
  null; persists through `recordTurn`, `saveSynth`, `saveWhyOpen`.
- `src/pages/api/course/restore-anon.ts` — promotion endpoint;
  idempotent upserts for notes, plain inserts for chat turns.
- `signup.astro` + `login.astro` — redirect to `/learn?restore=anon`
  on success. A small inline script in `learn/index.astro` POSTs
  the localStorage payload to the restore endpoint, then clears
  localStorage and strips the query param.

### 6. Module-aware agent context — BUILT

- `prompts.ts` — `buildSystemPrompt()` now takes a `priorWritings`
  array; a "EARLIER WRITINGS BY THIS LEARNER" block is appended
  (capped to the most recent 5 modules) so capstone-style
  references can quote the learner's own text.
- `[module].astro` — server-loads `synthesize_notes` +
  `why_open_notes` for all modules with order < current and
  passes them to CoursePanel as a prop.

### 7. Missing /api/course/advance.ts endpoint — FIXED

`[module].astro` references `/api/course/advance?module=<slug>` for
the Read → Probe form submit; the endpoint did not exist on disk.
Added `src/pages/api/course/advance.ts` that upserts the
`module_progress` row to phase=probe and redirects back.

### 8. /about rewrite — DONE

- `src/pages/about.astro` — added a "Data posture (per feature)"
  section that replaces the retired site-wide "pure BYOK, no PII,
  no server" claim with a per-feature breakdown and a link to
  `/privacy`.
- `src/pages/index.astro` — homepage copy now reads "Ten core
  layers" (was "Nine") and clarifies BYOK is the chat agent only;
  `/learn` runs against a logged-in profile.
- `src/pages/stack/index.astro` — same nine-to-ten fix.

### 9. ChatBubble suppression on /learn (decision #12) — FIXED

`BaseLayout.astro` now renders the floating `ChatBubble` only when
the path does NOT start with `/learn`. CourseModule pages use the
dedicated `CoursePanel` and were previously double-mounting the
bubble.

### 10. Still deferred

- **Per-module Read passage curation (editorial)**: still a raw
  layer.mdx dump + first 5 glossary entries. Carrying.
- **Compare structured table UI**: low priority; chat UI works.
- **End-to-end smoke test of the full course flow**: blocked on
  grants migration.

## Environment / Deploy

- **Supabase project**: `hbbafcelrnyhtixkkcci.supabase.co`. URL
  pre-filled in `.env.example`. Migration has been run.
- **Vercel**: project exists at vercel.com under Austin's account.
  Deployed from `main`. Domain: open-source-ai.tech.
- **Vercel env vars**: as of session-end, Austin may or may not
  have set `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` in the Vercel dashboard. **VERIFY
  BEFORE DEPLOYING.** Local dev is wired.
- **Email confirmation**: Austin may have left Supabase's default
  email-confirmation flow enabled. If signup feels broken locally,
  disable it via Supabase dashboard → Authentication → Sign In/Up
  → Email → "Confirm email" toggle.

## Repo conventions (read these before writing prose)

These are universal for Austin's public-facing work:

- **No em dashes anywhere.** Use commas, colons, semicolons,
  parentheses, or two sentences.
- **Banned buzzwords**: `delve, tapestry, transformative, robust,
  leveraging, utilize, fascinating, landscape (as verb-y filler),
  elevate, unlock, paradigm, ecosystem (when vague)`.
- **Neutral observational voice**. Read like Bloomberg.
- **Citation discipline**: every specific number / dollar / date /
  factual claim needs a source URL inline, OR a typed schema
  field, OR a populated `sources` array. Enforced by
  `scripts/lint-citations.mjs` on prebuild.

## Audit-system constraint

A claims-verification audit agent runs in parallel sessions. It
writes to:
- `audit/CLAIMS_LEDGER.md`
- `audit/extract/*` and `audit/verify/*` mjs files
- `sources/` (snapshot store)

**Do NOT touch any file under `audit/` or `sources/` unless the
audit agent has flushed all in-flight work AND Austin explicitly
asks**. Before any commit: run `git status`; if `audit/CLAIMS_LEDGER.md`
or `sources/` show modifications you didn't make, ping Austin and
wait.

The audit's JSON schemas in `audit/schemas/*.json` MAY need an
update if the layer enum changes; those edits are allowed with
explicit Austin permission. Previous session added `infrastructure`
to those enums.

## Verification: how to know the course is working

After making changes, verify:

```bash
npm run lint          # citation linter + glossary linter
npm run build         # full Astro build, must pass
npm run dev           # then test /learn flow in the browser
```

Smoke-test sequence:
1. Visit http://localhost:4321/learn — landing renders
2. Log in (or sign up) — redirects to /learn as authenticated user
3. Visit /learn/infrastructure — Read phase renders with prose
4. Click "I've read it · move to Probe →" — page reloads, Probe phase active
5. CoursePanel auto-starts; agent emits a question; you reply; agent continues
6. After several turns, agent emits `<PROBE_COMPLETE/>`; "Continue to Compare →" button appears
7. Click through Compare → Why-Open → Synthesize → Complete
8. Check Supabase Table Editor: `chat_turns`, `synthesize_notes`,
   `module_progress` should all have rows

If signup loops back to login without authenticating, email
confirmation is probably still on. Disable it for local testing.

## What docs to read

- `CLAUDE.md` — site-wide schema and architecture (canonical)
- `docs/COURSE.md` — course design decisions (canonical)
- This file (`docs/COURSE_STATUS.md`) — implementation snapshot
- `data/layers.yaml` — the 10+5 layer taxonomy
- `src/lib/course/modules.ts` — the 15-module curriculum registry
- `src/components/CoursePanel.tsx` — the course agent (read this
  before changing agent behavior)
- `src/lib/course/prompts.ts` — per-phase agent system prompts
