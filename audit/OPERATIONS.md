# Audit Operations Guide

Day-to-day cookbook. For the architecture, see `audit/RUNBOOK.md`.

## The cheapest-first principle

Every task starts at Layer 0 (structural) and only escalates when
needed. Most edits never trigger anything past Layer 1.

## How the LLM steps run

There is no API key for this system. Extraction and verification both
run **in-session** under your Claude subscription:

1. Run a script subcommand that prints a prompt + the source/snapshot
   text inline.
2. Read the prompt and produce the required JSON in-session.
3. Pipe the JSON back to the persistence subcommand.

The scripts are pure I/O: loaders, prompt renderers, ledger writers,
hash-state trackers. They never call an LLM themselves.

## Scenario index

- [I edited a project description / funder mission / grant text](#1-edit-to-existing-yaml-content)
- [I added a new project / funder / grant entry](#2-new-yaml-entry)
- [I edited a layer overview MDX or page-copy prose](#3-edit-to-mdx-or-page-copy)
- [A source URL changed contents](#4-source-content-drift)
- [I added a new claim type the verifiers do not know about](#5-new-claim-type)
- [A scheduled routine flagged something](#6-scheduled-finding)
- [I want a full re-verification](#7-full-re-verify-manual-trigger)

---

## 1. Edit to existing YAML content

You changed a `description`, `mission`, `notable_recent`, or
`explainer` field.

```bash
npm run audit:layer1        # Layers 0 + 1 mechanical
```

If green, the edited record's hash changes, which the next pending
check picks up. To re-extract immediately:

```bash
node audit/extract/extract.mjs show data/funders.yaml --slug hrf
# Read the printed prompt, produce the JSON claims array, then:
echo '<json>' | node audit/extract/extract.mjs append data/funders.yaml hrf
```

## 2. New YAML entry

You added a new project / funder / grant.

```bash
npm run audit:layer1                                  # structural + mechanical
node audit/extract/extract.mjs pending --all-priority # confirm the new entry shows up
node audit/extract/extract.mjs batch --limit 10 --all-priority
# For each printed RECORD prompt: produce JSON, append with:
#   echo '<json>' | node audit/extract/extract.mjs append <relPath> <recordKey>
node audit/verify/verify_entailment.mjs batch --limit 10
# For each printed ROW prompt: produce verdict JSON, update with:
#   node audit/verify/verify_entailment.mjs update <row-id> --verdict X --evidence "..." --notes "..."
```

## 3. Edit to MDX or page-copy

You changed an editorial paragraph in `src/content/layers/<slug>.mdx`
or in an `.astro` page.

```bash
npm run audit:layer1
node audit/extract/extract.mjs show src/content/layers/silicon.mdx
# Produce JSON, append, verify as in scenario 2.
```

If the edit is to framing prose only (no quantitative claims, no
named-entity assertions), the consistency check runs at the next
quarterly cycle.

## 4. Source content drift

The Layer 2 freshness check found a source whose content hash
changed since the last snapshot. All rows pointing at that source
get marked `stale_pending_review`. To resolve:

```bash
npm run audit:snapshot:stale                                       # refresh older-than-30-day snapshots
node audit/verify/verify_entailment.mjs batch --status stale_pending_review --limit 10
# For each printed ROW prompt: judge against the new snapshot, update.
```

The verdict either restores (content drifted but the claim still
holds) or flips to `contradicted` / `unsupported`.

## 5. New claim type

You added a kind of claim the verifiers do not yet route correctly.

1. Identify the routing signature (regex, structural pattern, etc.).
2. Edit `audit/EXTRACTION_PROMPT.md` to document the new claim type.
3. Re-run extraction across the affected files (the prose hash will
   match unless prose changed, so explicitly:
   `node audit/extract/extract.mjs show <file>`).
4. Re-run verification on the newly-routed claims.

## 6. Scheduled finding

A scheduled routine (weekly / quarterly) wrote to
`audit/CLAIMS_LEDGER.md` or to `data/inbox/`. To triage:

```bash
node audit/verify/verify_entailment.mjs summarize    # count by verdict
node audit/verify/verify_entailment.mjs pending --status contradicted
node audit/verify/verify_entailment.mjs pending --status unsupported
node audit/verify/verify_entailment.mjs pending --status needs_human
```

Then fix the source content (YAML or MDX), commit, and re-extract
the affected record.

## 7. Full re-verify (manual trigger)

You want to re-verify every row regardless of diff.

```bash
node audit/verify/verify_entailment.mjs batch --status supported --limit 50
# Iterate: read prompts, judge, update. Loop until all rows refreshed.
```

This is what the quarterly `audit-layer3` scheduled task does
automatically. Plan for a long session.

## Status quick-reference

```bash
node audit/verify/verify_entailment.mjs summarize
```

Prints:
- Total rows in ledger
- Verdict counts (supported / consistent / pending_horizon / ...)
- Percent in each bucket
