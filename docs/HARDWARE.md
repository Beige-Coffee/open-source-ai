# Hardware section: design

This is the canonical design document for the interactive `/hardware`
section. It captures the research and the decisions so a future agent
(or future-Austin) can resume the build cleanly. It mirrors the
structure and rigor of `docs/COURSE.md`.

Status: **Phase 1, written for review.** Nothing is built yet. Two
decisions are locked by Austin (scope and tokens/sec methodology,
flagged below); the rest are proposals. Open questions are at the end.

## Goal

Help a reader understand how hardware components relate to each other
when running open-source models, and let them explore the question
interactively: "if I pick this model at this quantization on this
hardware, does it fit, how many tokens per second can I expect, and
why?"

The centerpiece interaction: select a specific open-source model from
`data/models.yaml`, set a configuration (quantization, context length,
KV-cache precision), then for one or more hardware setups see whether
it fits, a memory-breakdown visualization, a theoretical decode
tokens/sec ceiling with the formula shown, an empirical tokens/sec
anchor where a sourced measurement exists, and a plain-language "why"
that traces the result back to memory bandwidth, memory capacity,
model size, and KV cache.

Around that core, broader educational views: how a hardware class (and
combinations of units) changes which models you can run and how fast,
and why architecture (bandwidth, capacity, interconnect) drives that.

## Audience and how it fits the rest of the site

Same audience-of-two posture as the rest of the site. The reader who
arrives here has likely read the self-host course track and wants to
turn its concepts into a concrete answer for a specific model and box.

The section is the interactive companion to the self-host track. The
course modules already carry the conceptual model this page
visualizes:

- `gpu-memory-math` gives the fit formula and the per-quant byte
  tables.
- `memory-bandwidth` gives the decode roofline, the five hardware
  bandwidth tiers, and the named parts list.
- `quantization-formats` gives bytes-per-weight per format.
- `kv-cache` (how-llms-work track) gives the KV-cache byte formula.
- `prefill-and-decode` gives the split this calculator models (decode,
  not prefill).

The page does not restate those modules. It computes against them and
links back to them. The "fit versus serve" framing from
`memory-bandwidth` is the spine: capacity decides what fits, bandwidth
decides how fast it serves, and they are not the same number.

## Locked decisions (from Austin)

**L1. Scope: the full physical spectrum. No cloud, no pricing.**
Datacenter GPUs (H100/H200/B200, MI300X/MI325X/MI355X), workstation
GPUs (RTX 5090, RTX PRO 6000 Blackwell, RTX 4090, Radeon AI PRO R9700,
Tenstorrent Blackhole), Apple unified memory (Mac Studio and MacBook
tiers), x86 unified-memory appliances (DGX Spark, Ryzen AI Max / Strix
Halo), AI-PC mobile parts (Snapdragon X / X2 Elite, Intel Lunar Lake).
All five physical tiers from the `memory-bandwidth` module. Cloud
rental and all dollar figures are out of scope (revised at review,
decision D3): the section is about hardware architecture and the
fit/speed relationship, not cost or where a model is hosted.

**L2. Tokens/sec methodology: both, as a hybrid view.** Always compute
a theoretical roofline ceiling and show the formula transparently.
Present three things on one scale: the ceiling (the physical limit,
labeled), a realistic band shown as a range (per-runtime, see D6), and
a verified empirical anchor overlaid wherever a measured number exists
for that model/hardware/quant/runtime. Every empirical point is sourced
and flows through the claims-ledger verification gate. Theoretical
estimates are labeled as estimates with the formula and the inputs
shown. Over time the per-runtime bands are calibrated from the
accumulated empirical anchors, so the estimate becomes data-derived
rather than a rule of thumb.

## Relationship to the existing silicon entries

`data/projects.yaml` already has eight silicon-layer entries:
`nvidia-h100`, `amd-mi300x`, `tenstorrent`, `risc-v`, `cerebras-cs3`,
`groq-lpu`, `apple-silicon`, `nvidia-h100-cc`. Those are editorial
entries: they frame the sovereignty argument, the CUDA software moat,
the open-ISA bet, production-readiness. They are not spec sheets and
they are one entry per product line, not per SKU.

**Decision (proposed): new `data/hardware.yaml`, cross-linked, not a
rewrite of the silicon projects.** Reasons:

- Different grain. The hardware section needs one row per SKU
  (`nvidia-h100-sxm` is distinct from `nvidia-h100-pcie` is distinct
  from `nvidia-h200-sxm`), the way `/models` is one row per
  checkpoint. `projects.yaml` is one row per product line.
- Different schema. Hardware rows carry numeric specs and a
  performance model; project rows carry editorial prose and a
  maturity label.
- Different framing. The silicon projects answer "who controls this
  and is it open"; hardware rows answer "does my model fit and how
  fast does it go."

Each hardware row carries an optional `silicon_project` slug so the
detail page links to the editorial entry (for example,
`nvidia-h100-sxm` links to project `nvidia-h100`). The silicon project
pages gain a reciprocal "see the specs and run a model on it" link
into `/hardware`. No duplication: specs live in `hardware.yaml`,
framing lives in `projects.yaml`.

This mirrors the precedent set when `/models` got its own
`data/models.yaml` rather than expanding `projects.yaml`.

## Data model

### `data/hardware.yaml`

One row per SKU. TypeScript types in `src/lib/hardware.ts`. Authoritative
schema added to `CLAUDE.md` once the build lands.

```yaml
hardware:
  - slug: nvidia-h100-sxm            # stable id, lowercase, includes variant
    name: NVIDIA H100 SXM5           # display name
    vendor: NVIDIA
    class: datacenter                # datacenter | workstation | apple-unified | x86-unified | ai-pc
    memory_capacity_gb: 80           # per unit
    memory_type: hbm3                # hbm3 | hbm3e | hbm4 | gddr7 | gddr6x | gddr6 | lpddr5x | unified-lpddr5x
    memory_bandwidth_gbs: 3350       # per unit, GB/s. THE key number for decode.
    compute:                         # all optional, all DENSE (never sparse)
      fp16_dense_tflops: 989
      fp8_dense_tflops: 1979
      fp4_dense_tflops: null         # Hopper has no FP4 path
      int8_dense_tops: 1979
    form_factor: sxm                 # sxm | oam | pcie | soc | mobile-soc | superchip
    power_w: 700                     # TDP per unit
    interconnect: nvlink             # nvlink | nvswitch | pcie | none. Informs multi-unit scaling caveat.
    multi_unit_default: 8            # typical deployment unit (8 for SXM nodes, 1 for workstation)
    release_date: 2022-09            # YYYY-MM or YYYY-MM-DD
    url: https://resources.nvidia.com/en-us-gpu-resources/h100-datasheet-24306
    silicon_project: nvidia-h100     # optional cross-link to projects.yaml
    notes: SXM5 board; HBM3. Node is typically 8x over NVLink/NVSwitch.
    sources:
      - title: NVIDIA H100 datasheet
        url: https://resources.nvidia.com/en-us-gpu-resources/h100-datasheet-24306
```

Field discipline:

- **Every numeric spec needs a primary source.** Vendor datasheet,
  official product page, or a reputable spec database (TechPowerUp) for
  consumer parts. The `sources` array is required; `url` is the single
  best primary link.
- **Dense compute only.** Vendors headline sparse tensor numbers that
  are double the dense figure. Store the dense number and never the
  sparse one. The seed appendix flags every place this trap appears.
- **Per-unit specs.** `memory_capacity_gb`, `memory_bandwidth_gbs`,
  and `power_w` are per single accelerator. Multi-unit composition is a
  calculator concern (see below), not a data concern, so we never
  duplicate an "8x H100" row.
- **`memory_bandwidth_gbs` is the most important field** for the
  decode model and is non-negotiable on sourcing.

### Runtime overhead profiles (decision D4)

The fit check models framework overhead per runtime, because
llama.cpp, vLLM, MLX, SGLang, and ExLlamaV2 differ in how much memory
they hold beyond raw weights (KV layout, CUDA-graph and compute
scratch, engine bookkeeping). The reader selects a runtime; the
calculator applies that runtime's overhead profile.

These profiles are calculator constants in `src/lib/hardware.ts`, not
`hardware.yaml` data, since they describe software rather than a chip.
Each profile is a documented estimate of the form `{ fixed_gb,
weight_fraction }`, sourced where a credible figure exists (for
example vLLM's default `gpu_memory_utilization` of 0.9, llama.cpp KV +
compute-buffer behavior) and labeled an estimate otherwise. A
build-phase research pass (parallel agents) sources these per runtime.
The profile is visible and editable in the explorer so the reader can
see and adjust the assumption.

### Multi-unit composition

The explorer lets the reader set a unit count per chip (1, 2, 4, 8).
The data stays per-unit; the calculator composes:

- Aggregate capacity = `count × memory_capacity_gb`.
- Aggregate bandwidth for tensor-parallel decode is approximately
  `count × memory_bandwidth_gbs × interconnect_efficiency`, where
  efficiency is a labeled estimate keyed off `interconnect`
  (NVLink/NVSwitch high, PCIe lower). The `inference-engines` and
  `production-serving` modules already make the point that tensor
  parallelism without NVLink hurts; the calculator surfaces that as a
  caveat next to the multi-unit number, not as a precise figure.

### Empirical anchors: `data/hardware-benchmarks.yaml`

Measured tokens/sec is a (model x hardware x config) fact, sparse by
nature, so it gets its own additive file rather than being stuffed
into either `hardware.yaml` or `models.yaml`.

```yaml
benchmarks:
  - model_slug: llama-3-3-70b-instruct
    hardware_slug: rtx-pro-6000-blackwell
    num_units: 1
    quant: q4_k_m
    context_length: 4096
    runtime: llama.cpp           # vllm | sglang | trt-llm | llama.cpp | mlx | exllamav2 | ollama
    batch: 1                     # single-stream decode by default
    decode_tok_s: 27.0
    ttft_ms: null                # optional
    as_of: 2026-05-20
    source: https://github.com/ggml-org/llama.cpp/discussions/4167
    via: null                    # set when the number is via an aggregator (e.g. Artificial Analysis)
    notes: single-stream, M-series comparison thread
```

Discipline: record the runtime and the quant every time. The
`benchmarking-operations` module is explicit that a tokens/sec number
without workload shape, hardware identity, and software identity is
not comparable. The schema forces those fields.

### The model-side gap (KV cache fields)

To compute KV-cache bytes the calculator needs, per model:
`layers_count`, `kv_heads`, `head_dim` (and `kv_precision`, which the
reader selects). `models.yaml` today has `layers_count` and
`attention_variant` but not `kv_heads` or `head_dim`.

**Decision (proposed): extend the `Model` type with optional
`kv_heads`, `head_dim`, and `hidden_size`, populated only for the
self-hostable models** (open and open-weights). You cannot run a
proprietary model on your own hardware, so the explorer's model picker
defaults to open and open-weights checkpoints, which conveniently
scopes the data-population task to that subset. For a model that
discloses its config (nearly all open-weights releases do, in the HF
`config.json`), these come straight from the model card and each gets
a ledger row like any other spec.

When `kv_heads`/`head_dim` are not disclosed, the calculator falls
back to a heuristic from `attention_variant` and `hidden_size` and
labels the KV term as estimated. The honest default, matching the
site's "never silently infer" rule, is to show the fallback as an
estimate, not as a fact.

## The computation model

Every formula below is documented so the explorer can show its work.
The reader should always be able to see the inputs and the arithmetic,
never just a number.

### Bytes per weight (by format)

From `quantization-formats` and `gpu-memory-math`:

| Format | bytes/param | Note |
|---|---|---|
| FP16 / BF16 | 2.0 | native training precision |
| FP8 (E4M3/E5M2) | 1.0 | native on H100+ and Blackwell; some models trained in it |
| INT8 | 1.0 | |
| 4-bit (INT4 / NF4 / AWQ-4 / GPTQ-4) | ~0.5 | plus small scale/zero-point overhead |

GGUF k-quants are not exactly bits/8 because they store block scales
inline. Per billion parameters (`gpu-memory-math`):

| GGUF quant | GB per 1B params |
|---|---|
| Q6_K | 0.82 |
| Q5_K | 0.69 |
| Q4_K | 0.56 |
| Q3_K | 0.43 |
| Q2_K | 0.33 |

The calculator uses the GGUF table for GGUF quants and bits/8 for the
others. Both are first-pass planning numbers, not contracts; the page
says so, echoing the module.

### KV cache bytes

From `kv-cache`:

```
kv_bytes_per_token = 2 * layers * kv_heads * head_dim * kv_precision_bytes
```

The factor of 2 covers keys and values. Worked check from the module:
a Llama-2-class 7B MHA model is `2 * 32 * 32 * 128 * 2 = 524,288`
bytes, about 0.5 MiB per token, so 32K tokens is about 16 GiB of KV
alone. GQA and MQA cut `kv_heads` sharply; MLA (DeepSeek) compresses
further. `kv_precision_bytes` is 2 for FP16 KV and 1 for FP8/INT8 KV,
which the reader toggles.

### Does it fit

```
weights_bytes      = total_params * bytes_per_param        # TOTAL params (MoE: all experts must load)
kv_bytes           = kv_bytes_per_token * context_length * concurrency
overhead_bytes     = fixed_overhead + headroom_fraction * weights_bytes
required_bytes     = weights_bytes + kv_bytes + overhead_bytes
capacity_bytes     = num_units * memory_capacity_gb

fits  <=>  required_bytes <= capacity_bytes
```

Assumptions, all stated on the page:

- MoE uses **total** params for the fit check. Every expert weight must
  be resident even though only a few activate per token. DeepSeek-V3
  must hold 671B even though it moves about 37B per token.
- `overhead_bytes` comes from the selected runtime's overhead profile
  (decision D4): `fixed_overhead + weight_fraction * weights_bytes`,
  with the constants drawn per runtime (llama.cpp, vLLM, MLX, SGLang,
  ExLlamaV2). Sourced where a credible figure exists, labeled an
  estimate otherwise, and visible and editable in the explorer. This
  is the module's "plan with 20-30% headroom" guidance made
  runtime-specific.
- `concurrency` defaults to 1 (single user). Raising it multiplies the
  KV term, which is how a model that fits at one user stops fitting at
  several.

### Decode tokens/sec (the roofline)

This is the memory-bound decode model, validated against the standard
references (kipp.ly "Transformer Inference Arithmetic", zeux.io "LLM
inference speed of light", Databricks MBU writeup; see appendix):

```
active_weights_bytes = active_params * bytes_per_param      # ACTIVE params (MoE: not total)
bytes_per_step       = active_weights_bytes + kv_bytes_per_token * context_length
ceiling_tok_s        = effective_bandwidth_bytes_per_s / bytes_per_step
realistic_tok_s      ~= ceiling_tok_s * MBU
```

- **Active, not total, params** drive the per-token cost. This is why
  an MoE model feels faster than its total size suggests.
- The KV term grows with context length, so decode slows as the
  conversation grows. At long context on a small model the KV term can
  exceed the weight term. This is the `kv-cache` module's "you pay the
  memory cost of all the tokens on every new token" made numeric.
- **MBU (model bandwidth utilization)** is the derating from ceiling to
  reality, and it is presented as a hybrid view (decision D6). Three
  things sit on one scale: the ceiling (100% MBU, the physical limit,
  labeled as such), a realistic **band shown as a range** that is
  tiered per runtime (well-optimized CUDA/vLLM higher around 75-85%,
  llama.cpp/MLX/Metal mid, AI-PC lower), and the **verified empirical
  anchor** overlaid whenever a measured number exists for the selected
  model/hardware/quant/runtime. Showing the band as a range rather than
  a single percent keeps it honest that these are rules of thumb, not
  sourced constants. A concrete calibration data point: an M2 Ultra
  (800 GB/s) measured about 12 tok/s on 70B-Q4 versus about 23
  theoretical, roughly 53%. Over time the per-runtime bands are
  calibrated from the accumulated empirical anchors, so the estimate
  becomes data-derived; this is why maximizing verified anchors
  (decision D1) compounds in value.
- `effective_bandwidth` for multi-unit is the composed figure from the
  multi-unit section, with the interconnect caveat shown.

The page labels the ceiling clearly as a theoretical ceiling and the
realistic band as an estimate, always shows `bytes_per_step` so the
reader can see what dominates, and puts the measured anchor on the same
scale so estimate-versus-reality is visible at a glance.

### Prefill and time-to-first-token (rough, educational; decision D5)

Decode is the precise headline. Prefill gets a deliberately rough,
clearly-labeled secondary estimate whose job is to teach the
compute-bound versus bandwidth-bound split, not to be a production
number. Prefill is compute-bound, so:

```
prefill_flops = 2 * active_params * prompt_tokens     # ~2 FLOPs per param per token (multiply-add)
ttft_s        ~= prefill_flops / (dense_flops * MFU)
```

- Uses the chip's dense FLOPS (already in the schema) at the selected
  precision. MFU (model FLOPs utilization) is the compute analogue of
  MBU, labeled an estimate.
- It is the rougher of the two numbers and the page says so: compute
  utilization varies more than bandwidth utilization, attention scales
  with prompt length at long context, and chunked prefill changes the
  picture. Shown as a smaller secondary metric next to the decode
  headline, framed as "long prompts punish prefill, long answers punish
  decode" (the `prefill-and-decode` module's lesson), with a link to
  that module.

### What the calculator does NOT model (stated plainly)

- **Batched server throughput.** Default is single-stream decode,
  batch 1, which is what a self-hoster feels. Batching amortizes weight
  reads across requests and changes the arithmetic; the page notes this
  and points to `production-serving`.
- **Speculative decoding, prefix caching, disaggregation.** Real
  systems beat the naive ceiling with these. Out of scope for the
  estimate; mentioned with links so the reader knows the ceiling is not
  the last word.

### Worked examples (sanity checks)

These match the module numbers and the empirical research, and double
as test fixtures for `src/lib/hardware.ts`.

1. **70B dense, FP16, RTX 5090 (32 GB, 1792 GB/s).** Weights =
   `70e9 * 2 = 140 GB`, far over 32 GB, so it does not fit. Capacity is
   the binding constraint. If it did fit, the ceiling would be
   `1792 / 140 = 12.8 tok/s`, matching the `memory-bandwidth` module's
   "about 12 tokens per second" for a 1.8 TB/s card on 70B FP16.

2. **70B dense, Q4 (~35 GB weights), RTX PRO 6000 Blackwell (96 GB,
   1792 GB/s).** Fits with wide headroom. `bytes_per_step` is about 35
   GB plus a small KV term, so the ceiling is `1792 / 35 = 51 tok/s`,
   realistic about 31-43 tok/s. On a 32 GB RTX 5090 the same Q4 weights
   (~35 GB) do not fit, which is the workstation lesson: the 5090 has
   the bandwidth but not the capacity for 70B.

3. **DeepSeek-V3 MoE (671B total, 37B active), FP8.** Fit uses total:
   `671 GB`, which clears 8x H200 (1128 GB) but not 8x H100 (640 GB).
   Decode uses active: `bytes_per_step` about 37 GB plus a small MLA KV
   term. The model feels far faster than 671B because only 37B moves
   per token. This is the MoE wrinkle from `gpu-memory-math` made
   concrete.

## Page structure and routes

Static and client-side interactive throughout, matching the BYOK /
no-backend posture of the whole site. The `/learn` SSR section is the
only server-rendered part; `/hardware` is not SSR.

- **`/hardware`** (index). Short intro framed on fit-versus-serve, then
  the explorer as the centerpiece (embedded, not a separate page),
  then a filterable and sortable spec table across all classes
  (filter by class, sort by capacity / bandwidth / release). The
  explorer's full state lives in URL query params so any configuration
  is shareable, the way `/models/compare?slugs=` works:
  `?model=<slug>&quant=<q>&ctx=<n>&kv=<fp16|fp8>&rt=<runtime>&hw=<slug>:<count>,<slug>:<count>`.

- **`/hardware/[slug]`** (per-SKU detail). Spec grid (each numeric cell
  gated on verification, exactly like `/models`), memory type and
  bandwidth, dense compute, a small "what it runs" table (a few
  reference open models at common quants with fit + ceiling),
  cross-links to the silicon project, the runtimes that target it, and
  the relevant course modules, then sources.

- **Explorer placement (decision D3b): embedded on the index** as the
  hero interaction, with query-param deep-linking. No separate
  `/hardware/explorer` route.

## The interactive explorer

A React island, `src/components/HardwareExplorer.tsx`, mounted
`client:load`, matching the existing island pattern (ChatBubble,
Settings, CoursePanel). It reads the generated JSON from `public/data/`
(`hardware.json`, `models.json`, `hardware-benchmarks.json`, and the
two verification maps) and computes everything client-side via pure
functions in `src/lib/hardware.ts`. Those functions are shared with the
Astro pages (so the detail-page "what it runs" tables render at build
time) and are unit-tested under `test/` (the repo already runs
`npm test` via `node --test`).

State: model (open-weights only, decision D2) + quant + context length
+ KV precision + runtime + a list of {hardware slug, unit count}.
Persisted to `localStorage` via a small zustand store (same `persist`
middleware the chat store uses) so the reader's last setup survives
navigation, and reflected into the URL for sharing.

Core output, per selected hardware setup:

1. **Fit / no-fit**, with the memory-breakdown visualization: a
   horizontal stacked bar of weights / KV cache / overhead against
   capacity, turning red and overflowing the capacity marker when it
   does not fit. Overhead uses the selected runtime's profile.
2. **Decode tokens/sec, hybrid view** (decision D6): the theoretical
   ceiling with `bytes_per_step` and the formula shown inline, the
   per-runtime realistic band shown as a range, and the verified
   empirical anchor overlaid on the same scale when one matches the
   (model, hardware, quant, runtime) selection. Estimate and reality
   side by side.
3. **Prefill / TTFT** (decision D5): the rough, clearly-labeled
   compute-bound secondary, shown smaller than the decode headline, to
   teach the "long prompts punish prefill" half of the story.
4. **Plain-language "why"**, templated from the computed terms. Example:
   "This 70B model at Q4 needs about 38 GB to load. Your RTX 5090 has
   32 GB, so it does not fit; a 48 GB card or two 5090s would. If it
   fit, decode would be bound by the 1792 GB/s memory bus at roughly 43
   tokens per second, because each token streams about 35 GB of active
   weights."

Additional educational interactions:

- **Compare boxes.** Two to four hardware setups side by side on the
  same model: fit, ceiling, realistic band, and empirical anchor.
  Mirrors `/models/compare`.
- **Biggest model this box runs.** Given a capacity and a tokens/sec
  floor the reader sets, solve for the largest model (by params) that
  both fits and clears the floor at a chosen quant.
- **Multi-unit scaling.** A 1 to 8 unit slider showing capacity
  unlocking larger models and bandwidth scaling speed, with the
  interconnect caveat.
- **Quant sweep.** The same model and box across FP16 / FP8 / Q4,
  showing the fit-and-speed tradeoff in one view.
- **Context slider.** Drag context length and watch the KV slice grow
  in the memory bar and drag the tokens/sec down. The clearest single
  demonstration of why long context is a memory bill.

## Sourcing and audit integration

The hardware section uses the same data -> ledger -> gate -> page
pipeline as `/models`. Nothing new is invented.

1. **Build.** `scripts/build-data.mjs` gains `hardware.yaml` and
   `hardware-benchmarks.yaml` in its `YAML_FILES` list, emitting
   `public/data/hardware.json` and `public/data/hardware-benchmarks.json`.

2. **Extract.** A new `audit/extract-hardware.mjs`, modeled exactly on
   `audit/extract-models.mjs`, mints one ledger row per checkable spec:
   `hardware.<slug>.memory_capacity_gb`, `.memory_bandwidth_gbs`,
   `.compute.fp16_dense_tflops`, `.compute.fp8_dense_tflops`,
   `.power_w`, `.release_date`, and so on. Benchmark rows from
   `hardware-benchmarks.yaml` get ids like
   `hwbench.<model>__<hardware>__<quant>__<runtime>.decode_tok_s`. All
   start at `needs_verification`; the existing
   `audit:verify:batch` pipeline takes them through entailment against
   the snapshot store. A new `npm run audit:extract:hardware` script.

3. **Verify gate.** `scripts/build-verification-map.mjs` is generalized
   to also emit `public/data/hardware-verification.json` (rows whose id
   starts `hardware.`) and fold benchmark verdicts in. The PASS set is
   the same: `supported`, `consistent`, `still_supported`,
   `pending_horizon`.

4. **Render gate.** Every numeric spec cell on `/hardware` and
   `/hardware/[slug]` renders a placeholder dash unless its ledger row
   is verified, exactly the `verified(slug, field)` helper from
   `/models` (which renders the em-dash glyph). Hardware
   specs and empirical tok/s numbers therefore get the same per-cell
   gate as model benchmarks. No unverified number ever shows as a
   number.

5. **Theoretical estimates are computed, not gated, but their inputs
   are gated.** The roofline number is arithmetic the browser does
   live, so it is not a ledger claim. What gates it is its inputs: if a
   chip's `memory_bandwidth_gbs` or a model's `params_active` is not
   verified, the explorer cannot compute and shows a placeholder dash
   plus "spec unverified" rather than a number. The formula and every input are
   always on screen, so the estimate is transparent and only as
   trustworthy as its verified inputs. Empirical anchors are separately
   ledger-gated as in (4). This is the clean way to honor L2: estimates
   are labeled and traceable, measurements are verified.

6. **Anti-bot sources.** For empirical numbers from aggregators that
   block the snapshotter (Artificial Analysis is the known case),
   reuse the `scripts/refresh-aa-data.mjs` pattern: write a synthetic
   snapshot alongside the value so the entailment verifier can confirm
   it without fetching the live site, then reset the affected ledger
   rows to `needs_verification`.

7. **Citation linter.** Any prose on the hardware pages (the intro, the
   "why" templates, detail-page notes) obeys `scripts/lint-citations.mjs`
   like every other page: specific numbers need a nearby source or a
   typed schema field. Spec values are typed schema fields documented
   by `url`, so they are out of scope for the linter the same way
   model specs are.

## Glossary additions

Reuse the `<G term="...">` component for technical terms so they get
hover-card definitions. Most relevant terms already exist (`hbm`,
`kv-cache`, `quantization`, `gguf`, `fp16`, `fp8`, `fp4`, `mha`, `mqa`,
`gqa`, `mla`, `decode`, `prefill`, `ttft`, `tpot`, `flash-attention`,
`paged-attention`, `mixture-of-experts`, `tensor-parallelism`,
`nvlink`). Add the missing ones, each a 3-4 paragraph entry with a
30-word summary and sources, per the glossary schema:

- `roofline` (the compute-versus-bandwidth bound model)
- `arithmetic-intensity` (FLOPs per byte; why decode is bandwidth-bound)
- `unified-memory` (shared CPU/GPU pool; Apple and x86 appliances)
- `memory-bandwidth` (GB/s; the decode-speed determinant)
- `model-bandwidth-utilization` (MBU; achieved / peak bandwidth, the decode derating)
- `model-flops-utilization` (MFU; achieved / peak compute, the prefill derating)
- `tokens-per-second` (decode throughput; the headline metric)
- Memory-type terms: either one `gddr7` and one `lpddr5x` entry, or
  fold both into the existing `hbm` entry's siblings. Recommend
  separate short entries for `gddr7` and `lpddr5x` and extend `hbm` to
  mention `hbm3e`/`hbm4`.

## Cross-linking map

- To **`/stack/silicon`** from the index intro and every detail page.
- To the **silicon projects**: `/projects/<slug>` for the five with
  explainers (`nvidia-h100`, `amd-mi300x`, `tenstorrent`, `risc-v`,
  `apple-silicon`); `/stack/silicon#projects` for the three thin ones
  (`cerebras-cs3`, `groq-lpu`, `nvidia-h100-cc`).
- To the **self-host modules**: `gpu-memory-math`, `memory-bandwidth`,
  `quantization-formats`, `hardware-strategy`, `inference-engines`,
  `benchmarking-operations`, `production-serving`; and the
  how-llms-work `kv-cache` and `prefill-and-decode` modules.
- To **`/models`**: every model detail page gains a "run this locally"
  affordance linking to `/hardware?model=<slug>` with the explorer
  pre-seeded; the explorer's model picker links back to
  `/models/<slug>`.
- To the **glossary** via `<G>` throughout.
- The **chat agent** gains `find_hardware` and `read_hardware` tools and
  a `(Hardware: <slug>)` citation marker, mirroring the model tools, so
  "can I run Qwen3 32B on a 4090" is answerable with grounded
  citations. (Build-phase item; noted for completeness.)

## Editorial and engineering constraints (binding)

- No em dashes. No banned buzzwords (`delve`, `tapestry`,
  `transformative`, `robust`, `leveraging`, `utilize`, `fascinating`,
  `landscape` as filler, `elevate`, `unlock`, `paradigm`, `ecosystem`
  when vague, `load-bearing`). Neutral, precise, Bloomberg-style voice.
- Every numeric or factual claim sourced per the citation discipline.
- Every theoretical estimate labeled as an estimate, with the formula
  and inputs visible.
- Stack: Astro 6, React 19 islands, Tailwind 4, zustand. Static plus
  client-side interactive; no backend.
- `npm run build` and `bash audit/check.sh` must both stay green
  (the prebuild runs schema validation, cross-ref resolution, and the
  citation linter). `npm test` for the `src/lib/hardware.ts` unit
  tests.

A new `audit/schemas/hardware.schema.json` is added and registered in
`audit/verify/verify_schemas.mjs` (alongside projects/funders/grants)
so the data file is schema-validated on every commit. `models.yaml`
skips this today, but a schema is cheap insurance for a file full of
numbers and matches the stronger pattern.

## Scope estimate

| Phase | Days |
|---|---|
| `data/hardware.yaml` schema + seed ~25 SKUs from the appendix, sourced | 2-3 |
| Per-runtime overhead profiles: research + source (parallel agents) | 1 |
| `data/hardware-benchmarks.yaml`: broad empirical-anchor harvest (parallel agents, maximize coverage, decision D1) | 3-5 |
| Extend `Model` with KV fields; populate for self-hostable open models | 1-2 |
| `src/lib/hardware.ts`: types + fit + decode roofline + prefill + MBU + unit tests | 3-4 |
| `audit/extract-hardware.mjs` + generalize build-verification-map + JSON schema | 1-2 |
| `/hardware` index: intro + filter/sort spec table | 1-2 |
| `/hardware/[slug]` detail pages | 1-2 |
| `HardwareExplorer.tsx` island: fit + hybrid decode view + prefill + memory bar + why | 3-4 |
| Explorer extras: compare, biggest-model, multi-unit, quant sweep, context slider | 2-3 |
| Glossary additions (7-9 entries) | 1 |
| Chat agent tools + citation marker | 1 |
| Cross-links from /models, /stack/silicon, modules | 0.5 |
| Verification pass: extract, snapshot, verify rows to green (large with the broad anchor set) | 2-4 |

**Estimated total: 22-34 days of focused work.** Calendar a few weeks
given data sourcing and verification, which is the long pole; the broad
empirical-anchor harvest (decision D1) is the biggest single driver and
the most parallelizable across agents.

## Risks

- **Spec drift and sourcing.** Hardware specs change with refreshes and
  vendors headline sparse numbers. Mitigated by the dense-only rule,
  the per-cell verification gate, and the quarterly audit re-verify
  that already exists for the rest of the site.
- **The KV-field population task.** Extending models with
  `kv_heads`/`head_dim` for the self-hostable set is real work and the
  fallback heuristic must be honest about being an estimate.
- **Estimate credibility.** A tokens/sec number that looks
  authoritative but is a naive ceiling can mislead. Mitigated by always
  showing the formula, labeling the ceiling and the band, and
  overlaying the verified empirical anchor where one exists.
- **Multi-unit accuracy.** Aggregate bandwidth across GPUs is genuinely
  fuzzy (interconnect, parallelism strategy). The page presents it as
  an optimistic ceiling with the interconnect caveat, not a precise
  figure.
- **Empirical-anchor harvest scale.** Decision D1 maximizes anchors,
  which means a large sourcing and verification effort and a long tail
  of anecdotal numbers. Mitigated by recording runtime/quant/context
  on every row, the per-cell verification gate (anecdotal numbers that
  cannot be verified never render), and prioritizing the reliable
  sources (Artificial Analysis, MLPerf, vLLM, the large llama.cpp
  threads) over forum one-offs.

## Decisions resolved at review (May 2026)

The six open questions were resolved with Austin on 2026-05-25. They
are locked.

- **D1. Empirical anchors: maximize.** Go broad, not focused. Harvest as
  many measured tokens/sec points as possible across the (model x
  hardware x quant x runtime) space, dispatching parallel agents to
  source and verify aggressively. Every anchor still flows through the
  verification gate; reliable sources are prioritized over forum
  one-offs. This is the biggest sourcing driver in the scope estimate
  and the input that the per-runtime MBU bands (D6) calibrate from.

- **D2. Model picker: open-weights only.** Only open and open-weights
  checkpoints, the ones a reader can actually self-host. The fit and
  roofline math stays honest because configs are disclosed, and it
  scopes the KV-field population to that set. No proprietary models in
  the picker.

- **D3. Drop cloud and pricing entirely.** No cloud tier, no `$/hr`, no
  `price_usd`, no tokens-per-dollar or cost-per-million-tokens views.
  The section is about hardware architecture and the fit/speed
  relationship, not cost or where a model is hosted. This revises the
  earlier L1 scope.

- **D3b. Explorer: embedded on `/hardware` with deep-linking.** State in
  URL query params for sharing. No separate `/hardware/explorer` route.

- **D4. Per-runtime overhead profiles.** The fit check models framework
  overhead per runtime (llama.cpp, vLLM, MLX, SGLang, ExLlamaV2), with
  the reader selecting a runtime. Constants sourced where possible,
  labeled estimates otherwise, visible and editable in the explorer.

- **D5. Prefill: the middle ground.** Decode is the precise headline;
  prefill/TTFT is a rough, clearly-labeled compute-bound secondary
  (from dense FLOPS) whose job is to teach the prefill-versus-decode
  split. Flagged as the softer of the two numbers.

- **D6. MBU: hybrid view.** Ceiling (physical limit, labeled) plus a
  per-runtime realistic band shown as a range plus the verified
  empirical anchor overlaid on the same scale. Bands are calibrated
  from accumulated anchors over time so the estimate becomes
  data-derived rather than a rule of thumb.

No open questions remain blocking the build. Two judgment calls are
flagged for Austin to veto if he disagrees, otherwise they proceed as
written: (a) a new `data/hardware.yaml` rather than expanding
`projects.yaml`; (b) adding a `hardware.schema.json` to the
schema-validation set even though `models.yaml` skips it.

## Seed data (deep research, May 2026)

Primary-sourced specs gathered for the build. Dense compute only;
sparse figures excluded. Estimates and uncertainties flagged. These
populate `data/hardware.yaml`; each value still goes through the
verification gate before it renders.

### Datacenter (per accelerator)

| SKU | Mem GB | Type | BW GB/s | FP16 dense TFLOPS | FP8 dense TFLOPS | TDP W | Form | Release | Primary source |
|---|---|---|---|---|---|---|---|---|---|
| H100 SXM5 | 80 | HBM3 | 3350 | 989 | 1979 | 700 | SXM5 | 2022-09 | nvidia.com H100 datasheet |
| H100 PCIe | 80 | HBM2e | 2000 | 756 | 1513 | 350 | PCIe | 2022-09 | nvidia.com H100 datasheet |
| H200 SXM | 141 | HBM3e | 4800 | 989.5 | 1979 | 700 | SXM | 2024 (announced 2023-11) | nvidia.com / PNY H200 datasheet |
| B200 (HGX) | 180 | HBM3e | 7700 | 2250 | 4500 | 1000 | SXM (HGX) | 2024-25 | NVIDIA Blackwell datasheet |
| GB200 (superchip) | 2x186 HBM3e + 480 LPDDR5X | HBM3e + LPDDR5X | 2x8000 | 2x2500 | 2x5000 | ~2700 (approx) | superchip (2x B200 + Grace) | 2024-25 | NVIDIA Blackwell datasheet |
| AMD MI300X | 192 | HBM3 | 5300 | 1307 | 2615 | 750 | OAM | 2023-12 | amd.com MI300X datasheet |
| AMD MI325X | 256 | HBM3e | 6000 | 1307 | 2615 | 1000 | OAM | 2024-10 | amd.com MI325X datasheet |
| AMD MI355X | 288 | HBM3e | 8000 | 2517 | 5033 | 1400 | OAM | 2025-06 | amd.com MI355X datasheet |

Sources: NVIDIA H100 datasheet
(https://resources.nvidia.com/en-us-gpu-resources/h100-datasheet-24306),
H200 (https://www.nvidia.com/en-us/data-center/h200/), NVIDIA Blackwell
datasheet (per-GPU table), AMD MI300X
(https://www.amd.com/content/dam/amd/en/documents/instinct-tech-docs/data-sheets/amd-instinct-mi300x-data-sheet.pdf),
MI325X and MI355X datasheets on amd.com.

Datacenter flags:
- All NVIDIA tensor figures on the datasheets are published **with
  sparsity**; the dense numbers above are the sparse figure halved
  (H100/H200 footnote, Blackwell footnote). AMD prints dense and sparse
  side by side, so no halving needed.
- B200 memory is **180 GB** (HGX, air-cooled) to **186 GB** (GB200 GPU,
  liquid-cooled) per the datasheet; 192 GB is the marketing/physical
  figure. Store 180 with a note.
- GB200 is a **superchip**: 2x B200 plus a Grace CPU, with 480 GB
  LPDDR5X on the CPU side. Represent as composition, not a single GPU.
  Module total TDP ~2700 W is widely reported but not on the datasheet;
  flag as approximate.
- MI355X (CDNA4) is **shipping** (GA 2025-06), 288 GB / 1400 W, not
  announced-only.
- Unit prices are out of scope (D3) and not stored. (For reference
  only: neither NVIDIA nor AMD publishes primary list/street prices;
  secondary trackers float ~$25-40K H100.)
- H100 NVL (94 GB/card, 2-GPU bridge SKU) is a distinct part from H100
  PCIe 80 GB; do not conflate.

### Workstation / consumer / open accelerators

| SKU | Mem GB | Type | BW GB/s | FP16 dense TFLOPS | FP8 dense TFLOPS | TDP W | MSRP USD | Release | Primary source |
|---|---|---|---|---|---|---|---|---|---|
| RTX 5090 | 32 | GDDR7 | 1792 | 209.5 | 419 (est) | 575 | 1999 | 2025-01 | TechPowerUp / nvidia.com |
| RTX 4090 | 24 | GDDR6X | 1008 | 165.2 (tensor) | n/a (no native FP8) | 450 | 1599 | 2022-10 | TechPowerUp |
| RTX PRO 6000 Blackwell (WS) | 96 | GDDR7 | 1792 | ~250 (est) | ~1000 (est) | 600 | 8565 | 2025-03 | nvidia.com datasheet |
| Radeon AI PRO R9700 | 32 | GDDR6 | 640 | 191 | 383 | 300 | ~1300 (street) | 2025-07 | amd.com spec page |
| Tenstorrent Blackhole p150a | 32 | GDDR6 | 512 | ~166 BF16 (est) | 664 (BLOCKFP8) | 300 | 1399 | 2025 (H2) | docs.tenstorrent.com |

Sources: RTX 5090
(https://www.techpowerup.com/gpu-specs/geforce-rtx-5090.c4216), RTX
4090 (https://www.techpowerup.com/gpu-specs/geforce-rtx-4090.c3889),
RTX PRO 6000
(https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/),
R9700
(https://www.amd.com/en/products/graphics/workstations/radeon-ai-pro/ai-9000-series/amd-radeon-ai-pro-r9700.html),
Blackhole (https://docs.tenstorrent.com/aibs/blackhole/specifications.html).

Workstation flags:
- RTX 5090 bandwidth 1792 GB/s confirmed. FP8 ~419 dense is derived
  (NVIDIA publishes only the sparse AI-TOPS headline); flag as
  estimate.
- RTX 4090 has no native FP8 tensor path; its "330 TFLOPS FP16" figure
  is sparse, dense tensor is 165.2.
- RTX PRO 6000 publishes only "4000 AI TOPS = effective FP4 with
  sparsity"; dense FP4 is ~2000, and FP16/FP8 are not broken out, so
  those are scaled estimates. Workstation and Server editions are both
  600 W at 1792 GB/s; Max-Q is 300 W with identical memory, so for the
  bandwidth-bound roofline all three editions are equivalent and only
  sustained clocks differ.
- Tenstorrent quotes a single **BLOCKFP8 664 TFLOPS** (block-scaled
  FP8, not E4M3/E5M2); BF16 ~166 is derived. Whole stack is open
  source.
- R9700 MSRP is not formally listed by AMD; ~$1300 street.

### Apple unified memory

| SKU | Max mem GB | BW GB/s | Start USD | Release | Primary source |
|---|---|---|---|---|---|
| Mac Studio M3 Ultra | 512 | 819 | 3999 | 2025-03 | apple.com newsroom |
| Mac Studio M4 Max | 128 | 546 | 1999 | 2025-03 | apple.com newsroom |
| MacBook Pro M4 Max | 128 | 410 or 546 (binned) | 3199 | 2024-10 | apple.com newsroom |
| MacBook Pro M5 Max | 128 | 614 | n/a (unsourced) | 2026-03 | apple.com newsroom |
| Mac mini M4 Pro | 64 | 273 | 1399 | 2024-10 | apple.com newsroom |
| MacBook Air M5 | 32 | 153 | 1099 | 2026-03 | apple.com newsroom |

All memory_type unified LPDDR5X. Apple does not market a separate INT8
NPU TOPS number (cites the Neural Engine generationally, ~38 TOPS on
M4-class). M4 Max bandwidth is binned: 410 GB/s on the 32-core-GPU die,
546 GB/s on the 40-core-GPU die. M3 Ultra confirmed 512 GB / 819 GB/s
(newsroom says "over 800GB/s"). M5 Max 614 GB/s is new this generation;
M5 base 153, M5 Pro 307. Sources: per-product apple.com/newsroom pages
(2024-10, 2025-03, 2026-03).

### x86 unified-memory appliances and AI-PC

| SKU | Max mem GB | Type | BW GB/s | NPU TOPS | Power W | Release | Primary source |
|---|---|---|---|---|---|---|---|
| NVIDIA DGX Spark (GB10) | 128 (96 addressable as VRAM) | unified LPDDR5X | 273 | n/a (1 PFLOP FP4 sparse) | 140 (chip) | 2025-10 | nvidia.com/dgx-spark |
| AMD Ryzen AI Max+ 395 (Strix Halo) | 128 (96 to VRAM) | unified LPDDR5X-8000 | ~256 | 50 | 45-120 | 2025-01 | amd.com product page |
| Snapdragon X Elite | 64 (platform) | LPDDR5X-8448 | 135 | 45 | 23-80 | 2024-06 | qualcomm.com brief |
| Snapdragon X2 Elite | 48 (ref) | LPDDR5X | 152 (Elite) / 228 (Extreme) | 80 | configurable | 2025-09 | qualcomm.com brief |
| Intel Lunar Lake (Core Ultra 200V) | 32 (on-package) | LPDDR5X-8533 | ~136 | 48 | 17-37 | 2024-09 | intel.com |

Sources: DGX Spark
(https://www.nvidia.com/en-us/products/workstations/dgx-spark/),
Ryzen AI Max+ 395
(https://www.amd.com/en/products/processors/laptop/ryzen/ai-300-series/amd-ryzen-ai-max-plus-395.html),
Snapdragon X Elite and X2 Elite product briefs on qualcomm.com, Intel
Core Ultra 200V on intel.com. Snapdragon X2 Elite has two bandwidth
tiers (152 standard, 228 on the Extreme's 192-bit bus); the Extreme is
the meaningful inference upgrade.

### Cloud rental and pricing (dropped from scope, decision D3)

Cloud rental and all dollar figures are out of scope per D3. The cloud
hourly-rate research that was gathered (neocloud H100 around $2-4/GPU/hr,
hyperscaler around $7; H200, B200, MI300X ranges) and the MSRP figures
in the tables above are retained here as reference only. They are not
modeled, not in the `hardware.yaml` schema, and not shown on the pages.
The price columns in the workstation and Apple tables above are
reference-only for the same reason.

### Methodology references

The decode roofline `tok/s ~= bandwidth / bytes_per_step` is the
standard memory-bound model. Primary references:

- kipp.ly, "Transformer Inference Arithmetic"
  (https://kipp.ly/transformer-inference-arithmetic/): the ops-per-byte
  derivation and the memory-versus-FLOPs boundary.
- zeux.io, "LLM inference speed of light"
  (https://zeux.io/2024/03/15/llm-inference-sol/): frames the bandwidth
  ceiling as the speed of light for decode.
- Databricks, "LLM Inference Performance Engineering"
  (https://www.databricks.com/blog/llm-inference-performance-engineering-best-practices):
  defines Model Bandwidth Utilization (MBU), the achieved-over-peak
  derating.
- Baseten inference stack
  (https://www.baseten.co/resources/guide/the-baseten-inference-stack/):
  prefill compute-bound (TTFT) versus decode memory-bound (TPOT).
- Ahmad Osman 2026 threads (already cited across the self-host
  modules): the parts list and the per-tier bandwidth numbers.

The 60-85% MBU band is a rule of thumb synthesized from the above plus
measured ratios (for example the M2 Ultra ~53% data point), not a
single published constant. Label it as such on the page.

### Empirical-source map

| Source | Measures | Reliability |
|---|---|---|
| Artificial Analysis (artificialanalysis.ai) | hosted-API output tok/s, P50 over 72h, single-stream | reliable, standardized |
| MLPerf Inference (mlcommons.org) | vendor-submitted datacenter batched + offline tok/s | most rigorous, audited |
| vLLM blog / docs | server throughput (req/s, tok/s, TTFT, TPOT) | reliable, reproducible CLI |
| llama.cpp Discussion #4167 | single-stream decode on Apple Silicon by quant | crowd-sourced, large-N, trend-reliable |
| XiongjieDai GPU-Benchmarks-on-LLM-Inference | Mac vs multi-NVIDIA single-stream tables | useful, anecdotal |
| r/LocalLLaMA | consumer-rig decode tok/s | anecdotal, directional only |

Runtime matters: MLX and llama.cpp can differ ~2.5x on identical Apple
hardware, and single-stream versus batched differ by an order of
magnitude. Every `hardware-benchmarks.yaml` row records runtime, quant,
context, and batch so anchors are comparable.

## Co-evolution

When hardware refreshes (a new GPU generation, a Mac tier bump), add or
update `hardware.yaml` rows and re-run the extract plus verify pass.
When a new empirical benchmark surfaces, add it to
`hardware-benchmarks.yaml` and let it recalibrate the per-runtime MBU
bands (D6). When the model catalog gains a self-hostable checkpoint,
add its KV fields so the explorer can include it. When the taxonomy or
editorial rules change, update this doc and the `CLAUDE.md` Hardware
section together, the same discipline the rest of the repo follows.
