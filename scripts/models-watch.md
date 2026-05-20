# Weekly models-watch routine

**Task name:** `oss-ai-stack-weekly-models-watch`
**Cadence:** Mondays 10:00 PT
**Output:** `data/inbox/models-needs-review.jsonl`
**Never auto-publishes.**

The routine surfaces candidate new model checkpoints to a review
queue. Humans (and the next agent assist pass) decide whether to
promote them into `data/models.yaml`. The queue is append-only and
deduplicated by canonical model card URL.

## What it checks

1. **HuggingFace trending model cards (last 7 days)**
   - Fetch the public HF "new models" feed; pick anything with
     >1000 downloads in the last 7 days OR explicit lab attribution
     in the `library_name` field.
   - Lab attribution filter: `meta-llama`, `Qwen`, `deepseek-ai`,
     `mistralai`, `google`, `microsoft`, `allenai`, `moonshotai`,
     `01-ai`, `THUDM`, `nvidia`, `tencent`, `xai-org`.

2. **Lab blog feeds**
   - https://ai.meta.com/blog/rss/
   - https://qwenlm.github.io/blog/index.xml
   - https://www.anthropic.com/news/rss
   - https://openai.com/blog/rss.xml (research-only filter)
   - https://blog.google/technology/ai/rss/
   - https://allenai.org/blog/feed.xml
   - https://api.deepseek.com/news/rss (when public)
   - https://mistral.ai/news/index.xml

3. **arXiv `cs.CL` recent submissions**
   - Filter to abstracts mentioning a named model release with a
     model card link (`huggingface.co/`, `github.com/`, `*.github.io/`).
   - Skip survey papers + position papers.

## What it records

For each candidate, append one JSON line:

```json
{
  "candidate_id": "deepseek-ai/DeepSeek-V3.5",
  "found_at": "2026-05-25T17:00:00Z",
  "source_type": "huggingface",
  "source_url": "https://huggingface.co/deepseek-ai/DeepSeek-V3.5",
  "title": "DeepSeek V3.5",
  "developer": "DeepSeek",
  "released_date_estimate": "2026-05-22",
  "family_match": "deepseek",
  "siblings_already_in_catalog": ["deepseek-v3", "deepseek-r1"],
  "model_card_url": "https://huggingface.co/deepseek-ai/DeepSeek-V3.5",
  "abstract_or_summary": "...first 400 chars..."
}
```

## What it does NOT do

- Does NOT modify `data/models.yaml`. Promotion is manual: a human
  (or assist agent) reads the candidate, fetches the model card and
  paper, fills in the schema fields, runs `npm run audit:extract:models`
  to register the new ledger rows, then commits.
- Does NOT fetch benchmark scores. Benchmark scores from third-party
  leaderboards are often disputed; we wait for the lab's own
  published number with `as_of` date.
- Does NOT auto-publish anything to the site.

## Coverage gap audit (quarterly)

On the 1st of Mar/Jun/Sep/Dec, the routine cross-references
`data/models.yaml` against the trending HuggingFace lab tags and
flags families with NEW size variants or refreshes we have not
catalogued. Findings appended to
`data/inbox/models-coverage-gap.jsonl`.

## Composition with other routines

| Routine | Cadence | Models-related coverage |
|---|---|---|
| models-watch | Weekly Mon 10:00 | new model releases from known + new labs |
| audit:extract:models | On-demand | mint ledger rows for newly-added entries |
| audit:verify:batch | On-demand | verify ledger rows against snapshots |
| audit-layer3 | Quarterly 1st 12:00 | re-verify every model row regardless of diff |
| recall-pass | Quarterly 1st 13:00 | adversarial re-extract to catch missed claims |
