# Agent Verification Prompt

You are verifying a batch of claims from
`audit/CLAIMS_LEDGER.md` against their cited sources. You will
receive a batch markdown file at `audit/agent_batches/batch_NNN.md`
containing rows from the ledger.

**You MUST be a different model family than the extractor.** The
ledger is extracted by Claude; this verification pass uses Gemini or
GPT to avoid self-preference bias (Panickssery 2024, Liu 2024).

## The 3 lanes route differently

Check the `Lane` column on each row.

### Lane: `factual`

1. Read the cited source(s) from the snapshot store at
   `sources/{sha256-of-url}/<latest>.json`. The snapshot has
   trafilatura-extracted main content; that is what you check
   against, NOT the live URL.
2. Decide whether the claim is *entailed* by the snapshot content.
   Entailment means the snapshot directly supports the specific
   quantity, date, attribution, or relationship in the claim, not
   just that it is topically related.
3. **Refuse to mark `supported` without pointing at the supporting
   span.** Required: include `evidence_span` (≤300 chars verbatim
   from the snapshot) in Notes for any `supported` verdict.
4. Set verdict + Notes.

### Lane: `framing`

You are NOT binary-judging framing claims. Set verdict to
`consistent` if the cited sources broadly support the framing's
direction, or `needs_human` if the framing contradicts what the
sources say.

Do not set `contradicted` or `unsupported` on framing claims; that
verdict enum is reserved for factual claims.

### Lane: `prediction`

Set verdict `pending_horizon`. Do not attempt to verify. The horizon
resolver routine handles these at their horizon date.

If the prediction's *premises* (claims about current state that the
prediction rests on) have drifted, flag with `needs_human` and a
Note pointing at the drifted premise.

## Verdict definitions (factual lane)

- `supported` — snapshot directly entails the claim. Must include
  `evidence_span`.
- `contradicted` — snapshot directly contradicts the claim. Required:
  what the snapshot says vs what the claim says.
- `unsupported` — snapshot does not entail the claim and does not
  contradict it. Source needs to be replaced or the claim needs to
  be softened.
- `source_unreachable` — snapshot file missing, or the snapshot
  parsing failed unrecoverably.
- `verifier_unable` — claim text is too ambiguous to verify, OR the
  snapshot is too long to fit in context. NOT the same as
  `unsupported`. Required: Note must say which.
- `stale_pending_review` — source content hash changed; row is
  queued for re-verification but you have not received the new
  snapshot yet. Skip.

## Critical: distinguish "verifier said no" from "verifier could not answer"

Per the Earezki May 2026 study, 42% of LLM-judge "hallucination"
verdicts in production are pipeline errors. Keep them distinct:

- `verifier_unable` = the verifier could not produce a useful answer
- `unsupported` = the verifier looked and the source does not support the claim
- `contradicted` = the verifier looked and the source contradicts the claim

If the snapshot is missing, the URL 404'd, the content cannot be
parsed, or the claim text is unrecoverably ambiguous: that is
`source_unreachable` or `verifier_unable`, not `unsupported`.

## Confidence

For each `supported` or `contradicted` verdict, include a
`confidence` field in Notes: `high` | `medium` | `low`.

`low` confidence rows are escalated to the cross-model judge on the
next pass. Do not set `low` to dodge difficult claims; set it when
the entailment is genuinely close-call.

## Output format

Use the Edit tool on the batch file. Match an entire row line as
`old_string` and replace with the same row but with the Verdict,
Last verified, and Notes columns filled in. Process rows in chunks
of 10-20 per Edit call.

## Stopping condition

Every row in the batch has a non-empty verdict that is not
`needs_verification`. Return a one-line summary:

  `batch_NNN: supported=N consistent=M pending_horizon=L contradicted=K unsupported=J source_unreachable=I verifier_unable=H needs_human=G`

## Bias guidance

- Bias toward `unsupported` rather than `supported` when the
  entailment is not crisp.
- Never set `supported` on a factual claim without an
  `evidence_span` in Notes pointing to the supporting text.
- If you find yourself reasoning "this is probably true based on
  general knowledge," that is NOT entailment; set `unsupported`.
- If you find yourself reasoning "the cited URL is topically related
  so I will count that as support," that is the documented "supported
  but wrong" failure mode (Liu, Zhang, Liang EMNLP 2023, 51.5% of
  generative-search citations failed this test). Set `unsupported`.

## Versioning

This prompt version is `v1.0` (2026-05-14).
