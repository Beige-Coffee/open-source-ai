# Quarterly grants audit routine

Runs on the 1st of Mar/Jun/Sep/Dec at 10:00 PT via the scheduled-tasks
MCP. Audits every entry in `data/grants.yaml` and `data/funders.yaml`
against its primary URL and surfaces drift to a review queue.

## Inputs

- Repo root: `/Users/austinv2/code/open-source-ai-stack`
- Read: `data/grants.yaml`, `data/funders.yaml`
- Write: append findings to `data/inbox/grants-audit.jsonl`
- Read: previous audit log to avoid re-flagging the same issues

## Procedure

For each entry in `data/grants.yaml` and `data/funders.yaml`:

1. **URL liveness check**. WebFetch the entry's `url`. If it returns
   non-2xx or the page contents look unrelated (e.g. a generic 404
   page, a parked domain, a redirect to an unrelated host), record:
   ```json
   {"timestamp": "...", "kind": "dead_url", "entry_type": "grant|funder",
    "slug_or_title": "...", "url": "...", "issue": "404 / redirect to / parked"}
   ```

2. **Fact drift check**. For each specific claim in the entry's
   `description` (grants) or `mission` + `notable_recent` (funders),
   compare against what the live URL page says. Specifically check:
   - Dollar amounts (`$XM`, `$XK`, etc.)
   - Counts (`X grantees`, `Y projects`)
   - Dates (`announced YYYY-MM`, `closes YYYY-MM-DD`)
   - Named recipients

   For each mismatch, record:
   ```json
   {"timestamp": "...", "kind": "fact_drift", "entry_type": "grant|funder",
    "slug_or_title": "...", "claim_in_yaml": "...", "page_says": "...",
    "url": "..."}
   ```

3. **Consolidation check** (funders only). For each pair of funder
   entries, check:
   - Same URL host (e.g. both pointing to `cosmosgrants.org`)
   - Substantial substring overlap in `name` (case-insensitive)
   - One funder explicitly named as a partner in the other's `process`
     or `notable_recent`
   
   If any pair matches, record:
   ```json
   {"timestamp": "...", "kind": "consolidation_candidate",
    "funder_a_slug": "...", "funder_b_slug": "...",
    "reason": "shared url host / name overlap / mentioned as partner"}
   ```

## Output

Append all findings to `data/inbox/grants-audit.jsonl`, one JSON
object per line. Then summarize the run with a single tail entry:

```json
{"timestamp": "...", "kind": "summary", "entries_checked": N,
 "dead_urls": K, "fact_drifts": M, "consolidation_candidates": L,
 "next_quarter_due": "YYYY-MM-DD"}
```

## What the routine does NOT do

- It does NOT modify `data/grants.yaml` or `data/funders.yaml`. All
  resolutions are manual.
- It does NOT publish anything to the public site.
- It does NOT re-flag issues that already appear in
  `data/inbox/grants-audit.jsonl` from a prior run unless the issue
  has materially changed.

## Scope per run

Audit ALL entries each run. With ~80 grants and ~38 funders, that is
~118 WebFetch calls per quarter. Acceptable load. If WebFetch is
rate-limited or fails, retry once with backoff; if still failing,
record a `kind: fetch_error` entry and move on.

## What happens after the audit

The next human or agent editing `grants.yaml` / `funders.yaml`
reads `data/inbox/grants-audit.jsonl` first. For each finding,
either:
- Fix the entry (update facts, replace dead URL, consolidate funders)
- Mark the finding as expected (e.g. for a closed program where
  drift is intentional) by adding a comment in the YAML
- Append a `lint-allow:` comment if the discrepancy is acceptable

The audit log itself is append-only; do not edit historical
findings.
