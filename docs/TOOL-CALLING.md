# Tool-calling section: design

Status: design draft for review (June 2026). Doc-first, build-second,
mirroring how the Hardware section was built (`docs/HARDWARE.md`). This
doc proposes Option C from the prior research pass: a first-class
tool-calling surface. It surfaces the genuine decisions for Austin and
stops before implementation.

Provenance: grounded in a 25-agent research workflow (site coverage map +
landscape research + adversarial claim verification) run June 2026, plus
direct repo verification of every claim about current state. The
landscape facts carry per-item confidence and a citation-safety list
(section 11) because this environment's network can return fabricated
2026 content.

## Goal

Answer, in one coherent place, the question a builder actually has:
"how do open models call tools, what makes a tool call valid, which
models and engines are good at it, and how is that measured?"

Today the site can define what tool calling is, but it cannot show the
mechanism (how a valid call is produced), catalog the open tooling that
produces it, or compare models on tool-use ability. This section closes
those three holes and ties the existing scattered pieces into a single
narrative.

## Audience and how it fits the rest of the site

Same audience-of-one-plus posture as the rest of the site: a builder who
self-hosts open models and wants the real picture, not marketing. Tool
calling is a cross-cutting theme (it touches `runtime`, `agents`,
`protocols`, `evaluation`, and `weights`/models), exactly like Hardware
was a cross-cutting theme over `silicon`/`compute`. It earns a dedicated
surface for the same reason Hardware did: the story is real, it spans
layers, and no single existing page tells it end to end.

## Diagnosis: covered-but-scattered, with three empty lanes

Verified against the repo. Tool calling is one of the better-developed
glossary clusters, but the coverage stops at the concept line.

What exists (concept level, in good shape):

- Glossary cluster: `tool-use` (umbrella) over `function-calling`
  (protocol); the protocols trio `mcp` / `a2a` / `agentic-payments`
  (with `x402` / `l402`); reasoning neighbors `react` /
  `chain-of-thought`; orchestration `multi-agent` / `agentic` /
  `agent-memory`; product/framework entries `goose` / `langchain` /
  `autogen`.
- A full course module: `how-llms-work-modules/tool-use.mdx`
  ("Tool use and agents").
- Layer framing: `protocols.mdx` (MCP/A2A/ACP/AAIF), `agents.mdx`
  (15+ frameworks), one line on `runtime.mdx`.

What is genuinely absent, in three lanes:

1. Mechanism (how a call is produced and made valid). No glossary
   entries for structured output, JSON mode, constrained/guided
   decoding, grammars/GBNF, the tool-call loop as a named term,
   parallel tool calls, or streaming tool calls. These appear only as
   un-entried plain text inside other bodies (`benchmark.mdx`,
   `tool-use.mdx`, `sglang.mdx`, `radix-attention.mdx`) and the learn
   modules (`decoding.mdx`, `tool-use.mdx`). A `<G term="constrained
   decoding">` tag has nothing to resolve to.
2. Tooling (the open libraries that do it). Outlines, XGrammar,
   llguidance, Guidance, Instructor, lm-format-enforcer are not
   catalogued projects. Constrained decoding shows up only as a feature
   bullet on SGLang. This is the open-source-tooling story, which is the
   site's reason to exist, and it is missing.
3. Measurement (the benchmarks). This is the sharp one. Tool-use
   benchmark scores already exist in `data/models.yaml` but render on
   zero pages, because `BenchmarkSlug` in `src/lib/models.ts` is
   hardcoded to 13 non-tool-use slugs. Verified present and sourced:
   - `granite-4-1-8b-instruct`: `bfcl_v3 = 68.3` (as_of 2026-04-29, sourced)
   - `glm-4-5`: `tau_bench = 70.1` (as_of 2025-07-28, sourced)
   - `hunyuan-2-0-instruct`: `tau_bench = 72.4` (as_of 2025-12-05, sourced)
   These mint verification-ledger rows that display nowhere.

Adjacent finding (separate cleanup, noted not owned here): there are 44
distinct off-schema benchmark keys present in `models.yaml` that render
nowhere, led by `hle` (57 models), `gsm8k` (11), `terminal_bench` (5),
`arena_hard` (6), `gpqa` (6). Adding tool-use slugs to the schema is the
natural moment to decide a policy for these orphans, but that is a
separate task, not part of this section.

Data smell to fix regardless (verified): both `function-calling.mdx` and
`tool-use.mdx` declare the alias `tool calling`, so
`<G term="tool calling">` resolves ambiguously. The glossary linter does
not currently catch duplicate aliases.

## Scope

### Locked (consistent with site posture; not seeking debate)

- Open-weights / open-source focus. Closed models appear only where they
  set the de-facto format the open ecosystem adopted (e.g. the OpenAI
  tools schema, Anthropic `tool_use`), framed as context, never
  promoted.
- Every factual claim traces to a primary source via the citation
  linter, and every model-data cell flows through the existing
  verification gate. Unverified renders nothing.
- No em dashes anywhere public-facing; the full banned-vocabulary list
  in CLAUDE.md applies, including the universal one Austin added by
  memory.
- This is a content + light-island section, not a calculator. Tool
  calling has no quantitative model to compute (there is no roofline
  equivalent), so the value is the explainer, the catalog, and the
  benchmark facet, not an interactive solver.

### Open forks (your decision; section 13 collects them with recommendations)

- F1: surface shape (dedicated topic page vs layer-expansion vs full
  interactive section).
- F2: the interactive element (the format-explorer island), in or out.
- F3: nav placement.
- F4: project-catalog scope (how many structured-output libraries).
- F5: models facet scope (benchmark-only vs also a tool-call-format field).

## The surface (recommendation: a topic page + a format-explorer island)

Recommended shape (F1 = "topic page", F2 = "island in"): a dedicated
route `/tool-calling` with:

1. A narrative landing page (Astro + MDX-style prose, server-rendered,
   gated where it cites model data) that walks the full arc in order:
   the tool-call loop (capability) -> how a valid call is produced
   (mechanism: structured output, constrained decoding, grammars) ->
   the open tooling that does it (libraries + engine support) -> the
   wire that standardizes it (MCP) -> how it is measured (BFCL,
   tau-bench) -> which open models are strong at it. Each stage links
   the existing glossary / course / layer / project / model pieces, so
   the page is the connective tissue, not a duplicate.

2. One interactive island, the Tool-Call Format Explorer (the
   centerpiece, and the honest interactive for this topic): pick a model
   family and see how it serializes the same tool call, side by side.
   The data is each lab's documented chat-template tool-call format,
   which is concrete, citable, and high-value:
   - Llama 3.1+ (`<|python_tag|>`, `ipython` role, built-in vs custom JSON)
   - Mistral (`[TOOL_CALLS]` / `[AVAILABLE_TOOLS]` / `[TOOL_RESULTS]`)
   - Hermes / NousResearch (`<tool_call>` JSON, the template many
     runtimes adopted as a default parser)
   - Command R / R+ (JSON action list + `directly_answer`)
   - Qwen2.5+ (Hermes-style, per Qwen docs)
   This is the one place an interactive genuinely helps: it makes the
   "every model emits only the serialization it was trained on, and
   runtimes ship per-model parsers" point tangible. Each format cites
   its own primary source (not a shared URL).

Why not a full `/hardware`-style pipeline (YAML + calculator + island +
chat tools + page-context detection): there is no computation to drive
it. The format explorer is the only faithful interactive, and it is pure
sourced data, so it does not need the heavyweight data+gate machinery a
calculator would. We reuse the existing verification gate only for the
model-data cells (the benchmark facet), not for the prose.

The lighter alternative (F1 = "layer-expansion", no new route) is
described in section 13.

## The mechanism lane: glossary cluster to mint

New glossary entries (MDX under `src/content/glossary/`), each a 3-4
paragraph senior-engineer-voice explainer with a summary under 30 words,
`primary_layer` + `secondary_layers`, and sourced. The `<G>` bulk-tagger
(`scripts/bulk-tag-glossary.mjs`) auto-wires the existing plain-text
mentions on add, so these light up references already in
`benchmark.mdx`, `tool-use.mdx`, `decoding.mdx`, `sglang.mdx`.

| Slug | Aliases | primary_layer | What it defines | Primary source(s) (confidence) |
|---|---|---|---|---|
| `structured-output` | structured outputs, structured generation | runtime | The umbrella: making a model emit text that conforms to a schema/type, not free text. | OpenAI Structured Outputs announcement (high) |
| `constrained-decoding` | guided decoding, grammar-constrained decoding | runtime | The mechanism: masking logits at each step so only schema-valid tokens are sampled. | Outlines paper arXiv:2307.09702 (high); OpenAI announcement for the CFG/token-masking description (high) |
| `grammar` (GBNF) | GBNF, grammar-based sampling | runtime | A formal grammar (e.g. llama.cpp GBNF) the decoder is constrained to; JSON Schema compiles to one. | llama.cpp `grammars/README.md` (high); sampler mechanism cite the source file, not the README |
| `json-mode` | JSON mode | runtime | The weaker predecessor: guarantees valid JSON, not schema conformance. | OpenAI structured-outputs docs (high) |
| `tool-call-loop` | tool loop, function-calling loop | agents | The host-orchestrated cycle: model emits a call, host executes, result is fed back. The model never executes anything. | OpenAI function-calling guide (high); Anthropic tool-use overview (high) |
| `parallel-tool-calls` | parallel function calls | agents | Emitting multiple independent calls in one turn. | OpenAI function-calling guide (high; describe generically, toggle names vary) |
| `bfcl` | Berkeley Function Calling Leaderboard | evaluation | The standard function-calling benchmark: AST + executable checks, parallel/multi-turn categories. | Gorilla BFCL leaderboard + blog (high for v1-v3; see 11) |
| `tau-bench` | tool-agent-user benchmark | evaluation | Agentic tool-use eval over realistic retail/airline tasks, pass^k scoring. | arXiv:2406.12045 (high; original scope only, see 11) |

Notes:
- Resolve the alias collision: keep `tool calling` as an alias on
  exactly one of `function-calling` / `tool-use` (recommend
  `function-calling`, since it is the protocol-specific term), and drop
  it from the other.
- `structured-output` and `constrained-decoding` are the most-referenced
  missing terms; they are the priority of this lane.

## The tooling lane: structured-output projects to catalog

New entries in `data/projects.yaml`, layer `runtime`, each with a sourced
`explainer` (200-400 words through the citation linter). Recommended core
set (F4):

| Slug | Name | Focus | License posture | Primary source (confidence) |
|---|---|---|---|---|
| `outlines` | Outlines (.txt) | FSM-based structured generation | open | github.com/dottxt-ai/outlines (high) |
| `xgrammar` | XGrammar | Fast grammar engine; backend in vLLM/SGLang/MLC/TensorRT-LLM | open | github.com/mlc-ai/xgrammar, arXiv:2411.15100 (high). Exclude "XGrammar-2" and speedup numbers (see 11) |
| `llguidance` | llguidance | Low-latency constrained-decoding engine (Guidance backend) | open | github.com/guidance-ai/llguidance (high; exclude marketing latency/date specifics) |
| `guidance` | Guidance | Programmatic constrained generation | open | github.com/guidance-ai/guidance (high) |
| `instructor` | Instructor | Pydantic-typed structured outputs over many providers | open | github.com/567-labs/instructor (high) |
| `lm-format-enforcer` | LM Format Enforcer | Token-filtering schema enforcement | open | github.com/noamgat/lm-format-enforcer (high) |

Optional / defer: `jsonformer` (legacy, lightly maintained; do not assert
"archived" without a status check). Engine-side support (vLLM, SGLang,
llama.cpp, TGI, Ollama already have project/glossary entries) is covered
by adding a "structured output / tool calling" capability note to those
existing entries, not new projects.

## The measurement lane: a /models tool-use benchmark facet

This reuses the verified-quantization pattern we just shipped, end to
end, with zero pipeline changes (the ledger rows already exist and
`build-verification-map.mjs` is field-name-agnostic).

1. Add `bfcl_v3` and `tau_bench` to the `BenchmarkSlug` union in
   `src/lib/models.ts`.
2. Add a 4th `BENCHMARK_GROUPS` entry (label "Agentic / tool use") and
   `BENCHMARK_LABEL` display strings ("BFCL v3", "tau-bench").
3. Render the new group in `src/pages/models/[slug].astro` (grouped
   benchmark panel, already gated) and add a gated column +
   filter to `src/pages/models/index.astro`, mirroring the Quants facet
   (`<th>` + `data-` attr + `<select>` + client matcher), rendering
   "not catalogued" for unscored models.
4. The three existing scores flow through the existing gate; confirm
   their ledger rows are `supported`.
5. `find_models` / `compare_models` / `read_model` in
   `src/lib/chat/tools.ts` already pass benchmark scores through; confirm
   the new slugs surface so the chat agent can answer "which open models
   are good at function calling."

Editorial caveat: only 3 models are scored today, so the column is
sparse. That is acceptable and honest (it grows as the models-watch
routine adds scores), and it renders "not catalogued" exactly like the
Quants panel does. Tool-use benchmark scores are the safest content in
the whole section because they route through the verification gate: only
PASS-verdict, sourced cells ever render.

Optional higher-effort add (F5): a per-model `tool_call_format` field
(values like `llama` / `hermes` / `mistral` / `command-r` / `json`) for
open-weight models, sourced from the model card / chat template, powering
the format explorer's "which models use this format" view. This is new
data requiring per-model sourcing, so it is a deliberate add, not part of
the cheap benchmark facet.

## Cross-linking and retrofit (rider on the glossary work)

- Fix the `tool calling` alias collision (above).
- Add missing reciprocal/adjacent `<G>` links surfaced by the audit:
  `react` -> `tool-use` and `chain-of-thought`; `multi-agent` -> `a2a`;
  `agentic-payments` -> `x402` and `l402`; `x402` -> `l402`.
- De-orphan the dead references: `benchmark.mdx` and `tool-use.mdx`
  already name BFCL / tau-bench / SWE-Bench / GAIA in plain text; once
  the `bfcl` and `tau-bench` entries exist, wrap those mentions.
- The new `/tool-calling` page links into (never duplicates) the
  glossary cluster, the `tool-use` course module, and the `runtime` /
  `agents` / `protocols` / `evaluation` layer pages.

## Citation safety (binding; this environment fabricates 2026 content)

The conceptual spine is fully corroborated by the verification pass and
is safe to write with its named primary source. The following specifics
surfaced in research but are at or past the reliable horizon and must be
excluded or marked explicitly unverified, never stated as fact:

- "XGrammar-2" (a 2026-dated blog / arXiv `2601.x`) and its 80x / 7x
  speedup claims. Scope copy to base XGrammar (arXiv:2411.15100).
- "BFCL V4" and any "ICML 2025 agentic evaluation" BFCL paper. Scope
  written copy to BFCL v1-v3.
- "tau2-bench" telecom/voice extensions and any "tau3-bench"
  (voice/banking). Use original tau-bench scope (retail + airline,
  arXiv:2406.12045) unless independently confirmed.
- The MCP "2025-11-25" spec revision. Anchor on the stable pre-2026
  record (Nov-2024 launch + the 2025-03/2025-06 revisions).
- llguidance marketing latency figures and "OpenAI switched to
  llguidance" dates; jsonformer "archived" status; any GitHub star
  counts, latency microbenchmarks, or version-default claims. These
  drift and several come from project marketing; re-verify at publish
  time per the citation discipline.

Provider-reported numbers (e.g. OpenAI's structured-outputs eval figures)
are cited as provider-reported, not independently verified. Engine
version-specific defaults (e.g. vLLM's structured-output backend) are
pinned to a dated docs URL, never the moving `/latest/` page.

## Verification and audit integration

- Glossary entries: the existing glossary lint + citation lint enforce
  the summary length and sourcing; no new machinery.
- Project entries: each sourced `explainer` runs through
  `scripts/lint-citations.mjs` at prebuild.
- Model benchmark cells: the existing extract (`extract-models.mjs`) ->
  verification map (`build-verification-map.mjs`) -> render gate
  pipeline, unchanged. The new slugs are just additional fields.
- Format-explorer data: each format string carries its own source URL;
  if we make it a small `data/tool-call-formats.yaml`, it gets a JSON
  schema and rides the same audit pattern as hardware/models. If we
  inline it in the island, each entry still carries a visible source
  link.

## Build phasing (after this doc is approved)

Phase 1 (safe wins, no schema risk): mint the glossary mechanism +
benchmark cluster; fix the alias collision; add the reciprocal links;
run the bulk-tagger. Self-contained, high-trust, MDX-only.

Phase 2 (the facet): add `bfcl_v3` / `tau_bench` to the schema +
benchmark group + render on `/models` (detail + index column), reusing
the Quants pattern. Confirm the gate, the chat tools.

Phase 3 (the catalog): add the 6 structured-output project entries with
sourced explainers; add capability notes to the existing engine entries.

Phase 4 (the surface): build the `/tool-calling` route, the narrative
page, and the Tool-Call Format Explorer island; nav entry; cross-links;
internal-link check; final build + browser-verify.

Each phase is independently shippable and independently committable, in
the per-batch rhythm we have been using.

## Open decisions for review

F1 (surface shape). Recommend: dedicated `/tool-calling` topic page
(connective tissue over the existing pieces). Alternatives: (a)
layer-expansion only (no new route): put structured output /
constrained decoding on `runtime.mdx`, a tool-use lane on
`evaluation.mdx`, the loop on `agents.mdx`, plus the glossary + projects
+ facet. Lighter, but loses the single end-to-end surface. (b) full
`/hardware`-style interactive section. Over-built: there is no
calculation to justify the machinery.

F2 (interactive). Recommend: include the Tool-Call Format Explorer
island (the one faithful, citable interactive). Alternative: prose-only
page with a static comparison table.

F3 (nav). Recommend: a top-level "Tool calling" nav item between Models
and Hardware (it is a cross-cutting theme of the same weight).
Alternative: leave it out of nav, reachable via cross-links only.

F4 (project catalog). Recommend: the 6-library core set above.
Alternatives: minimal (Outlines + XGrammar + Instructor only) or
extended (add jsonformer + per-engine deep dives).

F5 (models facet). Recommend: ship the benchmark facet now (cheap, data
exists); treat the per-model `tool_call_format` field as an optional
Phase 2b once the format explorer needs it.

## Decisions resolved at review (June 2026)

- F1 = dedicated `/tool-calling` topic page (connective tissue over the
  existing pieces; not a full calculator section).
- F2 = build the Tool-Call Format Explorer island.
- F3 = top-level "Tool calling" nav item, between Models and Hardware.
- F4 = the core 6 structured-output libraries (Outlines, XGrammar,
  llguidance, Guidance, Instructor, lm-format-enforcer).
- F5 = ship the benchmark facet now; the per-model `tool_call_format`
  field is a Phase 2b follow-up once the explorer needs it.

Build order is the four phases in section "Build phasing", each
independently committed.

## Co-evolution

Update this doc as decisions land, the way `docs/HARDWARE.md` recorded
its resolved decisions. When the section ships, add a "Tool-calling
section" entry to `CLAUDE.md` describing the surface, the facet, and the
citation-safety posture, and update the chat-agent tool table / prompts
if the agent gains any tool-calling-specific grounding.
