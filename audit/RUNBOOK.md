# Audit Runbook

Source of truth for how the verification system works. For the
day-to-day cookbook ("I edited X, what do I run?"), see
`audit/OPERATIONS.md`.

## What this system verifies

Every checkable claim on the site (in YAML descriptions, MDX bodies,
and Astro page copy) traces to a primary source. The audit system
proves this and keeps proving it as content + sources both drift.

Claims split into three classes that route through different
verification paths:

- **Factual+verifiable**: specific numbers, dollar amounts, counts,
  dates, attributions, license declarations. Full entailment
  verification against a snapshotted source.
- **Framing/editorial**: interpretive claims ("the dominant open
  inference engine"). Paragraph-level *consistency* check, NOT
  binary verification. Labeled `consistent` not `verified`.
- **Prediction**: claims about future state (predictions.yaml).
  Never verified externally; resolves at horizon via the prediction
  schema. Premises (current-state claims the prediction rests on)
  still get factual treatment.

## The persistent artifacts

- `audit/CLAIMS_LEDGER.md` — every atomic claim, one row per
  `(claim, source)` pair. Monotonically grows. Verdicts persist
  across cycles. Never re-extracted from scratch unless prose has
  been substantially rewritten.
- `audit/CONCEPTS_INDEX.md` — canonical list of popular projects,
  funders, concepts the site SHOULD cover, with status per entity
  (`covered` / `mentioned` / `missing`). The recall artifact.
- `sources/{sha256-of-canonical-url}/{snapshot-timestamp}.json` —
  content-addressed snapshot store. Each snapshot has trafilatura-
  extracted text, HTTP headers, Wayback URL, content hash.

## Verdict enum

Per row in `CLAIMS_LEDGER.md`:

| Verdict | Meaning |
|---|---|
| `supported` | The cited source entails the claim. Verifier confident. |
| `contradicted` | The cited source contradicts the claim. Fix the claim. |
| `unsupported` | The cited source is relevant but does not entail the claim. Add a better source or soften the claim. |
| `consistent` | (Framing claims only.) Paragraph is consistent with cited sources. Not "verified." |
| `pending_horizon` | (Predictions only.) Cannot be verified until the horizon date. |
| `source_unreachable` | Source URL returned 4xx/5xx or unrecoverably changed. Resnapshot or replace. |
| `verifier_unable` | Verifier could not produce a verdict (content too long, parsing failure, etc.). NOT the same as `unsupported`. |
| `stale_pending_review` | Source content hash changed since last verification; row queued for re-check. |
| `needs_human` | Verifier disagrees with prior verdict or reader-inference surfaced. Human triage. |

**Pre-push gate**: every row is `supported`, `consistent`, or
`pending_horizon`. Any other verdict blocks the build.

## Decomposition pattern

Atomic at the *property level*, not the sentence level. Critically,
each atomic claim is **decontextualized** ("molecular fact" per Choi
2024) so it carries the minimum context needed to verify
independently:

- Bad: "Their first round funded 8 projects." (no antecedent)
- Good: "HRF's first AI for Individual Rights grant round (November 2025) funded 8 projects."

Decomposition is a versioned artifact. Each ledger row stores:
`decomposition_prompt_version`, `extractor_model`, `source_content_hash`.
Re-decompose only when source content or decomposition prompt
changes.

## Check-worthiness filter

Between decomposition and verification, every claim is routed:

- Framing predicates ("the most important," "the de facto standard")
  → consistency-check lane, label `framing`
- Future-tense + horizon predicates → prediction lane,
  label `prediction`
- Specific quantities, dates, attributions, license declarations →
  factual lane, full entailment

Pattern from VeriScore (EMNLP 2024) — mixing them silently corrupts
verification scores.

## Verification model layering

Per-claim verification happens **in-session** under the agent's Claude
subscription, not via an API key. The `audit/verify/verify_entailment.mjs`
script does NOT call an LLM: it loads the row + snapshot and prints a
prompt for the agent to read. The agent judges in this session and
writes the verdict back via the script's `update` subcommand.

This is the same pattern an internal claims-ledger system uses: claims and sources
are the persistent artifact; the model is whoever happens to be in the
session reading the prompt.

Tiers, by escalation:

1. **In-session Claude (default)** — the agent reads the printed
   prompt, finds an `evidence_span` in the snapshot (or doesn't), and
   writes the verdict. No API cost. This is what the scheduled
   `audit-layer2` and `audit-layer3` routines do.
2. **Cross-family escalation** — for any row where in-session Claude
   returns low-confidence `supported`, the row is routed to a
   different model family (Gemini / GPT in a separate session) to
   break self-preference bias (Panickssery 2024, Liu 2024). The
   ledger-update CLI is identical regardless of who ran the judgment.
3. **Local NLI fallback (planned)** — HHEM-2.1-Open / MiniCheck as a
   cheap pre-filter for high-volume re-verification. Not yet wired.
4. **Human review** — for `needs_human` rows (verifier disagreement,
   reader-inference findings, novel claim types).

The cross-family discipline matters most for the extractor↔verifier
boundary at first extraction. For routine re-verification of an
already-supported row, same-family is acceptable to keep cost zero.

## Source freshness pattern

For each cited URL, the snapshot store keeps:

- Trafilatura-extracted main content (so navbar churn does not
  trigger false positives)
- Content hash (SHA-256 of extracted text)
- HTTP `Last-Modified` and `ETag`
- Wayback Machine snapshot URL (fallback when source 404s in the
  future)

Freshness check sequence (cheap → expensive):

1. HEAD request. If `Last-Modified`/`ETag` matches store, no re-verify.
2. If headers changed, GET + extract + hash. If hash matches store,
   update headers, no re-verify.
3. If hash changed, mark all rows pointing at this source
   `stale_pending_review` and queue for re-verification.

Pattern from the recent Internet Archive Link Fixer (Feb 2026) and
the Klein et al. reference-rot study (~75% content drift even when
URL still resolves).

## Layer cadences

| Layer | Cadence | Cost | Scope |
|---|---|---|---|
| 0 structural | every commit | ~0.5s, $0 | JSON Schema validates every YAML shape |
| 1 mechanical | every commit | ~5s, $0 | Link liveness, cross-refs, license files, voice rules, citation presence |
| 2 entailment | per source-hash change | in-session, $0 | Per-(claim,source) entailment check by the agent against snapshot |
| 3 cross-family | low-confidence rows + quarterly | in-session, $0 | Same prompt, different model family (Gemini / GPT) to break self-preference |
| 4 consistency | framing claims, quarterly | in-session, $0 | Paragraph-level "is this framing consistent with cited sources" |
| 5 horizon resolver | per-prediction at horizon | one-shot per prediction | Predictions resolve when their date arrives |
| 6 recall | quarterly + after major rewrites | in-session, $0 | Adversarial re-extraction with different prompt; surface claims the extractor missed |

## Adding a new verifier rule

When a finding slips past the verifiers, encode it before fixing the
finding:

1. Identify the pattern. Is it structural (JSON Schema), mechanical
   (linter rule), or semantic (NLI/LLM)?
2. Add the rule to the appropriate layer.
3. Re-run that layer across the whole ledger to flush other instances.
4. Fix all surfaced rows.

The ledger and the verifier suite are the artifact's audit memory.
They grow monotonically.

## Recall pass

Verification frameworks measure *precision* (% of extracted claims
that hold up). Recall (did we extract every claim that should be
verified?) is the silent failure for curated content.

Quarterly: an adversarial extractor with a DIFFERENT prompt re-reads
each source file and surfaces:

- Claims not already in the ledger → `discovered_uncovered` queue
- Implicit claims ("no other funder does this") that the literal-
  prompt extractor misses → `discovered_implicit` queue

Human triage decides whether to add the discovered claim to the
ledger (which then routes through normal verification) or to revise
the prose to remove the implicit assertion.
