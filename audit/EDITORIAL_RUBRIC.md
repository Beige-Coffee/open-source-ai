# Editorial rubric for layer pages

This rubric scores the editorial quality of each layer MDX
(`src/content/layers/<slug>.mdx`) against ten criteria. Two purposes:

1. **Catch framing errors** the YAML-data audit can't see. The
   claims-audit system in `audit/CLAIMS_LEDGER.md` verifies factual
   claims in grants/funders/projects YAML (was-this-amount-this-funder,
   is-this-URL-live). It does NOT review whether the layer prose
   conflates related-but-different concepts, names the wrong
   players, or omits the central editorial tension. This rubric does.
2. **Guarantee the Read content actually teaches the layer.** The
   `/learn/<module>` route renders the layer MDX in the left column
   as the "Read" phase content — the learner reads it BEFORE the
   Socratic agent starts asking questions. If the prose is a 250-word
   intro, the learner can't have an informed dialog. The rubric
   includes a depth criterion to enforce a real primer (target
   800-1200 words per layer).

## How to score a layer

Run `npm run audit:score-layer <slug>` to print the scoring prompt
with the layer MDX inlined. The agent reads the prompt and writes
back a JSON object with per-criterion scores (1–5), evidence, and
recommended fixes. The agent appends the result to
`audit/LAYER_SCORES.md` via `node audit/score_layer.mjs append`.

Score in-session under the agent's Claude subscription — same
pattern as the existing `extract` / `verify_entailment` scripts.
No API key required.

## The ten criteria (1–5 each)

For each criterion: **5** = exceeds expectations, **4** = solid,
**3** = passing but could be better, **2** = thin or partly wrong,
**1** = missing or seriously wrong.

### 1. Boundary clarity

Does the page say clearly what this layer IS and what it ISN'T?
A reader should be able to answer "would X belong here?" for an
ambiguous X (e.g., GGUF: weights or runtime? — runtime, because it's
a serving format).

- 5: opens with a 1-2 sentence definition that disambiguates the
  layer against its neighbors
- 3: implicit boundary, mostly clear from the named players
- 1: vague or overlapping with adjacent layers

### 2. No category errors

Are related-but-different concepts kept distinct? Specifically:
ORGANIZATIONAL decentralization (marketplaces of independent
operators) vs PHYSICAL decentralization (one company siting many
small facilities). OPEN weights vs OPEN-WEIGHTS license (Llama is
the latter, not the former). HOSTED training vs OPEN training
recipes. Etc.

- 5: every category that could be conflated IS distinguished
  explicitly, with examples on each side
- 3: most distinctions made; a few subtle conflations
- 1: relies on a vague umbrella term that hides real differences
  (the Crusoe-as-decentralized failure mode)

### 3. Primary-source citation

Does every specific number, date, dollar amount, and named claim
link to a primary source within the same paragraph? Per the
citation discipline in CLAUDE.md, soft assertions of fact without
sources are prohibited.

- 5: every specific claim sourced; sources go to primary documents
  (vendor press releases, GitHub release notes, original papers),
  not secondary commentary
- 3: most claims sourced, some are unlinked; sources are mostly
  primary
- 1: bare numbers / dates / dollars without sources

### 4. Open-vs-closed posture

Does the page state explicitly where this layer stands on the
open-source spectrum, with evidence? "Almost nothing here is OSI-open"
is a real posture; "the ecosystem is opening up" without specifics is not.

- 5: posture stated in one sentence with evidence; both the open
  and closed sides named with specific projects
- 3: posture implied; one side better-named than the other
- 1: vague or absent

### 5. Named players

Are specific projects, organizations, and releases named, not
gestures like "major labs" or "the open ecosystem"? Specificity
forces the reader to engage with what actually exists.

- 5: 5+ specific projects/orgs/releases, each with a clear role
- 3: 2-3 named players; some hand-waving
- 1: only vague references

### 6. Editorial tension

Does the page surface the central editorial debate at this
layer? Every layer has a tension worth naming (concentration vs
distribution of gigawatts; open weights vs open training data;
Apache vs OSAID v1.0 strictness; etc.). The reader should leave
knowing what the open argument is.

- 5: tension named in 1-2 sentences, with both sides represented
- 3: tension implicit; one side stated, the other only hinted at
- 1: no tension; reads as a neutral list of facts

### 7. Voice compliance

Per CLAUDE.md editorial rules: no em dashes, no banned vocabulary
(`delve, tapestry, transformative, robust, leveraging, utilize,
fascinating, landscape, elevate, unlock, paradigm, ecosystem (when
vague), load-bearing`). Neutral observational voice. Read like
Bloomberg, not a marketing post.

- 5: no violations; voice is consistent and crisp
- 3: 1-2 minor lapses (e.g., one banned word used once)
- 1: multiple violations or marketing-style framing

### 8. Depth

Is the page long enough and structured enough for a learner to
actually teach themselves the layer before engaging the Socratic
agent? Target: **800-1200 words**. The page should cover physics
or mechanism, current state of the major players, history of how
the layer became what it is, and the open-vs-closed posture, with
enough specific anchors that the learner can form their own opinion.

- 5: 900-1200 words; reads as a primer; multi-paragraph structure
  with internal landmarks
- 4: 600-900 words; covers most of what a primer should
- 3: 400-600 words; intro-level only
- 2: 250-400 words (current default for most layers)
- 1: under 250 words

### 9. Glossary integration

Are domain terms tagged with `<G term="slug">` so hover-cards
work? First-occurrence-per-page is the editorial pattern. The
glossary linter (`scripts/lint-glossary.mjs`) flags missed
opportunities advisory-only.

- 5: every glossary term in the body is tagged on first occurrence
- 3: most key terms tagged; some misses
- 1: glossary tags missing or only on obvious terms

### 10. probe_primer alignment

The frontmatter `probe_primer` is the list of allowed-claim
anchors the Socratic agent uses to scope questions in the Probe
phase (per `src/lib/course/prompts.ts`). It must:
- Reflect claims actually made in the body
- Not introduce framing errors not in the body (Crusoe failure
  mode: body conflates, primer doubles down)
- Have 4-6 claims (enough variety for several questions, not so
  many that the agent wanders)

- 5: primer claims map 1:1 to body paragraphs; no framing errors;
  4-6 anchors
- 3: primer mostly aligned; one weak or vague claim
- 1: primer drifts from body OR introduces a framing error

## Total

Sum of ten criteria, **max 50**. Reference grades:

| Total | Grade | Action |
|---|---|---|
| 45-50 | A | Ship; spot-check |
| 38-44 | B | Solid; small fixes |
| 30-37 | C | Needs targeted edits |
| 20-29 | D | Rewrite recommended |
| <20  | F | Full rewrite required |

The baseline measurement (before this rubric existed) is that the
15 current layer MDXs all sit at 250-303 words — failing criterion
8 (depth) automatically with a 2/5, and most of them failing
criterion 6 (editorial tension) because the prose runs out of
room before surfacing the debate. Realistic baseline: **C-** for
most layers, **D** for the shortest. Post-rewrite target: **A-/B+**
across all 15.

## What the rubric does NOT cover

- Factual accuracy of specific YAML data (grants, funders,
  projects). That stays in `audit/CLAIMS_LEDGER.md` / the existing
  layer1-3 audit pipeline.
- Glossary entry quality. Glossary entries have their own implicit
  rubric (30-word summary, 3-4 paragraph body, sources field).
- Reading-list curation. The reading list is curated per layer
  but the rubric here scores the layer's PROSE, not the readings
  attached.

## Co-evolution

Update this doc as rubric criteria evolve. When the rubric changes
materially, re-score everything (cohort consistency matters more
than individual scores in isolation).
