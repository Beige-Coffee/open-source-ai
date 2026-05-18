# Claim-Extraction Prompt

You are extracting **atomic, decontextualized claims** from a source
file in the open-source-ai-stack repo. You are NOT judging
correctness. You are NOT flagging voice violations. You are NOT
looking for bugs.

Your only job: list every checkable assertion the file makes, one
per row, in the schema below.

## Decontextualization rule (mandatory)

A claim is atomic at the **property level**, not the sentence level,
AND it carries the minimum context needed to verify independently.
This is "molecular facts" per Choi 2024 / DnDScore. Vanilla atomic
decomposition (FactScore) strips antecedents and silently makes
claims unverifiable.

**Bad** (lost antecedent):
> "Their first round funded 8 projects."

**Good** (decontextualized):
> "HRF's first AI for Individual Rights grant round (announced November 2025) funded 8 projects."

Rule of thumb: a stranger reading just the claim, without the
surrounding paragraph, should be able to verify it against the
cited source.

## What counts as a claim

Anything that can be true or false against an external source or an
internal cross-reference:

- Dollar amounts with funder + recipient + date context attached
- Counts ("8 inaugural grantees" → must include funder + round name + year)
- License declarations ("vLLM is Apache 2.0")
- Attributions ("Jim Keller leads Tenstorrent")
- Dates ("DeepSeek-R1 released January 2025")
- Production-readiness claims that name a specific deployer ("Used by Anthropic for Claude Code's MCP integration")
- Layer / focus / maturity tag values
- Cross-references between entries ("(Project: vllm)" cites a real slug)
- Numerical specs ("Apple M4 Max has 546 GB/s memory bandwidth")

## What does NOT count

- Pure framing prose ("the dominant open inference engine"). This is
  routed to the consistency-check lane, not extracted as a fact.
- Headings and section labels without claims.
- Predictions about the future (those live in predictions.yaml with
  their own resolution mechanism).
- Editorial voice ("Read like Bloomberg, not a marketing post.").

## Classification (route the claim)

For each extracted claim, set `lane`:

- `factual` — quantitative or attributable, fully verifiable against
  a cited URL
- `framing` — interpretive ("the most important," "the de facto
  standard," "best in class"). Will route to consistency-check.
- `prediction` — explicitly about future state. Route to horizon
  resolver.

If the claim is `framing` but contains an embedded factual claim
(e.g., "the dominant engine, with 70% of deployments"), extract the
factual sub-claim as a separate row in the `factual` lane.

## Output row schema

Append rows to `audit/CLAIMS_LEDGER.md` in this format:

```
| ID | Surface | Location | Claim | Lane | Type | Cited sources | Verdict | Last verified | Notes |
```

- **ID**: `<file-stem>.<record-slug>.<field>.<NNN>` e.g.
  `funders.hrf.notable_recent.001`
- **Surface**: `yaml-funder` / `yaml-grant` / `yaml-project` /
  `yaml-reading` / `mdx-layer` / `astro-page`
- **Location**: `file:line` or YAML path
- **Claim**: the decontextualized atomic claim, ≤200 chars preferred
- **Lane**: `factual` | `framing` | `prediction`
- **Type**: `amount` | `count` | `date` | `attribution` | `license` |
  `deployer` | `spec` | `cross-reference` | `tag-value` |
  `framing-prose` (lane=framing) | `prediction-prose` (lane=prediction)
- **Cited sources**: comma-separated list of URL(s) the claim should
  be checked against (the entry's `url`, plus anything in `sources`
  field, plus inline URLs in the prose)
- **Verdict**: leave as `needs_verification` for new rows
- **Last verified**: blank for new rows
- **Notes**: any decomposition context worth preserving (≤120 chars)

## Stopping condition

Process the entire file. Return a one-line summary:

  `extracted N rows: factual=K framing=M prediction=L`

## Versioning

This prompt version is `v1.0` (2026-05-14). When extraction prompt
changes materially, bump the version. The ledger rows store the
extraction prompt version so re-extraction can be triggered when the
prompt drifts.
