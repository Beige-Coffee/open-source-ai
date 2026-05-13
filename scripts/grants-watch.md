# Grants-watch routine playbook

Weekly scheduled routine for surfacing new grant announcements relevant to
the open-source AI stack. Unlike the daily news routine, this one does
NOT auto-publish. Grants need human verification of funder, recipient,
amount, and date before they land in `data/grants.yaml`. The routine's
job is to find candidates and queue them for review.

## Mission

Once a week, fetch announcements from the grants-source list, identify
candidates that look like grant or funding events, surface them to
`data/inbox/grants-needs-review.jsonl` for human review on the next
manual pass. Do not edit `data/grants.yaml` or `data/funders.yaml`
directly.

## Inputs

- `data/grants-sources.yaml` — ranked source list for grant announcements
  (RSS feeds, scrape targets, JSON APIs).
- `data/funders.yaml` — known funders (for cross-reference).
- `data/grants.yaml` — already-tracked grants (for cross-day dedup).
- `data/last-run.json` — state; the routine adds a `grants_watch_*`
  key per source.

## Output

- `data/inbox/grants-needs-review.jsonl` — append-only candidate queue.
  Each line is a JSON object with the candidate fields below. Humans
  pull from this queue weekly, verify, and either:
  1. Move the entry into `data/grants.yaml` (and create a funder entry
     in `data/funders.yaml` if new), OR
  2. Discard if not a real grant or not on-topic.

Candidate schema (one JSON object per line):

```json
{
  "ingested_at": "2026-05-13T08:00:00-07:00",
  "source_id": "frontier-model-forum-updates",
  "url": "https://www.frontiermodelforum.org/updates/...",
  "title": "Announcement of new AI Safety Fund grantees",
  "raw_excerpt": "<200-char excerpt for context>",
  "candidate_classification": {
    "is_grant_announcement": true,
    "candidate_funder": "frontier-model-forum-aisf",
    "candidate_recipients": ["Apollo Research", "Caltech BioSentinel"],
    "candidate_amount_label": "$5M+ across 11 grantees",
    "candidate_layers": ["safety-guardrails", "agents"],
    "confidence": "high"
  }
}
```

## Three-stage pipeline (similar to daily-routine.md but weekly)

### Stage 1: Fetch grants sources

For each entry in `data/grants-sources.yaml`:
- RSS / Atom: WebFetch the feed.
- Scrape: WebFetch the page, extract titles + links.
- JSON: WebFetch the API.

Compare against `data/last-run.json[grants_watch_<source>]` to find new
items. Update state as you go.

### Stage 2: Classify

For each new item, classify:
- Does the title or first paragraph indicate a funding event? (announcement,
  award, grant, RFP, cohort, fellowship, etc.)
- Can you identify the funder? Match against `data/funders.yaml` slugs.
  If not in known funders, mark `candidate_funder: "new"`.
- Can you identify recipients? Extract names if visible.
- Can you identify amount? Extract the label as written.
- Which stack layer does the funded work fit? Use `data/layers.yaml`.

If classification confidence is low (no clear funder, no amount, no
recipient), still queue it for review but mark `confidence: "low"`.
A human can decide whether to investigate further.

### Stage 3: Queue for review

Append each classified candidate to
`data/inbox/grants-needs-review.jsonl`. Do not modify
`data/grants.yaml` or `data/funders.yaml`. Do not commit unless the
inbox queue file changed.

Commit message: `grants-watch: N candidates queued for review`.
Push so the inbox is visible in the repo for human pickup.

## Editorial rules

The routine does NOT generate prose to publish. It only writes
structured JSON candidates. Editorial rules apply only when a human
moves a candidate into `data/grants.yaml`:

- Verify primary source. The `url` field must resolve to a funder's
  own announcement, not a press-release rewrite.
- Verify date, amount, and recipient against the primary source.
- Attribute layers based on the project's primary focus; cross-layer
  attribution allowed.
- No em dashes anywhere.

## Idempotency

Multiple runs on the same week-day:
- Items already in `data/inbox/grants-needs-review.jsonl` should be
  detected by URL and not re-queued.
- The `data/last-run.json[grants_watch_<source>]` cursor advances on
  every successful fetch.

## Out of scope (do not do)

- Do NOT modify `data/grants.yaml` directly.
- Do NOT modify `data/funders.yaml` directly.
- Do NOT publish to `src/content/`.
- Do NOT auto-confirm funders, amounts, or dates that are not
  explicitly stated in the primary source. If you have to guess, the
  candidate is low-confidence; flag it that way.

## Repository links

- Site repo: https://github.com/Beige-Coffee/open-source-ai
- Local checkout: /Users/austinv2/code/open-source-ai-stack
- Grants public page: https://open-source-ai.tech/grants
