# open-source-ai-stack: schema and operations

This is the canonical doc for the open-source-ai-stack repo. It tells
Claude (or any LLM agent) how the data is structured, what the
operations are, what the editorial rules are, and how the in-site chat
agent is grounded in this data. Co-evolve with Austin as conventions
firm up.

The repo follows Karpathy's LLM-wiki pattern (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):
three layers — immutable raw sources (news fetched from RSS feeds),
LLM-maintained structured data (the YAML/MDX files this doc describes),
and the schema doc you are reading now.

## Project context

The site is a living map of the open AI stack: 9 production-pipeline
layers and 5 cross-cutting meta-layers, with the projects, news, grants,
predictions, and reading lists at each. Audience-of-one mode for now:
Austin and one other person; not optimized for public traffic.

The grants section serves a specific reader: someone who used to fund
Bitcoin OSS and is now considering open-source AI. Editorial weight
goes to sovereignty / individual-rights / cypherpunk-adjacent funders;
mainstream funders are present for completeness.

The site is paired with a sibling repo at `/Users/austinv2/code/sovereign-ai-wiki/`
which is Austin's private Karpathy-style wiki feeding the Sovereign AI
Summit (Fall 2026). This repo is the public-facing form.

## The 9 + 5 taxonomy (canonical)

Defined in `data/layers.yaml`. Slugs are stable identifiers used
everywhere.

**9 core layers** (production pipeline, silicon at the bottom, protocols at the top):

1. `silicon` — Chips and ISAs that execute the math
2. `compute` — Where silicon physically runs and gets accessed
3. `data` — Training corpora, open and closed
4. `training` — Tools to pretrain and fine-tune
5. `weights` — Model artifacts and their license tiers
6. `runtime` — Inference engines that serve tokens from weights
7. `retrieval-memory` — Vector databases, embeddings, agent memory, RAG
8. `agents` — Frameworks plus user-facing agent products
9. `protocols` — MCP, A2A, agentic payments, the integration wire

**5 cross-cutting meta-layers**:

1. `evaluation` — Benchmarks, harnesses, leaderboards
2. `governance` — Licensing, definitions, foundations, OSAID
3. `identity-trust` — TEEs, confidential computing, verifiable inference, agent passports
4. `safety-guardrails` — Llama Guard, NeMo Guardrails, sandbox-escape evals
5. `sovereignty-decentralization` — Individual-vs-state framing, decentralized training, local-first patterns

## Directory layout

```
open-source-ai-stack/
  CLAUDE.md             # this file
  README.md             # short human-facing overview
  astro.config.mjs      # Astro 6 config
  package.json
  data/                 # YAML data, source of truth
    layers.yaml
    projects.yaml
    funders.yaml
    grants.yaml
    underfunded.yaml
    reading-lists.yaml
    predictions.yaml
    sources.yaml         # RSS feed sources for the daily news routine
    grants-sources.yaml  # grant RSS sources for the weekly grants-watch
    news-rules.yaml      # editorial rules for the news routine
    last-run.json        # state from the most recent news run
    inbox/               # append-only queues (run-log.jsonl, fetch-errors.jsonl, grants-needs-review.jsonl)
  public/
    data/                # generated JSON for client-side chat agent (built from data/*.yaml)
    favicon.svg, favicon.ico, apple-touch-icon.png
  scripts/
    build-data.ts        # YAML → JSON converter, runs predev / prebuild
  src/
    content.config.ts    # Astro content collection schemas
    content/
      layers/<slug>.mdx  # 14 layer pages (3-5 sentence intros)
      news/YYYY-MM-DD.mdx # daily news issues from the scheduled routine
    lib/
      layers.ts, projects.ts, grants.ts, predictions.ts, reading-lists.ts
      chat/              # agent infrastructure
        anthropic.ts     # provider abstraction (Anthropic + OpenRouter)
        prompts.ts       # ANSWER_SYSTEM_PROMPT + SOCRATIC_SYSTEM_PROMPT
        tools.ts         # tool definitions + executor + budget
        retrieve.ts      # MiniSearch index over all wiki content
        stream.ts        # streaming + tool loop
        citations.ts     # parse and chunk citation tags in agent output
        store.ts         # zustand store for settings + chat threads
        types.ts         # shared types
    components/
      ChatBubble.tsx     # floating chat bubble UI (React)
      ChatPanel.tsx      # expanded panel
      Settings.tsx       # BYOK key entry (React island)
      StackDiagram.astro
      GrantsBrowser.astro
      Nav.astro, Footer.astro
    layouts/
      BaseLayout.astro   # mounts ChatBubble globally
    pages/
      index.astro
      stack/, grants/, news/
      projects/[slug].astro # per-project pages for the ~35 with explainers
      settings.astro     # the BYOK settings page
      predictions.astro
      about.astro
    styles/global.css
```

## Data schemas

### `data/layers.yaml` — the 9+5 taxonomy

```yaml
core:
  - slug: silicon
    title: Silicon
    short_description: Chips and ISAs that execute the math.
    order: 1
    lock_in_vector: silicon
    sovereignty_relevance: 5  # 1-5
    related_layers: [compute, runtime]
meta:
  - slug: evaluation
    title: Evaluation
    short_description: Benchmarks, harnesses, leaderboards.
    order: 1
    ...
```

### `data/projects.yaml` — project catalog

Schema: `slug, name, layers (array), license, focus, maturity, url, github (optional), description (one line), explainer (optional, multi-paragraph), sources (optional, [{title, url}])`.

Focus values: `open` (OSI-approved), `open-weights` (source-available
weights), `source-available`, `proprietary`, `standard` (specification).

Maturity values: `stable | beta | alpha | research | maintenance | new`.

**`explainer` (optional, high-priority projects only)**: a 200-400
word deeper writeup with four parts: (1) what it is, (2) how it
compares to siblings at the same layer, (3) why it matters for
open-source AI specifically, (4) who is actually using it and
production-readiness. Every numerical or factual claim must be
traceable to `sources` per the citation-discipline rule. Renders as
an expandable disclosure on the layer page card; the chat agent reads
it via the `read_project` tool. Aim for ~20-30 priority projects
total; do not write an explainer for every project.

### `data/funders.yaml` — grant funder profiles

Schema: `slug, name, region, type, mission, funding_range, cadence, process, url, focus_layers (array), notable_recent`.

Region: `US | EU | UK | Global | Asia | Africa | LatAm`.
Type: `government | foundation | corporate | consortium`.

### `data/grants.yaml` — individual grants

Schema: `title, kind, funder (slug ref), recipient, date (string YYYY or YYYY-MM or YYYY-MM-DD), amount_usd (optional), amount_label, layers (array), region, url, description (2-4 sentences)`.

`kind` is the most important field. Two values:

- **`project`**: a specific named project that received money. You can
  look it up and see what it does. (Maple AI, Goose, BridgingBot,
  individual Mozilla Builders projects.) The /grants page defaults to
  this view.
- **`program`**: a cohort, RFP, fellowship round, or aggregate funder
  announcement. The "thing" here is the program itself, and the audience
  is potential applicants or other funders. (Anthropic Fellows May 2026
  cohort, AI Safety Fund Dec 2025 round, SFF-2025 allocations,
  Hoffman-Yee continuation, Multistakeholder Engagement program.)

When in doubt: if the entry could plausibly link to a project website
or product, it's a project; if it links to the funder's program page,
it's a program.

The `amount_label` is human-readable ("$25K", "Undisclosed", "$1M / 10
teams"). `amount_usd` is numeric for the amount-bucket filter; null
when undisclosed.

### `data/reading-lists.yaml` — curated reading per layer

Schema: `title, source, url, type, year, layers (array), description`.

Type: `paper | post | talk | podcast | book | thread | docs`.

### `data/predictions.yaml` — falsifiable predictions

Schema: `layer, claim, horizon (date), confidence (1-5), resolves_when, filed (date)`.

### `src/content/news/<date>.mdx` — daily news issues

Append-only log written by the scheduled news routine. Frontmatter:
`date, editorial_letter, item_count, layer_buckets (record of
layer-slug → count)`.

## Operations

### Daily news routine (08:00 PT)

`mcp__scheduled-tasks__create_scheduled_task` named
`oss-ai-stack-daily-news`. Runs three stages: fetch (~30 RSS / Atom
feeds defined in `data/sources.yaml`), dedupe-route (URL normalize +
SimHash + per-layer routing), summarize-publish (writes one MDX to
`src/content/news/YYYY-MM-DD.mdx` and commits). Run state appended to
`data/inbox/run-log.jsonl`. Fetch errors to
`data/inbox/fetch-errors.jsonl`. Does not modify the canonical YAML
data files.

### Weekly grants-watch routine (Mondays 09:00 PT)

Named `oss-ai-stack-weekly-grants-watch`. Surfaces candidate new
grants from `data/grants-sources.yaml` to
`data/inbox/grants-needs-review.jsonl` for human review. Does not
auto-publish.

### Monthly grants-discovery routine (1st of each month, 11:00 PT)

Named `oss-ai-stack-monthly-grants-discovery`. The COVERAGE leg of
the system: actively hunts for grants and funders we do NOT already
track. Three steps: rotating WebSearch queries for new funders, per-
known-funder check for grants we missed, cross-check against external
grant trackers. Findings appended to
`data/inbox/funder-candidates.jsonl` and
`data/inbox/grant-candidates.jsonl`. Full procedure at
`scripts/grants-discovery.md`. Does NOT modify the canonical YAML
files.

### Quarterly grants-audit routine (1st of Mar/Jun/Sep/Dec, 10:00 PT)

Named `oss-ai-stack-quarterly-grants-audit`. The ACCURACY +
COVERAGE-DEPTH leg. Picks every entry in `data/grants.yaml` and
`data/funders.yaml`, fetches its primary `url`, and checks for four
classes of drift:

1. **Dead URL**: the entry's `url` returns 4xx/5xx or redirects
   somewhere unrelated. Flag for re-sourcing.
2. **Stale facts**: the entry's `description` or
   `notable_recent` claims a specific dollar amount, date, count,
   or recipient that no longer matches the live page. Flag with a
   diff of what the live page says vs what we have.
3. **Funder consolidation candidates**: when two funder entries
   share a URL host or have substring overlap in their names,
   flag for human review (caught Cosmos Institute / Cosmos x FIRE).
4. **Per-funder coverage gap**: for each funder, fetch their
   awards / grants / portfolio page and count named grants on it.
   Compare to grant count in `data/grants.yaml` attributed to that
   funder. Flag funders where our coverage is materially lower than
   the funder's published grants list, with `named_grants_we_lack`.

Output appended to `data/inbox/grants-audit.jsonl` for human review.
The audit does NOT modify the YAML files; resolutions are manual.
The next agent updating those files reads the audit log first to
know what needs attention.

### How the routines fit together

The grants-specific routines compose with the broader claims-audit
system into a coverage + recency + accuracy + grounding stack:

| Routine | Cadence | Scope | What it catches |
|---|---|---|---|
| grants-watch | Weekly Mon 09:00 | RSS feeds of known funders | New announcements from known funders |
| grants-discovery | Monthly 1st 11:00 | Web search + external trackers | NEW funders and grants we do not yet track |
| grants-audit | Quarterly 1st (Mar/Jun/Sep/Dec) 10:00 | Every grant/funder entry's live URL + per-funder coverage | Dead links, fact drift, consolidation candidates, coverage gaps |
| audit-layer2 | Weekly Tue 10:00 | Drifted sources + stale-pending-review ledger rows | Source content changed since last verification |
| audit-layer3 | Quarterly 1st 12:00 | Every row in CLAIMS_LEDGER.md regardless of diff | Full re-verify catches drift that didn't trip the diff signal |
| recall-pass | Quarterly 1st 13:00 | Adversarial re-extraction with different model | Claims the literal extractor missed (precision-only blind spot) |
| coverage check | Run on-demand or after content edits | Canonical entity lists vs YAML data | Popular projects/concepts not in the catalog |

The /about page exposes the coverage-and-limitations posture to
readers explicitly. None of the routines auto-publish to the site;
everything goes through `data/inbox/` or `audit/CLAIMS_LEDGER.md`
for human review.

## Claims-audit system (under `audit/`)

Independent of the grants-specific routines above, every checkable
claim in the site (YAML descriptions, MDX bodies, page-copy prose)
is tracked in `audit/CLAIMS_LEDGER.md` with a verdict that persists
across cycles. The full architecture lives in `audit/RUNBOOK.md`;
day-to-day cookbook in `audit/OPERATIONS.md`.

Key principles (lifted from FactScore / VeriScore / Molecular Facts
research, see prior conversation):

- **Decontextualized atomic claims**: each row is property-level
  atomic AND carries the minimum context to verify independently.
  Vanilla atomic decomposition (FactScore) strips antecedents and
  silently makes claims unverifiable.
- **Three lanes**: factual / framing / prediction. Mixing them in
  one verification path silently corrupts scores (VeriScore EMNLP
  2024). Framing claims get a paragraph-level consistency check
  labeled `consistent`, NOT `verified`. Predictions resolve at
  horizon, never verified externally.
- **Cross-model extract vs verify**: Claude extracts, the verifier
  uses a different family (Gemini / GPT) for any escalated row.
  Self-preference bias inflates pass rates if same family does both.
- **Snapshot store**: `sources/{sha256-of-canonical-url}/{ts}.json`
  with trafilatura-extracted text + content hash + Wayback Machine
  URL. Verification runs against the snapshot, not the live URL.
  ~75% of cited URLs drift even when still 200 OK (Klein et al.).
- **Verdict enum distinguishes verifier-says-no from verifier-couldnt-answer**:
  `unsupported` ≠ `verifier_unable` ≠ `source_unreachable`. Per
  Earezki May 2026, 42% of LLM-judge "hallucination" verdicts are
  pipeline errors. Keep them distinct.
- **Recall pass**: quarterly adversarial re-extraction with a
  different prompt catches claims the literal extractor missed.
  Precision-only is the silent failure mode for curated content.

### npm scripts for the audit

- `npm run audit:layer1` — Layers 0 + 1 (JSON Schema, cross-refs,
  citation discipline). Runs on every prebuild.
- `npm run audit:links` — link liveness (network, not in prebuild)
- `npm run audit:snapshot` — refresh source snapshots
- `npm run audit:snapshot:stale` — only snapshots older than 30 days
- `npm run audit:extract` — extract claims from a source file
- `npm run audit:extract:all` — bootstrap extraction across all
  priority sources
- `npm run audit:verify` — entailment verify needs_verification rows
- `npm run audit:verify:all` — full re-verify
- `npm run audit:coverage` — regenerate audit/CONCEPTS_INDEX.md

### Fact-check workflow (manual, anytime)

For any individual entry that looks suspect, the human or agent can
run the audit ad-hoc:

1. Fetch the entry's `url`. Confirm it loads and is the correct
   resource.
2. Check every claim in the entry's text against the page:
   - Dollar amounts (and the disclosure year context)
   - Cohort sizes / grantee counts
   - Dates of program announcements / closings
   - Named partner organizations
   - Layer attribution (does the project actually do that?)
3. Update the entry. If a claim cannot be verified, soften to a
   qualitative observation per the citation-discipline rule, or
   remove.
4. The linter runs on prebuild; any unsourced new claim fails the
   build.

For projects with `explainer` content, the same applies but the
`sources` array on the entry must list every primary source for
factual claims in the explainer (not just the `url` field).

### Manual append flows

For projects, funders, grants, readings, and predictions: edit the
YAML directly, then commit. For layer pages: edit the MDX directly.
There is no scheduled write to these files.

### Build pipeline

`npm run build` runs:

1. `scripts/build-data.ts` (via prebuild script) converts all
   `data/*.yaml` to `public/data/*.json` so the in-browser chat agent
   can fetch them.
2. `astro build` generates the static site.
3. `@astrojs/sitemap` writes `dist/sitemap-index.xml`.

## Editorial rules (binding for all generated content, including agent replies)

- **No em dashes.** Anywhere. Use commas, colons, semicolons,
  parentheses, or two sentences. Universal across all of Austin's
  public-facing work, not specific to this repo.
- **No buzzwords.** Banned: `delve, tapestry, transformative, robust,
  leveraging, utilize, fascinating, landscape (as a verb-y filler),
  elevate, unlock, paradigm, ecosystem (when used vaguely)`.
- **Neutral observational voice** is the default for all explanatory
  content (layer pages, project descriptions, grant writeups). Read
  like Bloomberg, not like a marketing post.
- **Every interpretive claim cites a source.** Layer overview pages,
  project descriptions, grant entries, and funder profiles all link
  to primary sources via the `url` field or inline links.
- **No standalone editorial essays.** Synthesis-style arguments are
  not authored here. The chat agent is permitted to synthesize from
  the underlying data at query time, but the synthesis is never
  cached on disk as an authoritative essay.
- **Prefer primary sources** (project docs, release notes from
  maintainers, original papers) over secondary commentary.

## Citation discipline (binding)

The site is read by Austin and one other person, but the long-term
risk is real: AI-generated content + AI-assisted maintenance =
plausible-sounding facts that nobody verified. To prevent the next
agent (or the next human in a hurry) from quietly introducing
unsourced claims, this section is non-negotiable.

### The rule

Every specific numerical claim, percentage, dollar amount, count,
specific date, bandwidth, latency, or factual assertion in any
content file (YAML descriptions, MDX bodies, page copy) must either:

1. Include an inline URL link to a primary source within the same
   paragraph, OR
2. Be derived from a typed schema field on a structured entry
   (`amount_usd`, `date`, `year`, etc.) whose `url` field links to
   where that value was announced, OR
3. Be attributed inline to a named primary source whose link appears
   nearby (e.g., "per the State of AI Report 2025, [link]"), OR
4. Live in a `sources: [{title, url}]` array on the entry's schema.

Soft assertions of fact without sources are prohibited. If a number
or specific claim cannot be sourced to a primary, rewrite it as a
qualitative observation ("a significant share") or remove it.

### Out-of-scope (do not need citations)

- Typed schema fields (`amount_usd`, `date`, `year`, etc.) that are
  themselves the value; the entry's `url` documents the value.
- Pure framings or labels with no specific claim ("vLLM is the
  dominant open inference engine" is a framing; "vLLM serves X
  tokens/sec on H100" is a claim).
- Editorial voice and prose style.
- Internal commit messages and engineering docs.

### Enforcement

A linter at `scripts/lint-citations.mjs` runs on every prebuild and
on `npm run lint`. It scans YAML descriptions, MDX bodies, and page
copy for the patterns above and fails the build if any specific
numerical or factual claim lacks a nearby citation. The next agent
literally cannot push uncited claims, because the build won't pass.

If you intentionally need to break the rule (e.g., quoting a TODO
list, an example, or an inline test), add an inline comment
`<!-- lint-allow: reason -->` on the line above the claim. Such
allowances should be rare.

### The `sources` schema field

For entries whose `description` or `mission` text makes claims
beyond what their primary `url` documents, populate `sources`:

```yaml
sources:
  - title: "State of AI Report 2024"
    url: "https://www.stateof.ai/2024-report-launch"
  - title: "a16z Enterprise AI Adoption Survey 2025"
    url: "https://a16z.com/enterprise-ai-adoption-survey"
```

Funders and projects are the most common target: their profile text
often summarizes aggregate activity. Grants and readings rarely
need it because their `url` is the announcement.

## In-site chat agent

The chat agent is a React island mounted in BaseLayout, available on
every page as a floating bubble bottom-right that expands into a
resizable side panel.

### Posture

- **Pure BYOK.** User pastes their own Anthropic or OpenRouter API
  key on `/settings`, stored in browser localStorage only. No
  server-side proxy, no shared key. The site stores no PII.
- **Page-context-aware.** The component reads `window.location` and
  passes the current page (or the current layer / grant / funder slug
  if applicable) into the system prompt as context.

### Modes

- **Answer mode** (default on `/stack/<slug>`, `/grants`, `/news`,
  `/predictions`, `/today`, `/`): factual, neutral-observational,
  cites sources inline, uses tools to ground every claim.
- **Socratic mode** (opt-in via toggle in the chat header): asks one
  question at a time, pushes the user to think, refuses to give the
  answer when the question is "explain X to me." No page-context
  default triggers this mode; the user has to flip the toggle.

User can toggle between modes via a switch in the chat header.

### Tools

All tools execute browser-side over the JSON in `public/data/`. Each
has a per-turn rate limit and a dedup cache (per
`src/lib/chat/tools.ts`).

| Tool | Purpose | Per-turn limit |
|---|---|---|
| `find_grants(filters)` | Filter grants by funder, layer, region, amount, recency | 3 |
| `find_funders(filters)` | Filter funders by region, type, focus_layer | 2 |
| `find_projects(filters)` | Filter projects by layer, focus, maturity | 3 |
| `find_readings(filters)` | Filter readings by layer, type, year | 3 |
| `read_layer(slug)` | Fetch full layer overview + projects + readings + predictions | 3 |
| `read_funder(slug)` | Fetch full funder profile + grants | 3 |
| `read_grant(title)` | Fetch full grant entry by title | 3 |
| `read_project(slug)` | Fetch full project entry (incl. explainer + sources) + siblings at the same primary layer | 4 |
| `read_prediction(layer)` | Fetch predictions for a layer | 2 |
| `today_news()` | Fetch the latest daily issue | 1 |
| `search(query)` | MiniSearch over everything as fallback | 2 |

### Chat triggers (from page elements)

Any element on a page can open the chat with a pre-filled prompt by
dispatching a custom event:

```js
window.dispatchEvent(
  new CustomEvent("chat-trigger", {
    detail: { prompt: "Tell me about RISC-V at the silicon layer..." },
  }),
);
```

`ChatBubble` listens for this and:
1. Opens the panel (`setOpen(true)`)
2. Sends the prompt after a 50ms tick so the panel has mounted
3. Skips silently if a stream is already in flight

Used for the per-project "Ask" buttons on `/stack/<slug>` pages.
Anywhere a "talk to the chat about this" affordance is added, use
this event rather than wiring custom state.

### Citation format

Agent must cite sources inline with these markers:

- `(Layer: silicon)` — links to `/stack/silicon`
- `(Funder: hrf)` — links to `/grants/funder/hrf`
- `(Grant: Maple AI)` — links to the grant's URL or to a per-grant page
- `(Project: vllm)` — links to `/projects/vllm` (the dedicated project page; only ~35 priority projects with `explainer` get a page, others 404)
- `(Reading: <title>)` — links to the reading URL
- `(News: 2026-05-13)` — links to `/news/2026-05-13`

Citations are parsed in `src/lib/chat/citations.ts` and rendered as
clickable pills in `ChatPanel.tsx`.

### Grounding protocol (anti-hallucination)

Same five-rule pattern from meaning-crisis:

1. **Read on this turn.** Before any factual claim, call a tool this
   turn. Memory is where hallucinations come from.
2. **Quote inline, never send out.** Don't tell the user to "go read
   the page." Synthesize the answer in the reply with citations.
3. **Every citation carries metadata.** Use the markers above. A
   citation without a slug is a claim, not a citation.
4. **Failure mode: say so.** If a tool returns nothing, tell the user
   directly. Never fill the gap with plausible-sounding content.
5. **Pre-reply self-audit.** Before sending: did I tool-ground every
   factual claim? Are all my citations from this-turn results? Are
   any banned words in the reply?

## Deployment

Deployed to Vercel from `main`. Domain: open-source-ai.tech (managed
by Vercel; needs to be attached). GitHub repo:
github.com/Beige-Coffee/open-source-ai. Deploys automatically on
push.

## Co-evolution

Update this doc as conventions change. The chat agent's system prompts
read from this file at boot (the relevant sections are inlined into
`src/lib/chat/prompts.ts`); when you change editorial rules or add a
new tool, update both this doc and `prompts.ts`.
