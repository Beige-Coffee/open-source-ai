# Monthly grants-discovery routine

Runs on the 1st of each month at 11:00 PT via the scheduled-tasks
MCP. Actively hunts for grants and funders we do NOT already track,
and surfaces candidates to a review queue.

This routine is the **coverage** complement to the weekly grants-watch
(which catches new announcements from funders we already track) and
the quarterly grants-audit (which re-verifies existing entries). The
three together address accuracy, recency, and coverage as a system.

## Inputs

- Repo root: `/Users/austinv2/code/open-source-ai-stack`
- Read: `data/funders.yaml` (the existing funder set)
- Read: `data/grants.yaml` (the existing grant set, for dedup)
- Read: `data/inbox/funder-candidates.jsonl` and
  `data/inbox/grant-candidates.jsonl` (prior runs, to skip
  re-flagging the same items)
- Write: append to those two inbox files

## Procedure

### Step 1: Search for new funders

Use WebSearch with rotating queries covering the editorial scope of
this site. Suggested query rotation (cycle through over months):

1. `"open source AI grant" 2026 announcement`
2. `"AI safety grant" foundation 2026`
3. `"sovereign AI grant" OR "decentralized AI grant" 2026`
4. `"AI for individual rights" grant program`
5. `"open weights" grant OR fellowship 2026`
6. `"AI infrastructure grant" foundation`

For each query, pull the first ~15 results. For each result:

- Extract the funding organization name and URL if it is a grant
  program announcement
- Check the URL host against existing funders' URL hosts in
  `data/funders.yaml`. If it matches a known funder, skip (the
  weekly grants-watch covers it)
- If the host is new, WebFetch the page and check whether it is
  describing a real grant program (not a single-grant press
  release for an existing funder, not a job posting, not an
  unrelated AI announcement)
- If real and new, record a `funder_candidate` entry:

```json
{
  "timestamp": "...",
  "kind": "funder_candidate",
  "name": "...",
  "url": "...",
  "discovered_via_query": "...",
  "brief": "1-2 sentence summary of what they fund",
  "fit_score": "high|medium|low",
  "fit_reason": "why this matches or does not match the site's editorial scope"
}
```

`fit_score: high` means cypherpunk-adjacent or sovereignty-positioned
or covers a layer with thin existing coverage. `low` means
mainstream AI-policy or AI-safety-research-only without an OSS
deliverable.

### Step 2: Search for missed grants from known funders

For each funder in `data/funders.yaml`, count the existing grants
attributed to them in `data/grants.yaml`. Identify funders with
suspiciously low counts relative to their `funding_range` and
`cadence` (e.g. a funder whose `cadence` is "rolling, weekly" but
which has only 1 grant in our database is suspect).

For each suspect funder, WebFetch their grant-announcement page
(typically `<funder url>/grants`, `<funder url>/portfolio`,
`<funder url>/awards`, or linked from the homepage) and extract
named grants from the page. For each named grant:

- Check against `data/grants.yaml` for a title or recipient match
- If no match found, record a `grant_candidate` entry:

```json
{
  "timestamp": "...",
  "kind": "grant_candidate",
  "funder_slug": "...",
  "title": "...",
  "recipient": "...",
  "url": "...",
  "amount_label": "...",
  "date": "YYYY-MM",
  "brief": "1-2 sentence description",
  "suggested_layers": ["..."]
}
```

### Step 3: Cross-check against external trackers

Check a small set of external grant trackers (AI Snake Oil, FLI
news, AI Safety Newsletter, the Linux Foundation's AAIF news page)
for any announced grants we have not yet captured. Same `grant_candidate`
shape as above.

## Output

Append all findings to:
- `data/inbox/funder-candidates.jsonl` (new funders)
- `data/inbox/grant-candidates.jsonl` (new grants for known funders)

End each run with a summary entry in `data/inbox/run-log.jsonl`:

```json
{
  "timestamp": "...",
  "routine": "grants-discovery",
  "queries_searched": N,
  "funders_checked": M,
  "new_funder_candidates": K,
  "new_grant_candidates": L,
  "next_run_due": "YYYY-MM-DD"
}
```

## What the routine does NOT do

- Does NOT modify `data/funders.yaml` or `data/grants.yaml`. All
  additions are manual.
- Does NOT auto-publish anything to the public site.
- Does NOT re-flag candidates already in the inbox files from prior
  runs unless something has materially changed (new grant amount
  disclosed, status changed from "announced" to "awarded", etc.).

## What happens after the discovery run

The next human or agent editing `funders.yaml` / `grants.yaml` reads
the candidate files first. For each candidate:

- If high-fit and verifiable, add the entry to the canonical YAML
  files (subject to the citation-discipline rule and the prebuild
  linter)
- If not a fit, archive the candidate by appending a `dismissed:
  YYYY-MM-DD reason: ...` line to the JSONL entry
- Re-running the discovery routine should not re-surface dismissed
  candidates

The candidate files are append-only; do not edit historical entries.

## Commit

After the run, commit the updated inbox files:

```
git add data/inbox/funder-candidates.jsonl data/inbox/grant-candidates.jsonl data/inbox/run-log.jsonl
git commit -m "grants-discovery: N funder + K grant candidates (YYYY-MM-DD)"
git push origin main
```
