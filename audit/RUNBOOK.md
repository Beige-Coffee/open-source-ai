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

Per-claim verification uses three tiers by cost:

1. **HHEM/MiniCheck (NLI)** — cheap, local, fast. Returns `supported`
   / `contradicted` / `unsupported` with a confidence score. Default
   verifier for factual claims.
2. **Cross-model judge (LLM)** — different model family from the
   extractor (Claude extracts, so the verifier is Gemini or GPT).
   Escalation when NLI verifier confidence is low OR when
   re-verifying a previously-supported claim that has had source
   content drift.
3. **Human review** — only for claims marked `needs_human` (verifier
   disagreement, reader-inference findings, novel claim types).

The extractor and verifier MUST be different model families.
Self-preference bias materially inflates pass rates if Claude does
both (Panickssery 2024, Liu 2024).

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
| 2 NLI entailment | per source-hash change | ~30s/claim, ~$0 (local model) | Per-(claim,source) entailment check via HHEM/MiniCheck |
| 3 LLM judge | low-confidence rows + quarterly | ~$0.001/claim Haiku, ~$0.01/claim Gemini | Cross-model escalation |
| 4 consistency | framing claims, quarterly | ~$0.005/paragraph | Paragraph-level "is this framing consistent with cited sources" |
| 5 horizon resolver | per-prediction at horizon | one-shot per prediction | Predictions resolve when their date arrives |
| 6 recall | quarterly + after major rewrites | ~$0.05/page | Adversarial re-extraction with different prompt; surface claims the extractor missed |

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
