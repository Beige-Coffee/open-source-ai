# Daily news routine playbook

This is the playbook the scheduled Claude agent executes every day at 08:00
Pacific. The agent's scheduled-task prompt is a short pointer to this file,
so this file is the canonical source of truth for how the routine behaves.
Editing this file changes the routine's behavior on the next run, no code
change required.

## Mission

Once a day, fetch news from the sources listed in `data/sources.yaml`,
dedupe and classify it by stack layer, summarize neutrally, and publish a
per-day MDX file at `src/content/news/YYYY-MM-DD.mdx` that the Astro site
renders at `/news/YYYY-MM-DD`. Commit and push so Vercel rebuilds.

## Inputs

- `data/sources.yaml` — ranked feed list per layer, with type (rss / scrape
  / json) and signal level.
- `data/news-rules.yaml` — anti-pattern blocklist, banned phrases, output
  schema, behavior caps.
- `data/layers.yaml` — canonical layer taxonomy. Routes must use these
  exact slugs.
- `data/last-run.json` — state file. Maps source id to last-seen item id
  or timestamp. Updated by this routine.
- `src/content/news/` — past issues. Inspect to avoid cross-day duplicates.

## Output

- `src/content/news/YYYY-MM-DD.mdx` — the day's issue, one MDX file.
- Updated `data/last-run.json` — post-run state.
- A git commit on `main` and a push to `origin`. Vercel auto-deploys.

## Three-stage pipeline

### Stage 1: Fetch

For each entry in `data/sources.yaml` (skip the `aggregators` group on the
first pass; come back to AINews / TLDR last):

- If `type: rss` — WebFetch the feed URL, parse entries.
- If `type: scrape` — WebFetch the page, extract titles and links via
  pattern matching against the previous run's known titles (in
  `data/last-run.json`).
- If `type: json` — WebFetch the JSON API, parse entries.

For each entry, compare against `data/last-run.json[<source_id>]`. If the
entry id (URL or hash) is newer than the recorded last-seen, it is a
candidate item. Collect candidate items into an in-memory list.

Update `data/last-run.json` with the new last-seen per source as you go.

Cap fetched items at `max_items_per_day * 3` to avoid an unbounded crawl
on the first run (which would see everything as new). Sort by source
signal level (very-high before high before medium); take the top.

### Stage 2: Dedupe + classify

For the candidate list:

1. **Block by domain** — drop any item whose host matches
   `data/news-rules.yaml.blocklist_domains`. Drop any URL matching a
   `blocklist_url_patterns` entry.
2. **Cross-day dedup** — read `src/content/news/` for the past 14 days.
   For each candidate, compute a simhash of (title + first 200 chars of
   any preview). If the candidate's simhash is within Hamming distance 4
   of a past-day item, drop it.
3. **In-day dedup** — same simhash check across candidates within today's
   batch. If two candidates cluster, keep the one from the higher-signal
   source.
4. **Classify** — for each remaining item, route to exactly one layer slug.
   Use the source's `layer` field as the default. If the title or content
   strongly indicates a different primary layer, override and note the
   override.
5. **Cap** — at most `max_items_per_layer_per_day` items per layer. If a
   layer overflows, keep the highest-signal items.

If total kept items is below `min_items_to_publish`, write an empty
issue with a note "Quiet day at the open-source AI stack." Still commit;
the daily rhythm matters.

### Stage 3: Summarize + publish

For each kept item, draft a 2-4 sentence neutral-observational summary.
For each layer with new items, optionally draft a 1-sentence layer
takeaway.

Draft a one-paragraph editorial letter for the top of the issue. It
names the layers with new items, calls out the single most significant
release of the day (use signal-level and recency as the tie-breaker),
and stops. 2-4 sentences. No em dashes. No banned phrases.

Generate the MDX file:

```mdx
---
date: 2026-MM-DD
editorial_letter: "<one paragraph>"
item_count: N
layer_buckets:
  <layer>: <count>
  ...
---

## <Layer Title>

### <Item title>

<2-4 sentence summary, neutral-observational, no em dashes.>

Source: [<source name>](<url>)
```

Group items by layer in the order defined in `data/layers.yaml` (core
first, then meta). Skip layers with zero items.

## Editorial rules (enforce before commit)

Run every string through this filter:

- **No em dashes.** Replace with commas, colons, or restructure into two
  sentences. The full Unicode em dash (U+2014) is banned.
- **No banned phrases.** See `data/news-rules.yaml.banned_phrases`. If
  found, rewrite. If the rewrite would change meaning, flag the item to
  the `needs_review_queue` and skip publishing it today.
- **Neutral voice.** Editorial letter is observational ("today the
  runtime layer saw three releases"), not opinion ("a major win for
  open source today"). Per-item summaries are factual.
- **Specific over abstract.** Names, dates, version numbers, license
  tags. "vLLM 0.8 shipped" beats "the inference layer saw progress."
- **Cite the primary source.** Every item links to the canonical URL.
- **No marketing slop.** "transformative," "robust," "leveraging,"
  "utilize" are banned (see news-rules.yaml).

## Commit and push

Once the MDX is written:

```
cd /Users/austinv2/code/open-source-ai-stack
git add src/content/news/YYYY-MM-DD.mdx data/last-run.json
git commit -m "news: YYYY-MM-DD daily roundup (N items, layers: a, b, c)"
git push origin main
```

Vercel detects the push and rebuilds the site within ~30 seconds.

## Idempotency and failure handling

If the routine runs twice on the same day (manual re-run or duplicate cron
fire):

- If `src/content/news/YYYY-MM-DD.mdx` already exists, **do not overwrite**.
  Instead, log "already published today" and exit successfully.
- If you need to re-publish (e.g., a correction), delete the file manually
  first and re-run.

If a fetch fails for a source:

- Log it to a `data/inbox/fetch-errors.jsonl`.
- Continue with the remaining sources. Do not abort the run.
- If more than 30% of sources fail, abort and notify (the cron config
  surfaces the error).

If git push fails:

- Save the MDX file but do not commit. Log to `data/inbox/push-errors.jsonl`.
- The next successful run will retry the push.

## Out of scope (do not do)

- Do not modify the layer taxonomy. Taxonomy changes go through a separate
  human-driven flow.
- Do not write opinion pieces, essays, or editorial expansion beyond the
  one-paragraph letter at the top.
- Do not change `data/sources.yaml` or `data/news-rules.yaml`. If the
  source list needs an update, surface it as a `needs-review` note for
  human action.
- Do not auto-publish items lacking a primary source URL.
- Do not invent items, version numbers, or release dates. If a fact cannot
  be verified from the source page, do not publish it.

## First-run behavior

The first time this routine runs, `data/last-run.json` is empty. To avoid
publishing a giant "everything ever" issue:

- For the first run only, cap kept items to 10 and prefer items from
  signal-level=very-high sources.
- Write a one-line note in the editorial letter that this is the
  inaugural issue.

## Health monitoring

Each run appends a line to `data/inbox/run-log.jsonl` with:

```json
{"timestamp": "...", "duration_ms": ..., "items_fetched": N, "items_kept": M, "layers_covered": [...], "errors": [...]}
```

A weekly health check (manual, not automated) reads this log and flags:
- Runs that fetched zero items (source breakage).
- Layers that went 5+ days with zero items (source-list gap).
- Consistent fetch errors from a single source (drop or fix).

## Repository links

- Site repo: https://github.com/Beige-Coffee/open-source-ai
- Domain: https://open-source-ai.tech
- Local checkout: /Users/austinv2/code/open-source-ai-stack
