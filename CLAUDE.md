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
      synthesis/<slug>.mdx # cross-cutting essays (the load-bearing arguments)
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
      stack/, grants/, learn/, news/
      essays/[slug].astro # synthesis essays
      settings.astro     # the BYOK settings page
      predictions.astro
      about.astro, today.astro
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

Schema: `slug, name, layers (array), license, focus, maturity, url, github (optional), description (one line)`.

Focus values: `open` (OSI-approved), `open-weights` (source-available
weights), `source-available`, `proprietary`, `standard` (specification).

Maturity values: `stable | beta | alpha | research | maintenance | new`.

### `data/funders.yaml` — grant funder profiles

Schema: `slug, name, region, type, mission, funding_range, cadence, process, url, focus_layers (array), notable_recent`.

Region: `US | EU | UK | Global | Asia | Africa | LatAm`.
Type: `government | foundation | corporate | consortium`.

### `data/grants.yaml` — individual grants

Schema: `title, funder (slug ref), recipient, date (string YYYY or YYYY-MM or YYYY-MM-DD), amount_usd (optional), amount_label, layers (array), region, url, description (2-4 sentences)`.

The `amount_label` is human-readable ("$25K", "Undisclosed", "$1M / 10
teams"). `amount_usd` is numeric for the amount-bucket filter; null
when undisclosed.

### `data/reading-lists.yaml` — curated reading per layer

Schema: `title, source, url, type, year, layers (array), description`.

Type: `paper | post | talk | podcast | book | thread | docs`.

### `data/predictions.yaml` — falsifiable predictions

Schema: `layer, claim, horizon (date), confidence (1-5), resolves_when, filed (date)`.

### `src/content/synthesis/<slug>.mdx` — load-bearing essays

Cross-cutting arguments that span multiple layers. Each carries
frontmatter: `slug, title, summary, related_layers, tags, updated`.
These are the deepest wiki entries; the chat agent pulls from them
constantly.

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

### Manual append flows

For projects, funders, grants, readings, predictions, and synthesis
essays: edit the YAML / MDX directly, then commit. There is no
scheduled write to these files.

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
- **Editorial point of view is allowed in synthesis essays.** That's
  the point of those entries. Argue. Make the load-bearing claim.
  Distinguish from the description-only voice elsewhere.
- **Every interpretive claim cites a source.** Layer overview pages,
  synthesis essays, project descriptions all link to primary sources.
- **Prefer primary sources** (project docs, release notes from
  maintainers, original papers) over secondary commentary.

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
- **Socratic mode** (default on `/learn`, `/learn/<slug>`,
  `/essays/<slug>`): asks one question at a time, pushes the user
  to think, refuses to give the answer when the question is "explain
  X to me."

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
| `read_prediction(layer)` | Fetch predictions for a layer | 2 |
| `read_essay(slug)` | Fetch a synthesis essay | 3 |
| `today_news()` | Fetch the latest daily issue | 1 |
| `search(query)` | MiniSearch over everything as fallback | 2 |

### Citation format

Agent must cite sources inline with these markers:

- `(Layer: silicon)` — links to `/stack/silicon`
- `(Funder: hrf)` — links to `/grants/funder/hrf`
- `(Grant: Maple AI)` — links to the grant's URL or to a per-grant page
- `(Project: vllm)` — links to the project URL or layer page
- `(Reading: <title>)` — links to the reading URL
- `(Essay: <slug>)` — links to `/essays/<slug>`
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
