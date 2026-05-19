# Handoff prompt for the next agent

Paste the block below to the new agent. It's self-contained:
points the agent at the canonical docs, the constraints, and the
specific first task.

---

I'm Austin. You're picking up a build in flight on my public reference site at `/Users/austinv2/code/open-source-ai-stack/` (deployed to open-source-ai.tech).

The site is a curated educational map of the open-source AI stack: 10 production-pipeline layers + 5 cross-cutting meta-layers, with projects, grants, funders, news, predictions, glossary, and an in-site chat agent grounded in the wiki. Audience-of-two for now (me + one other person); not optimized for public traffic.

I'm building a self-paced Socratic course at `/learn` on top of the existing reference site. The course walks the stack bottom-up from infrastructure to protocols (15 modules total) and produces a personal "My Open-Source AI Stack Notes" document at the end. We did the full design last session and built Phases 1-5 (foundation + course agent). I want you to pick up the remaining 6-10 days of work.

## Read first, in this order

1. **`CLAUDE.md`** — canonical schema doc for the site. Read top to bottom. Most important section for you: "10 + 5 taxonomy", "Editorial rules", "Citation discipline".

2. **`docs/COURSE.md`** — the course design doc. All 14 + 11 = 25 locked decisions are in there. Don't re-litigate them; that's where the architectural choices are recorded.

3. **`docs/COURSE_STATUS.md`** — what's built, what's partial, what's pending. The implementation snapshot.

4. **`src/lib/course/modules.ts`** — the 15-module curriculum registry.

5. **`src/components/CoursePanel.tsx`** — the React island that drives the course agent. Read it before changing agent behavior.

6. **`src/lib/course/prompts.ts`** — per-phase system prompts.

## Hard constraints

- **Voice**: no em dashes anywhere. No buzzwords from this list: delve, tapestry, transformative, robust, leveraging, utilize, fascinating, elevate, unlock, paradigm, ecosystem-when-vague, landscape-as-filler. Neutral observational voice. Bloomberg, not marketing.
- **Citation discipline**: every specific number / dollar / date / factual claim needs a source URL inline OR a typed schema field OR a populated `sources` array. Build fails otherwise (`scripts/lint-citations.mjs` runs on prebuild).
- **Audit-system constraint**: another agent runs claims-verification audits in parallel sessions. Files it writes to are off-limits: `audit/CLAIMS_LEDGER.md`, `audit/extract/*`, `audit/verify/*`, `sources/`. Before any commit, run `git status` and if `audit/` or `sources/` show changes you didn't make, ping me before committing. The schemas in `audit/schemas/*.json` may need an "infrastructure" enum addition when adding new layer slugs; ask first.
- **No PII claim is dead**: the site used to say "Pure BYOK, no PII, no server" but `/learn` breaks that. Don't re-add the claim anywhere.

## Working style I prefer

- **Ask Q&A-style with recommendations** when you hit a meaningful judgment call. One question at a time. Format: question + 3-4 numbered options + the one you'd recommend first labeled "(Recommended)".
- **Skip the recap padding.** Get to the work.
- **No verbose tool-call narration**; do the work and report results.
- **Honest assessments over reassurance.** If something I asked for is a bad idea or risky, say so. Don't ship around limitations silently; surface them.
- **Use the TodoWrite tool** to track multi-step work. Mark items as you complete them.
- **Stop and check in** at natural checkpoints. Big features get verified before moving on.

## Current state

Build passes (`npm run build`). Foundation through Phase 5 is shipped. The course works in this sense: a logged-in user can sign up, log in, visit `/learn/infrastructure`, read the Read phase, click "I've read it" to advance to Probe, have a Socratic conversation with the course agent (BYOK Anthropic or OpenRouter key from `/settings`), see the agent emit `<PROBE_COMPLETE/>`, and click an advance button to continue through Compare → Why-Open → Synthesize → Complete. Chat turns persist to Supabase `chat_turns`. Synthesize body persists to `synthesize_notes`. Module progress persists to `module_progress`.

The Supabase schema is live (`hbbafcelrnyhtixkkcci.supabase.co`), the migration has been run, my local `.env` is configured.

## Where I was when context ran out

I was mid-flight on the FIRST pending item from `docs/COURSE_STATUS.md`: the Personal Notes view + Markdown + PDF export. I wrote these five files but didn't verify the build with them in place:

- `src/lib/course/notes.ts` — `loadPersonalNotes()` + `notesToMarkdown()` helpers
- `src/pages/learn/profile/notes.astro` — HTML view with download buttons
- `src/pages/api/notes/markdown.ts` — Markdown download endpoint
- `src/lib/course/pdf.tsx` — `PersonalNotesPdf` React component using `@react-pdf/renderer`
- `src/pages/api/notes/pdf.ts` — PDF download endpoint using `renderToBuffer()`

## Your first task

1. Run `npm run build`. If it fails on anything I wrote (most likely something around `@react-pdf/renderer` + JSX in `.tsx`), diagnose and fix.
2. If build passes, run `npm run dev` and test the Personal Notes flow end-to-end:
   - Log in (if you don't have an account, sign up; disable email confirmation in Supabase if it's still on)
   - Visit any module, complete (even minimally) the Synthesize phase
   - Visit `/learn/profile/notes`
   - Click "Download Markdown" → file downloads correctly
   - Click "Download PDF" → file downloads correctly
3. Report what works and what's broken.

## After Personal Notes is verified, the pending work in priority order

1. **Profile dashboard at `/learn/profile`** (currently 404). Progress across all 15 modules, fast/deep toggle, display-name edit, logout, account delete. ~1-2 days.
2. **Why-Open auto-save to `why_open_notes`** so Personal Notes pulls actual answers, not chat history. ~0.5 day.
3. **Cross-reference sidebars** on module pages (predictions, news, funders, readings per layer). ~1-2 days.
4. **Anonymous localStorage fallback** + signup-flow restore so anonymous course-preview actually works. ~1 day.
5. **Module-aware agent context** so the Sovereignty capstone references prior modules. ~0.5 day.
6. **Per-module Read passage curation** (editorial pass). ~5-7 days if done well; can be staged.
7. **`/about` rewrite** to drop the no-PII claim. ~30 minutes.
8. **Compare structured table UI** (low priority). ~1 day.

Details on each item live in `docs/COURSE_STATUS.md` under "What's PENDING".

## Verification

After any change:

```bash
npm run lint          # citation + glossary linters
npm run build         # full build must pass
npm run dev           # then smoke-test in browser
```

Smoke-test sequence is in `docs/COURSE_STATUS.md` under "Verification".

## Communication

When you hit a meaningful judgment call (architecture decision, scope cut, anything that locks something in for the future), pause and ask one question with 3-4 recommended options. For mechanical work, just do it and report results.

When you finish a unit of work, give me a concise honest status. Don't pad with what you didn't do; tell me what's working, what's broken, what's next.

Now go read the docs and start with the verification step.

---

End of prompt.
