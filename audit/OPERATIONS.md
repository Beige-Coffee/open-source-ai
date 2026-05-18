# Audit Operations Guide

Day-to-day cookbook. For the architecture, see `audit/RUNBOOK.md`.

## The cheapest-first principle

Every task starts at Layer 0 (structural) and only escalates when
needed. Most edits never trigger anything past Layer 1.

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

If green: any factual claim you touched will be re-verified
automatically on the next scheduled Layer 2 run (weekly). If the
change is urgent, run:

```bash
npm run audit:re-extract -- data/funders.yaml hrf
```

This re-runs the extractor on the named record, re-decomposes its
claims, and queues them for Layer 2.

## 2. New YAML entry

You added a new project / funder / grant.

```bash
npm run audit:layer1                          # structural + mechanical
npm run audit:extract -- data/projects.yaml   # extract claims from the new entry
npm run audit:verify -- --since-last-extract  # verify the new claims
```

The extract step adds new rows to `audit/CLAIMS_LEDGER.md` with
verdict `needs_verification`. The verify step drains the queue.

## 3. Edit to MDX or page-copy

You changed an editorial paragraph in `src/content/layers/<slug>.mdx`
or in an `.astro` page.

```bash
npm run audit:layer1
npm run audit:re-extract -- src/content/layers/silicon.mdx
npm run audit:verify -- --since-last-extract
```

If the edit is to framing prose only (no quantitative claims, no
named-entity assertions), the consistency check runs at the next
quarterly cycle; no immediate verification needed.

## 4. Source content drift

The Layer 2 freshness check found a source whose content hash
changed since the last snapshot.

The routine auto-marks all rows pointing at that source as
`stale_pending_review` and queues them. To resolve:

```bash
npm run audit:verify -- --status stale_pending_review
```

The verifier re-fetches the snapshot, re-runs entailment, and either
restores the prior verdict (content drifted but the specific claim
still holds) or flips to `contradicted` / `unsupported` (the claim
no longer holds against the new content).

## 5. New claim type

You added a kind of claim the verifiers do not yet route correctly.

1. Identify the routing signature (regex, structural pattern, etc.).
2. Add the rule to `audit/verify/route_claims.mjs`.
3. Re-run extraction across the affected files.
4. Re-run verification on the newly-routed claims.

## 6. Scheduled finding

A scheduled routine (weekly / quarterly) appended a finding to
`audit/CLAIMS_LEDGER.md` or to `data/inbox/`. To triage:

```bash
npm run audit:status               # summary of verdict counts + pending items
```

Then fix the source content (the YAML or MDX), commit, and re-run:

```bash
npm run audit:layer1
npm run audit:verify -- --since-last-extract
```

## 7. Full re-verify (manual trigger)

You want to re-verify every row regardless of diff. Costs real LLM
tokens.

```bash
npm run audit:full-verify
```

Equivalent to the quarterly Layer 3 scheduled run. Plan for ~1-2
hours wallclock.

## Status quick-reference

```bash
npm run audit:status
```

Prints:
- Total rows in ledger
- Verdict counts (supported / consistent / pending_horizon / ...)
- Rows pending verification
- Stale sources (content-hash drift detected)
- Discovered-uncovered queue (recall pass findings)
```
