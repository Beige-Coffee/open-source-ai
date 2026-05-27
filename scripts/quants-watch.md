# Monthly quant-refresh routine

**Task name:** `oss-ai-stack-monthly-quants-refresh`
**Cadence:** 1st of each month, 09:30 PT
**Command:** `npm run quants:refresh`
**Output:** `data/inbox/quants-needs-review.jsonl`
**Never auto-publishes.**

Community quantizations drift: new GGUF / AWQ / GPTQ / EXL2 / MLX repos
appear for a model in the weeks after release, and occasionally a repo is
removed. This routine keeps `quantizations_available` honest without a
human re-checking 73 model trees by hand.

## What it does

`scripts/refresh-quants.mjs` reads every model in `data/models.yaml` that
carries a `quantizations_source` (its Hugging Face base repo), re-queries
the HF Hub model tree (`?filter=base_model:quantized:<repo>`), re-derives
the available format families, and diffs them against the families
currently stored. For each model whose families changed it appends one
JSON line to `data/inbox/quants-needs-review.jsonl`:

```json
{
  "slug": "llama-3-1-8b-instruct",
  "repo": "meta-llama/Llama-3.1-8B-Instruct",
  "current": ["gguf", "awq", "gptq", "exl2", "mlx", "fp8", "bnb"],
  "discovered": ["gguf", "awq", "gptq", "exl2", "mlx", "fp8", "bnb"],
  "added": [],
  "removed": [],
  "checked_at": "2026-06-01T16:30:00Z"
}
```

A model whose base repo no longer resolves is recorded with
`"issue": "source_unreachable"` for re-sourcing.

## Promotion (manual)

A human (or assist agent) reviews the queue and, for accepted drift:

1. Update `quantizations_available` for the slug in `data/models.yaml`.
2. `npm run audit:extract:models` to mint any new
   `models.<slug>.quant.<family>` ledger rows.
3. Verify the new rows against the model tree (the source is already on
   the entry), mark `supported`, and rebuild the verification map so the
   `/models` column + the `/models/<slug>` panel pick them up.

## What it does NOT do

- Does NOT edit `data/models.yaml` (same discipline as every routine).
- Does NOT add new format families to the taxonomy; new families (e.g.
  FP4 / NVFP4 / MXFP4 as Blackwell adoption grows) are a deliberate edit
  to `src/lib/quantization.ts`, not an automated discovery.
- Does NOT touch proprietary (closed-weight) models; they have no public
  quantizations by definition and carry no `quantizations_source`.

## Composition with other routines

| Routine | Cadence | Quant-related coverage |
|---|---|---|
| quants-refresh | Monthly 1st 09:30 | family drift for catalogued models |
| models-watch | Weekly Mon 10:00 | new model releases (their quants get sourced at promotion) |
| audit:extract:models | On-demand | mint quant ledger rows for added/changed entries |
| audit-layer3 | Quarterly 1st 12:00 | re-verify every model row, quant rows included |
