import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

/**
 * Models catalog. One row per *checkpoint* (Llama 3.1 8B is distinct
 * from Llama 3.1 70B is distinct from Llama 3.3 70B). Both open and
 * closed models live here so the timeline and comparison views can
 * place them next to each other; the `openness` field carries the
 * distinction. Authoritative schema lives in CLAUDE.md "Models hub"
 * section.
 *
 * Every numeric field with provenance (params, tokens, dates,
 * benchmarks) is checkable. The audit ledger reads from this file
 * to mint factual-lane rows.
 */

export type Openness = "open" | "open-weights" | "source-available" | "proprietary";

export type ModelType = "base" | "instruct" | "chat" | "reasoning" | "code" | "vision-language";

export type Architecture = "dense" | "moe" | "hybrid" | "ssm" | "unknown";

export type AttentionVariant =
  | "mha"
  | "mqa"
  | "gqa"
  | "mla"
  | "sliding-window"
  | "hybrid-gqa-sliding"
  | "linear"
  | "unknown";

export type PositionEncoding = "rope" | "rope-yarn" | "rope-llama3" | "alibi" | "nope" | "absolute" | "unknown";

export interface BenchmarkScore {
  /** Numeric score on the benchmark's native scale (percentage points for
   *  pass-rate benchmarks, Elo for LMArena, etc.). Never inferred. */
  score: number;
  /** Date the score was measured / published in YYYY-MM-DD form. */
  as_of: string;
  /** Primary source URL where the score was disclosed (model card,
   *  leaderboard snapshot, paper). */
  source: string;
  /** Optional: the variant of the benchmark used (e.g. "0-shot",
   *  "CoT", "maj@64"). Free-form. */
  variant?: string;
}

/**
 * The standardized benchmark slugs. Missing entries render as "not
 * reported"; we never interpolate.
 */
export type BenchmarkSlug =
  // General reasoning
  | "mmlu"
  | "mmlu_pro"
  | "gpqa_diamond"
  // Code
  | "humaneval"
  | "swe_bench_verified"
  | "livecodebench"
  // Math
  | "math"
  | "aime_2024"
  | "aime_2025"
  | "frontiermath"
  // Held-out / arena
  | "lmarena_elo"
  | "livebench"
  | "ifeval";

export const BENCHMARK_GROUPS: Record<string, BenchmarkSlug[]> = {
  general: ["mmlu", "mmlu_pro", "gpqa_diamond"],
  code: ["humaneval", "swe_bench_verified", "livecodebench"],
  math: ["math", "aime_2024", "aime_2025", "frontiermath"],
  arena: ["lmarena_elo", "livebench", "ifeval"],
};

export const BENCHMARK_LABEL: Record<BenchmarkSlug, string> = {
  mmlu: "MMLU",
  mmlu_pro: "MMLU-Pro",
  gpqa_diamond: "GPQA-Diamond",
  humaneval: "HumanEval",
  swe_bench_verified: "SWE-Bench Verified",
  livecodebench: "LiveCodeBench",
  math: "MATH",
  aime_2024: "AIME 2024",
  aime_2025: "AIME 2025",
  frontiermath: "FrontierMath",
  lmarena_elo: "LMArena Elo",
  livebench: "LiveBench",
  ifeval: "IFEval",
};

export interface ReceptionQuote {
  quote: string;
  author: string;
  /** Affiliation / venue if known, free-form. */
  affiliation?: string;
  url: string;
  /** Date the quote was published, YYYY-MM-DD. */
  date: string;
}

export interface ModelSource {
  title: string;
  url: string;
}

/**
 * Cost panel. Numbers are USD per million tokens at the source's
 * canonical reference vendor / provider. `as_of` carries the
 * snapshot date so readers know when the number was captured;
 * `source` is the canonical Artificial Analysis (or lab API) page
 * we read it from. We never infer or interpolate: if the lab does
 * not publish a number and Artificial Analysis does not list one,
 * the field stays undefined and the UI renders "not available".
 */
export interface ModelCost {
  input_per_mtok_usd?: number;
  output_per_mtok_usd?: number;
  /** Free-form: "Together AI", "Anthropic API", "DeepSeek API", or
   *  "Artificial Analysis median across providers". */
  vendor?: string;
  as_of: string;
  /** Artificial Analysis canonical URL or lab pricing page. */
  source: string;
  /** When the source is Artificial Analysis specifically (vs. a lab
   *  pricing page), the UI surfaces a clear "via Artificial Analysis"
   *  attribution. Set true to opt into that styling. */
  via_artificial_analysis?: boolean;
}

/**
 * Speed panel. tokens_per_sec_output is the decode throughput;
 * ttft_ms is the time-to-first-token at the reference vendor.
 * Same `as_of` + `source` discipline as ModelCost.
 */
export interface ModelSpeed {
  tokens_per_sec_output?: number;
  ttft_ms?: number;
  vendor?: string;
  as_of: string;
  source: string;
  via_artificial_analysis?: boolean;
}

/** Lineage relationships within and across families. */
export interface ModelLineage {
  /** Slug of the model this checkpoint was derived from
   *  (continued pretrain, fine-tune target, distillation teacher). */
  parent?: string;
  /** Slugs of models derived from this checkpoint. */
  children?: string[];
  /** Free-form note on the relationship (e.g. "Distilled R1 reasoning
   *  traces into the dense Llama base"). */
  note?: string;
}

/** Single sourced limitation observation. */
export interface ModelLimitation {
  text: string;
  /** URL backing the observation (paper section, model card caveat,
   *  evaluation thread, GitHub issue). */
  source: string;
}

export interface Model {
  /** Stable canonical identifier. Lowercase, hyphenated, includes
   *  size or version where ambiguous (e.g. "llama-3-1-70b-instruct"). */
  slug: string;
  /** Display name as the developer brands it (e.g. "Llama 3.1 70B
   *  Instruct", "DeepSeek-R1"). */
  display_name: string;
  /** Family slug. Multiple checkpoints share a family
   *  (e.g. llama, qwen, deepseek). Used to group siblings on the
   *  detail page. */
  family: string;
  /** Developer org name. */
  developer: string;
  /** ISO 3166 alpha-2 country code of the primary developer org. */
  developer_country: string;
  type: ModelType;

  // ---- Timeline ----
  /** Date the checkpoint was first announced / launched, YYYY-MM-DD. */
  released_date: string;
  /** Date the weights were made downloadable; same as released_date
   *  for closed models that never release weights (use the
   *  announcement date and flag via openness). Required. */
  weights_released_date?: string;
  /** Optional date the accompanying paper / tech report dropped. */
  paper_date?: string;
  /** Optional date the model was sunset / superseded. */
  deprecated_date?: string;

  // ---- Openness ----
  openness: Openness;
  /** SPDX-style license string or human-readable name
   *  (e.g. "MIT", "Apache-2.0", "Llama Community License"). */
  license: string;
  /** Whether the license is OSI-approved (not whether the model
   *  meets OSAID; that's a separate audit). */
  osi_approved: boolean;
  data_released: boolean;
  training_code_released: boolean;
  training_logs_released: boolean;

  // ---- Architecture ----
  architecture: Architecture;
  /** Total parameter count including inactive experts for MoE. */
  params_total: number;
  /** Active parameter count per forward pass. For dense models this
   *  equals params_total. */
  params_active: number;
  /** Number of routed experts for MoE; null/undefined for dense. */
  experts?: number;
  /** Number of experts activated per token for MoE. */
  experts_active?: number;
  /** Maximum native context window in tokens (before YaRN /
   *  extrapolation). */
  context_window: number;
  attention_variant: AttentionVariant;
  position_encoding: PositionEncoding;
  /** Tokenizer family slug (e.g. "tiktoken-o200k", "llama3",
   *  "deepseek", "qwen"). */
  tokenizer?: string;
  /** Layer count if disclosed. */
  layers_count?: number;
  /** Vocab size if disclosed. */
  vocab_size?: number;

  // ---- Training ----
  /** Pretraining tokens count if disclosed; null for closed. */
  pretraining_tokens?: number;
  /** Short freeform description of training data (e.g.
   *  "FineWeb-Edu + RedPajama-v2 sample + code"). Optional. */
  training_data_summary?: string;
  /** Post-training stages applied. */
  post_training: Array<"sft" | "dpo" | "rlhf" | "rlaif" | "constitutional" | "grpo" | "ppo" | "kto" | "orpo" | "rejection-sampling" | "rlvr" | "online-rl" | "knowledge-distillation">;
  /** Training hardware family if disclosed (e.g. "H100", "H800",
   *  "TPU v5p"). */
  training_hardware?: string;
  /** Training FLOPs if disclosed. */
  training_compute_flops?: number;

  // ---- Quality (benchmarks) ----
  /** Per-benchmark scores with as_of dates. Missing benchmarks
   *  render as "not reported"; do not infer values. */
  benchmarks?: Partial<Record<BenchmarkSlug, BenchmarkScore>>;

  // ---- Practical ----
  /** Quantization formats with first-party or community weights. */
  quantizations_available?: string[];
  /** Project slugs of runtimes known to support this checkpoint. */
  runtimes_supporting?: string[];

  // ---- Context ----
  /** 1-3 sentences on why this checkpoint mattered at release.
   *  Subject to framing-lane audit. Should be sourced. */
  release_context?: string;
  /** Short labels for headline innovations
   *  (e.g. ["MLA attention", "GRPO post-training"]). */
  notable_innovations?: string[];
  /** Curated reception quotes; 0-4 entries. Each is a factual claim
   *  about who said what, ledger-tracked. */
  reception?: ReceptionQuote[];

  /** Cost per million tokens at a reference vendor. Sourced. */
  cost?: ModelCost;
  /** Decode throughput + TTFT at a reference vendor. Sourced. */
  speed?: ModelSpeed;
  /** Lineage parent / children within the catalog. */
  lineage?: ModelLineage;
  /** Short labels for the kinds of work this checkpoint is a strong
   *  fit for (e.g. "general chat", "code agent", "math reasoning").
   *  Subject to framing-lane audit. */
  recommended_use_cases?: string[];
  /** Sourced limitation observations. Each entry must carry a URL
   *  backing the claim; otherwise the linter rejects it. */
  known_limitations?: ModelLimitation[];
  /** Optional 200-400 word "Why people cared at release" prose.
   *  Renders below the architecture diagram on the detail page. Every
   *  factual claim inside must be traceable to `sources` (or to a
   *  benchmark/timeline field that has its own source). */
  long_form?: string;

  /** Provenance for every numeric field that isn't a typed schema
   *  value. Linter expects this to be non-empty for any entry whose
   *  release_context or notable_innovations make specific claims. */
  sources: ModelSource[];
}

let _cache: Model[] | null = null;

function toISODate(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v;
  return undefined;
}

function normalizeModel(m: any): Model {
  // js-yaml 1.1 auto-parses YYYY-MM-DD strings into Date objects; we
  // store them as ISO date strings end-to-end so JSON-serialized output
  // is stable and the audit ledger can string-compare cleanly.
  const benchmarks = m.benchmarks
    ? Object.fromEntries(
        Object.entries(m.benchmarks).map(([k, v]: [string, any]) => [
          k,
          v ? { ...v, as_of: toISODate(v.as_of) ?? v.as_of } : v,
        ]),
      )
    : undefined;
  const reception = m.reception
    ? m.reception.map((r: any) => ({ ...r, date: toISODate(r.date) ?? r.date }))
    : undefined;
  return {
    ...m,
    released_date: toISODate(m.released_date) ?? m.released_date ?? "",
    weights_released_date: toISODate(m.weights_released_date),
    paper_date: toISODate(m.paper_date),
    deprecated_date: toISODate(m.deprecated_date),
    benchmarks,
    reception,
  } as Model;
}

export function loadModels(): Model[] {
  if (_cache) return _cache;
  const path = resolve(process.cwd(), "data/models.yaml");
  if (!existsSync(path)) {
    _cache = [];
    return _cache;
  }
  const text = readFileSync(path, "utf-8");
  const parsed = yaml.load(text) as { models?: any[] };
  _cache = (parsed?.models ?? []).map(normalizeModel);
  return _cache;
}

export function loadModelBySlug(slug: string): Model | null {
  return loadModels().find((m) => m.slug === slug) ?? null;
}

export function loadModelsByFamily(family: string): Model[] {
  return loadModels().filter((m) => m.family === family);
}

export const OPENNESS_LABEL: Record<Openness, string> = {
  open: "Open",
  "open-weights": "Open weights",
  "source-available": "Source-available",
  proprietary: "Proprietary",
};

export function opennessColor(o: Openness): string {
  switch (o) {
    case "open":
      return "var(--color-openness-open, #117a60)";
    case "open-weights":
      return "var(--color-openness-open-weights, #4a6fa5)";
    case "source-available":
      return "var(--color-openness-source-available, #ba5b4b)";
    case "proprietary":
      return "var(--color-openness-proprietary, #a7a4a0)";
  }
}

export function formatParams(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(n % 1e12 === 0 ? 0 : 1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return `${n}`;
}

export function formatTokens(n: number | undefined): string {
  if (!n && n !== 0) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(0)}B`;
  return `${n}`;
}

export function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}
