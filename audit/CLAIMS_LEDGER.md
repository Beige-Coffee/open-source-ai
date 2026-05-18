# Claims Ledger

This file is the source of truth for every atomic claim made
anywhere on the open-source-ai-stack site. Each row is one
`(claim, source)` pair. Verdicts persist across audit cycles. The
ledger only grows; it is never re-extracted from scratch unless
prose has been substantially rewritten.

Schema definition lives in `audit/RUNBOOK.md`. Extraction prompt for
new rows lives in `audit/EXTRACTION_PROMPT.md`. Recall-pass prompt
lives in `audit/RECALL_PROMPT.md`. Verification prompt lives in
`audit/AGENT_VERIFICATION_PROMPT.md`.

## Verdict enum (full definitions in RUNBOOK.md)

- `supported` — entailed by cited source. Verifier confident.
- `contradicted` — contradicted by cited source. Fix the claim.
- `unsupported` — cited source does not entail. Add a better source.
- `consistent` — framing claim is consistent with sources (NOT verified).
- `pending_horizon` — prediction; resolves at horizon date.
- `source_unreachable` — source URL 4xx/5xx or snapshot missing.
- `verifier_unable` — verifier could not produce a verdict.
- `stale_pending_review` — source content drifted; re-verification queued.
- `needs_human` — verifier disagreement or reader-inference finding.
- `needs_verification` — new row, not yet verified.
- `discovered_uncovered` — recall pass surfaced a missed claim.
- `needs_source` — recall pass surfaced a claim with no cited source.

**Pre-push gate**: every row is `supported`, `consistent`, or
`pending_horizon`.

## Bootstrap status

The first extraction pass has not run yet. Run with:

```bash
npm run audit:extract
```

## Rows

| ID | Surface | Location | Claim | Lane | Type | Cited sources | Verdict | Last verified | Notes |
|---|---|---|---|---|---|---|---|---|---|
