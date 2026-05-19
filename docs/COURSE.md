# Self-Paced Course: design

This is the canonical design document for the self-paced course at
`/learn`. It captures decisions locked in May 2026 with Austin so a
future agent (or future-Austin) can resume the build cleanly.

## Goal

A Socratic-driven, self-paced course that walks a learner up the
Open-Source AI Stack from infrastructure to protocols, asks them to
think rather than memorize, and produces a personal artifact (their
own notes on the stack in their own words) at the end.

The course is intended for a reader who wants a structured path
through the material the rest of the site already covers as a
reference. It is not a replacement for the reference site; it sits
alongside it.

## Audience

Initially audience-of-two (Austin + one other person). The design
should scale up if/when the site goes broader, but should not be
over-engineered for an audience that does not yet exist. Architecture
choices that protect against future scale (real auth, real backend)
are accepted; choices that exist purely for marketing or analytics
are not.

## Locked design decisions

### 1. Build the course

Yes. Locked.

### 2. Scope: full course at `/learn` with profile + two depth levels

Not an MVP. Dedicated `/learn` section with profile, per-module
progress, two depth tiers (fast and deep), end-of-course artifact.
Locked.

### 3. Auth + backend: real (Supabase)

Logged-in users with cross-device progress. Not localStorage. The
"pure BYOK, no PII, no server" posture that holds for the rest of
the site explicitly does not hold for `/learn`. Trade-off accepted.
Locked.

### 4. Hosting: Astro hybrid (SSR for `/learn`, static everywhere else)

Single project, single deploy. The existing static site continues
to ship as static HTML; `/learn/*` routes are SSR'd via the Vercel
adapter. Auth + DB calls happen in Vercel serverless functions.
Locked.

### 5. Auth + DB stack: Supabase

Supabase Postgres + Supabase Auth + row-level security. Single
vendor. Email/password and one or more OAuth providers (specifics
in the Open Questions section). Locked.

### 6. Curriculum: 15 modules, strict bottom-up, meta-layers slotted

The course walks the stack from infrastructure to protocols, with
meta-layers inserted where they first become load-bearing.
Sovereignty-decentralization sits as the capstone synthesis module
at the end. The "why open source matters here" thread runs through
every module and accumulates into the user's exit essay.

| Order | Slug | Type | Compare axes (anchor projects/concepts) |
|---|---|---|---|
| 01 | infrastructure | core | hyperscaler vs sovereign vs decentralized vs neocloud |
| 02 | silicon | core | NVIDIA Hopper vs AMD MI300X vs Tenstorrent vs RISC-V cores |
| 03 | compute | core | NVLink fabric vs Ethernet RDMA; spot vs reserved |
| 04 | data | core | The Pile vs RedPajama vs FineWeb vs Dolma (license + scale + filtering) |
| 05 | training | core | Megatron vs DeepSpeed vs Axolotl vs Unsloth (parallelism + UX) |
| 06 | weights | core | Llama vs Qwen vs DeepSeek vs Gemma vs OLMo (license posture) |
| 07 | evaluation | meta | MMLU vs HumanEval vs SWE-Bench vs ARC-AGI vs HLE |
| 08 | governance | meta | Apache 2.0 vs Llama Community vs Gemma Terms vs OSAID |
| 09 | runtime | core | vLLM vs SGLang vs llama.cpp vs TensorRT-LLM (openness + perf + deploy) |
| 10 | identity-trust | meta | Intel TDX vs AMD SEV-SNP vs NVIDIA Confidential Compute vs ZKML |
| 11 | retrieval-memory | core | BM25 vs dense vs ColBERT vs hybrid; LanceDB vs Qdrant vs pgvector |
| 12 | agents | core | LangChain vs LlamaIndex vs Goose vs AutoGen (control flow + tools) |
| 13 | safety-guardrails | meta | Llama Guard vs NeMo Guardrails vs Constitutional AI |
| 14 | protocols | core | MCP vs A2A; x402 vs L402 (payments) |
| 15 | sovereignty-decentralization | capstone | hyperscaler-rented vs sovereign-state vs decentralized vs local-first |

Locked.

### 7. Per-module flow: Read → Probe → Compare → Why-Open → Synthesize

Five phases per module, in order:

1. **Read**: focused passage drawn from the layer's `layer.mdx` plus
   a curated set of glossary entries. UI renders the passage; no
   agent involvement in this phase. 2-5 minutes fast pass; full prose
   plus primary sources deep pass.

2. **Probe**: Socratic dialogue with the course agent. Agent asks
   questions, refuses to give summaries or answers. Grounded via the
   existing chat tools (`read_layer`, `read_glossary`, `read_project`,
   etc.). User must demonstrate understanding through their answers
   before advancing. 5-15 minutes fast pass; 20-45 minutes deep pass.

3. **Compare**: agent presents a comparison table with the per-module
   axes from the curriculum table above. User fills in cells (or
   answers free-text comparison questions). Grounded via
   `find_projects`. Agent refuses to fill the table for the user.
   3-10 minutes fast pass; 15-30 minutes deep pass.

4. **Why-Open**: agent asks the layer-specific framing of "why does
   open source matter HERE." User writes their answer. Agent probes
   weak answers ("freedom" / "transparency" alone get pushback).
   Accumulates into the user's exit essay. 2-5 minutes fast pass;
   10-20 minutes deep pass with required citations.

5. **Synthesize**: user writes a paragraph (fast) or multi-paragraph
   (deep) summary of the layer in their own words. Agent only
   intervenes at the end to flag missing concepts ("you didn't
   mention X which appeared earlier; intentional?"). Saved as the
   user's module summary; accumulates into the exit essay. 1-2
   minutes fast pass; 5-15 minutes deep pass.

Total per module: 12-25 minutes fast pass; 30-90 minutes deep pass.

Locked.

### 8. Depth split: same 15 modules, different phase rigor

Both fast pass and deep pass go through all 15 modules. The
difference is rigor per phase:

| Phase | Fast pass | Deep pass |
|---|---|---|
| Read | 1-2 paragraphs from layer.mdx + 2 glossary cards | Full layer.mdx + 5+ glossary entries + 1-2 sourced primary readings |
| Probe | 3-4 questions, agent moves on after acceptable answers | 8-12 questions, agent probes harder, citation grounding required |
| Compare | 2 axes, structured table-fill | 4 axes + free-text reasoning per cell |
| Why-Open | 1 short paragraph | Multi-paragraph with at least 2 citations |
| Synthesize | 1 paragraph in user's own words | Multi-paragraph with required citation markers |

User picks fast or deep at sign-up; can switch at any point.

Locked.

### 9. Take-home artifact: "My Open-Source AI Stack Notes"

User's accumulated Synthesize + Why-Open writings get rendered as a
single document at `/learn/profile/notes`. Downloadable as Markdown
and PDF. Title: `My Open-Source AI Stack Notes` + display name +
completion date. The user's own essay-form theory of the stack,
their words. This replaces the "certificate of completion" pattern.

Locked.

### 10. Cross-references: heavy integration with rest of site data

Every module is a hub onto the broader site data:

- **Read**: pulls layer.mdx prose + inline glossary entries (existing
  `<G>` component) for the read passage.
- **Sidebar** (per module): active predictions at this layer, recent
  news items in this layer's bucket, top funders at this layer, full
  reading list for this layer.
- **Compare**: queries `find_projects(layer=X)` live; the comparison
  table draws from the same source-of-truth the rest of the site
  uses.
- **Footer** (per module): "further reading" pulled from
  `reading-lists.yaml` for this layer.

The course agent has access to the same toolset as the existing chat
agent (`find_grants`, `find_funders`, `find_projects`, `find_readings`,
`read_layer`, `read_funder`, `read_grant`, `read_project`,
`find_glossary`, `read_glossary`, `today_news`, `search`).

Locked.

### 11. Site posture language: drop the "no PII" claim entirely

The `/about` page currently states "Pure BYOK, no PII, no server."
That stops being true once `/learn` ships. Per-feature truth replaces
the site-wide claim:

- **Chat agent**: BYOK, no server proxy.
- **Daily news**: scheduled agent updates content; no user data.
- **Course at `/learn`**: requires a profile (email + password or
  OAuth) to track progress; progress data stored at Supabase.
- A privacy policy at `/privacy` documents the specifics.

Locked.

### 12. Course agent: dedicated panel separate from ChatBubble

`/learn/<module>` routes render their own dedicated `CoursePanel`
React island. The floating `ChatBubble` does not appear on `/learn`
routes. Outside `/learn`, ChatBubble continues to work as today
(Answer / Socratic modes).

Locked.

### 13. Progression rules: linear default, skip-ahead allowed with "jumped" marker

The course dashboard prominently shows the next module in sequence
(module N+1 where N is the user's highest in-order completed
module). The user can click any module on the curriculum overview
and start it; modules completed out of sequence are marked "jumped"
rather than "completed in sequence" in the progress view.

Locked.

### 14. Anonymous preview: entire course readable anonymously

A visitor can hit `/learn/<module>` and read the Read passage, walk
through the Probe phase, the Compare phase, the Why-Open phase, and
the Synthesize phase without logging in. Their writings exist
client-side only; tab close loses them. A persistent banner on `/learn`
routes nudges visitors to log in if they want to save progress, sync
across devices, and generate the Personal Notes exit doc. Login is
purely for tracking + the take-home artifact.

Locked.

## Implementation plan

### Repo structure

```
open-source-ai-stack/
  astro.config.mjs                # add @astrojs/vercel adapter, hybrid mode
  docs/
    COURSE.md                     # this document
  src/
    content.config.ts             # add `course_modules` content collection
    content/
      course/
        01-infrastructure.mdx
        02-silicon.mdx
        ...
        15-sovereignty.mdx
    lib/
      course/
        progress.ts               # Supabase progress queries + types
        phases.ts                 # phase definitions + transitions
        prompts.ts                # per-phase course-agent system prompts
        notes.ts                  # personal notes accumulation + export
        supabase.ts               # Supabase client (server + browser)
    components/
      CoursePanel.tsx             # the course chat panel (React island)
      CourseModuleNav.astro       # next/prev module + phase indicators
      CourseDashboard.tsx         # user's overall progress view
      CourseLogin.astro           # Supabase Auth UI wrapper
    pages/
      learn/
        index.astro               # course landing + curriculum overview
        login.astro               # auth entry point
        signup.astro              # registration entry point
        profile.astro             # dashboard + Personal Notes view
        [module].astro            # per-module page, SSR, all 15 modules
      api/
        progress.ts               # POST / GET module progress
        notes.ts                  # POST / GET user writings
      privacy.astro               # privacy policy page
```

### Database schema

```sql
-- auth.users provided by Supabase

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  pass_choice text check (pass_choice in ('fast', 'deep')) default 'fast',
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table module_progress (
  user_id uuid references auth.users(id) on delete cascade,
  module_slug text not null,
  phase text check (phase in ('read', 'probe', 'compare', 'why_open', 'synthesize', 'complete')) not null,
  phase_started_at timestamptz default now(),
  phase_completed_at timestamptz,
  jumped boolean default false,
  primary key (user_id, module_slug)
);

create table synthesize_notes (
  user_id uuid references auth.users(id) on delete cascade,
  module_slug text not null,
  body text not null,
  updated_at timestamptz default now(),
  primary key (user_id, module_slug)
);

create table why_open_notes (
  user_id uuid references auth.users(id) on delete cascade,
  module_slug text not null,
  body text not null,
  updated_at timestamptz default now(),
  primary key (user_id, module_slug)
);

create table chat_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  module_slug text not null,
  phase text not null,
  role text check (role in ('user', 'assistant', 'tool')) not null,
  content text not null,
  turn_index int not null,
  created_at timestamptz default now()
);

-- Row-level security on every table: user_id = auth.uid()
```

### Course agent system prompt (per phase)

Each phase has a tightly scoped prompt that constrains the agent's
behavior to that phase's purpose. The system prompt is built from:

1. The COMMON_HEADER from the existing prompts.ts (taxonomy, voice,
   citation markers, grounding protocol).
2. A phase-specific addendum that defines what the agent will and
   will not do in this phase.
3. The current module's metadata (slug, title, anchor projects, etc.).
4. The user's prior answers from earlier phases in this module
   (so the agent's questions can build on them).

**Read phase**: agent is not active. UI renders passage.

**Probe phase**: "You are walking the learner through the
{module_title} module. Ask Socratic questions one at a time. Do not
summarize. Do not give answers. When the learner answers, probe
further or move on if the answer demonstrates understanding. Use the
tools (`read_layer`, `read_glossary`, `read_project`) to ground any
references you make; do not rely on memory. Once the learner has
demonstrated understanding of the core concepts (typically 3-4 turns
fast pass, 8-12 turns deep pass), say 'Ready to compare? Let me know
when you want to move on' but do not push them past their pace."

**Compare phase**: "Present the comparison table for this module:
{axes}. Ask the learner to fill each cell with their reasoning. Use
`find_projects(layer={slug})` to ground the projects available at
this layer. When the learner fills a cell, probe their reasoning;
ask 'why' twice before accepting. Do not fill cells for the learner.
Surface specific tradeoffs when the learner is missing them."

**Why-Open phase**: "Ask the learner: 'Why does open source
specifically matter at this layer? Not as an abstract value, but as
a concrete mechanism.' Reject vague answers ('freedom',
'transparency') and ask for specific mechanisms. Probe with: who
exactly does open source protect, against what specifically, in what
scenario? When the learner produces a substantive answer, save it
and move on."

**Synthesize phase**: agent is silent until the learner indicates
they have finished. Then the agent does a final check: "Looking
back at the {synthesize_body}, are there concepts that came up
earlier (in the Read or Probe phase) that you decided not to
include? Are those intentional?" The answer is not required to be
written back; the prompt is just for reflection.

### Phase progression logic

Each phase transition is gated:

- **Read → Probe**: user clicks "I've read it" or scrolls to the
  bottom of the passage.
- **Probe → Compare**: agent decides the learner has answered enough
  questions adequately (signals: agent's own assessment in JSON tool
  output, or N successful turns).
- **Compare → Why-Open**: user has filled the comparison table or
  answered the comparison questions.
- **Why-Open → Synthesize**: user has written at least the minimum
  word count for their pass (50 words fast, 200 words deep).
- **Synthesize → Complete**: user has written at least the minimum
  word count and confirmed they want to advance.

Anonymous users can transition through phases but their state lives
in localStorage and is wiped on tab close. Logged-in users have
progress saved server-side.

### Personal Notes generation

`/learn/profile/notes` queries the user's `synthesize_notes` and
`why_open_notes` tables, orders by module order, renders as a single
HTML document. Download options:

- **Markdown**: server-side string generation, returns as `.md` file.
- **PDF**: client-side `window.print()` with a print stylesheet, or
  server-side via puppeteer / @react-pdf/renderer (open question
  below).

Format:

```markdown
# My Open-Source AI Stack Notes

[Display Name], completed [Date]

This is my own summary of the open-source AI stack, written as I
worked through the course at open-source-ai.tech/learn.

---

## Layer 1: Infrastructure

### My summary

[user's synthesize note]

### Why open source matters here

[user's why-open answer]

---

## Layer 2: Silicon

...
```

### Scope estimate

| Phase | Days |
|---|---|
| Supabase project + schema + RLS + Astro Vercel adapter setup | 1-2 |
| Auth flow: signup, login, password reset, OAuth | 1-2 |
| `/learn` landing + course dashboard + curriculum overview | 1-2 |
| Per-module page layout: phase ribbon, sidebar, content area | 2-3 |
| Course panel React island + per-phase system prompts | 2-3 |
| Phase progression logic + progress API + anonymous fallback | 2-3 |
| 15 modules of curriculum content (fast + deep variants, sourced) | 5-7 |
| Personal Notes accumulation + Markdown + PDF export | 1-2 |
| Cross-reference sidebars (predictions, news, grants, readings) | 1-2 |
| Linear-default progression + skip-ahead "jumped" marker | 0.5 |
| Anonymous read-only fallback + login prompts | 0.5 |
| `/about` + `/privacy` rewrite + posture language updates | 0.5-1 |
| Testing + polish + Vercel hybrid deploy config | 1-2 |

**Estimated total: 15-25 days of focused work.** Calendar ~3-5 weeks
given design iteration, especially on curriculum content.

### Risks

- **Curriculum authoring is the long pole.** 15 modules × full
  Read/Probe/Compare/Why-Open/Synthesize per pass × two depth tiers
  is substantial writing. Voice, citations, and non-repetition with
  the existing layer MDX files all matter.
- **Per-phase agent quality.** Getting the Probe agent to refuse to
  answer and the Compare agent to refuse to fill the table requires
  careful system prompt engineering and iteration. Easy to get wrong;
  the user notices immediately.
- **Vercel cold start on `/learn` routes.** SSR introduces a
  ~300-800ms cold-start penalty on first request after idle.
  Acceptable but flag-worthy.
- **Supabase costs at scale.** Free tier covers 50K MAU + 500MB DB.
  Course content is in-repo MDX (not in DB); only progress + notes
  go in DB. Long way from free-tier limits even with broad adoption.
- **Maintenance: curriculum drift from underlying site data.**
  When the taxonomy changes (e.g. adding infrastructure as a new
  layer, as we just did) the course modules may need updates.
  Mitigated by querying live for projects / glossary / predictions;
  static Read passages would drift and need periodic refresh.

## Open questions: answers (locked May 2026)

1. **Supabase project**: Austin has an existing project; will provide
   the project URL + anon key for the local `.env` and Vercel env
   vars. Service-role key stays Vercel-only.
2. **OAuth providers**: Email/password only at launch. No OAuth
   provider config needed. Lower setup, higher signup friction;
   acceptable for audience-of-two.
3. **Vercel deploy**: Currently static-only. Will swap the adapter
   from `@astrojs/vercel/static` (or no adapter) to `@astrojs/vercel`
   hybrid mode. Static pages stay static; `/learn/*` becomes SSR.
4. **Curriculum authoring**: I draft all 15 modules end-to-end (fast
   + deep variants) without intermediate review. Austin does one
   editorial pass at the end. Saves coordination overhead; trusts
   the writer.
5. **PDF export**: Server-side via `@react-pdf/renderer`. Better
   fidelity than `window.print()`; adds a dependency but cleaner
   output for what is meant to be a portfolio-quality take-home.
6. **Privacy policy**: Plain-English doc, ~400 words, drafted by me.
   No attorney review. Honest description of what's collected, where
   stored, who has access, export + deletion paths.
7. **Display name**: Optional at signup; user can set/edit on
   `/learn/profile`. Defaults to email local-part.
8. **Read-phase passages**: Curated from existing `layer.mdx` +
   selected glossary entries. Inherits the reference site's voice
   and audited sources; reduces maintenance.
9. **Anonymous writings**: Auto-stashed in localStorage in real time.
   Signup flow reads localStorage and writes the stashed writings
   into Supabase under the new account on success. Tab close before
   signup still loses them.
10. **Course panel UI**: Fixed sidebar layout. `/learn/<module>`
    pages render as ~60% content + ~40% course chat panel; panel
    always visible on module pages. Matches modern courseware UX.
11. **Existing chat agent cross-talk**: Skip for v1. The Personal
    Notes are course-internal; the floating ChatBubble on
    `/stack/<layer>` doesn't yet reference them.

## Co-evolution

When the underlying site data changes (a new layer is added like
infrastructure was; a project is deprecated; a glossary entry is
renamed), the course needs to follow:

- **Compare phase**: queries data live via tools; flows through
  automatically.
- **Sidebar**: queries data live via the content collections; flows
  through automatically.
- **Read passages**: static MDX; need manual update when the
  underlying material changes.
- **Probe prompts**: static; need manual update when the layer's
  content changes substantially.

A discipline note: when adding or modifying a layer, also review the
corresponding course module's static content.
