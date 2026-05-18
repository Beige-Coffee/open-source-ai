# Recall Pass Prompt

You are looking for claims that the literal-prompt extractor missed.
This is the **recall** pass; the extractor measures precision (was
every extracted claim true), but says nothing about whether every
claim that should be checked actually got extracted.

For curated content, missed claims are more dangerous than wrong
claims. Run this pass quarterly + after any major rewrite.

## Use a DIFFERENT model and prompt than the literal extractor

This pass is adversarial. The literal extractor (see
`EXTRACTION_PROMPT.md`) reads text and writes one row per atomic
claim it sees. This pass reads the same text and writes one row per
claim the extractor MISSED.

## What to look for

### Implicit claims

Per WildClaims (Lazaridou et al. 2025), 18-51% of conversational
content carries implicit factual assertions; check-worthiness
methods bump that to 32-76%. For curated editorial prose, watch for:

- **Completeness claims**: "no other funder does this," "the only
  major project that...". Implicit: there exists no counterexample.
  Often the most-dangerous category.
- **Comparative claims**: "more X than Y," "outperforms Z."
  Implicit: a specific numerical relationship.
- **Causal claims**: "X happened because of Y." Implicit: a causal
  relationship.
- **Negation claims**: "X does not Y." Implicit: a specific
  capability gap.
- **Default claims**: "the standard," "the default." Implicit:
  adoption / consensus.

### Implied numerical context

Claims like "almost half," "the vast majority," "a handful" carry
implicit quantities. Re-extract these as factual claims with the
nearest verifiable quantity.

### Missing source citations

Claims that ARE in the prose but have no `cited_sources` because the
literal extractor could not find a URL nearby. Re-extract with
explicit `cited_sources: NONE` and surface as `needs_source`.

## Output

Append discovered claims to `audit/CLAIMS_LEDGER.md` with verdict
`discovered_uncovered` and a Note explaining what made it implicit.

Append discovered missing-source claims with verdict `needs_source`.

Both are queues for human triage. The human decides whether to:

1. Add the discovered claim to the ledger (which routes through
   normal verification), OR
2. Revise the prose to remove the implicit assertion (and re-run
   the literal extractor on the revised prose), OR
3. Add a source citation that the literal extractor will pick up
   next pass.

## Stopping condition

Process the entire file. Return:

  `recall_pass file=X: discovered_uncovered=N needs_source=M`

The file-level summary helps human triage prioritize.

## Versioning

This prompt version is `v1.0` (2026-05-14).
