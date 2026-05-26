/**
 * Hardware calculator: pure functions and types, no Node APIs, so this
 * module is safe to import from the React island (browser) as well as
 * from Astro pages (build time) and the unit tests.
 *
 * The data loaders that read data/hardware.yaml live in
 * src/lib/hardware-data.ts (Node only); do not import that from the
 * island.
 *
 * The model behind this: decode is memory-bandwidth-bound, so the
 * theoretical tokens/sec ceiling is bandwidth divided by the bytes
 * streamed per token. See docs/HARDWARE.md for the full derivation and
 * the sourced references (kipp.ly, zeux.io, Databricks MBU).
 */
import type { Model } from "./models";

export type HardwareClass =
  | "datacenter"
  | "workstation"
  | "apple-unified"
  | "x86-unified"
  | "ai-pc";

export type MemoryType =
  | "hbm3"
  | "hbm3e"
  | "hbm2e"
  | "hbm4"
  | "gddr7"
  | "gddr6x"
  | "gddr6"
  | "lpddr5x"
  | "unified-lpddr5x";

export type FormFactor = "sxm" | "oam" | "pcie" | "soc" | "superchip";

export type Interconnect = "nvlink" | "nvswitch" | "pcie" | "infinity-fabric" | "none";

export interface HardwareCompute {
  /** Dense (never sparse) peak TFLOPS / TOPS at each precision. */
  fp16_dense_tflops?: number;
  fp8_dense_tflops?: number;
  fp4_dense_tflops?: number;
  int8_dense_tops?: number;
}

export interface HardwareSource {
  title: string;
  url: string;
}

export interface Hardware {
  slug: string;
  name: string;
  vendor: string;
  class: HardwareClass;
  /** Per single unit. */
  memory_capacity_gb: number;
  memory_type: MemoryType;
  /** Per single unit, GB/s. The decode-speed determinant. */
  memory_bandwidth_gbs: number;
  compute?: HardwareCompute;
  form_factor: FormFactor;
  power_w: number;
  interconnect: Interconnect;
  /** Typical deployment unit count the explorer pre-fills. */
  multi_unit_default: number;
  /** Marketed NPU INT8 TOPS, for AI-PC / unified parts that quote one. */
  npu_int8_tops?: number;
  release_date: string;
  url: string;
  /** Cross-link to the editorial silicon entry in data/projects.yaml. */
  silicon_project?: string;
  notes?: string;
  sources: HardwareSource[];
}

export interface HardwareBenchmark {
  model_slug: string;
  hardware_slug: string;
  num_units: number;
  quant: string;
  context_length?: number;
  runtime: Runtime;
  batch: number;
  decode_tok_s: number;
  ttft_ms?: number;
  as_of: string;
  source: string;
  via?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Quantization: bytes per weight parameter.
//
// FP/INT formats follow bits/8. GGUF k-quants store inline block scales,
// so they land slightly above the naive bits/8 (numbers per billion params
// from the gpu-memory-math course module). These are first-pass planning
// numbers, not contracts: the real on-disk size depends on the scheme,
// block size, and whether scales are stored inline.
// ---------------------------------------------------------------------------

export interface QuantFormat {
  id: string;
  label: string;
  bytes_per_param: number;
  note?: string;
}

export const QUANT_FORMATS: QuantFormat[] = [
  { id: "fp16", label: "FP16 / BF16", bytes_per_param: 2.0, note: "Native training precision." },
  { id: "fp8", label: "FP8", bytes_per_param: 1.0, note: "Native on H100+ and Blackwell." },
  { id: "int8", label: "INT8", bytes_per_param: 1.0 },
  { id: "q8_0", label: "GGUF Q8_0", bytes_per_param: 1.06, note: "~8.5 bits/param including scales." },
  { id: "q6_k", label: "GGUF Q6_K", bytes_per_param: 0.82 },
  { id: "q5_k_m", label: "GGUF Q5_K_M", bytes_per_param: 0.69 },
  { id: "q4_k_m", label: "GGUF Q4_K_M", bytes_per_param: 0.56, note: "The common 4-bit local default." },
  { id: "q4_0", label: "GGUF Q4_0", bytes_per_param: 0.56 },
  { id: "awq-4", label: "AWQ 4-bit", bytes_per_param: 0.5 },
  { id: "gptq-4", label: "GPTQ 4-bit", bytes_per_param: 0.5 },
  { id: "mlx-4bit", label: "MLX 4-bit", bytes_per_param: 0.56, note: "Apple MLX 4-bit layout." },
  { id: "mlx-8bit", label: "MLX 8-bit", bytes_per_param: 1.0 },
  { id: "q3_k_m", label: "GGUF Q3_K_M", bytes_per_param: 0.43 },
  { id: "q2_k", label: "GGUF Q2_K", bytes_per_param: 0.33, note: "Aggressive; quality drops." },
];

const QUANT_BY_ID: Record<string, QuantFormat> = Object.fromEntries(
  QUANT_FORMATS.map((q) => [q.id, q]),
);

export function bytesPerParam(quantId: string): number {
  return QUANT_BY_ID[quantId]?.bytes_per_param ?? 2.0;
}

export function quantLabel(quantId: string): string {
  return QUANT_BY_ID[quantId]?.label ?? quantId;
}

// ---------------------------------------------------------------------------
// Runtimes: overhead profiles and the per-runtime realistic MBU band.
//
// Two structural fit models (sourced, see docs/HARDWARE.md):
//   - additive (llama.cpp, MLX, ExLlama): required = weights + fixed +
//     weight_fraction * weights + KV(context). KV grows with real use.
//   - capacity-capped (vLLM, SGLang): they grab `utilization` of total
//     VRAM up front and partition it; "fits" means weights + activations
//     <= utilization * capacity, and the remainder is the KV budget.
//
// MBU (model bandwidth utilization) is the realistic fraction of the
// theoretical bandwidth ceiling actually reached. The band is a labeled
// rule of thumb per runtime, calibrated from empirical anchors over time.
// ---------------------------------------------------------------------------

export type Runtime = "llama.cpp" | "vllm" | "sglang" | "mlx" | "exllamav2";

export interface RuntimeProfile {
  id: Runtime;
  label: string;
  kind: "additive" | "capacity-capped";
  /** Additive: fixed GB of framework/context overhead. */
  fixed_gb: number;
  /** Additive: extra fraction of weight bytes for compute scratch. */
  weight_fraction: number;
  /** Capacity-capped: usable fraction of total memory (e.g. vLLM 0.9). */
  utilization: number;
  /** Single-stream memory-subsystem efficiency band [low, high]: the
   *  fraction of peak bandwidth actually reached while streaming weights.
   *  Calibrated to measured anchors (see decodeRoofline). */
  eff: [number, number];
  /** Fixed per-token overhead band in milliseconds [low, high]: kernel
   *  launch, sampling, and attention compute that does not scale with the
   *  weight bytes. This is why small/fast configs show a lower *effective*
   *  bandwidth utilization than large/slow ones. */
  overhead_ms: [number, number];
  note: string;
}

export const RUNTIME_PROFILES: Record<Runtime, RuntimeProfile> = {
  // vLLM default gpu_memory_utilization is 0.9 (docs.vllm.ai engine args).
  vllm: {
    id: "vllm",
    label: "vLLM",
    kind: "capacity-capped",
    fixed_gb: 1.5,
    weight_fraction: 0,
    utilization: 0.9,
    eff: [0.78, 0.92],
    overhead_ms: [1.0, 2.0],
    note: "Pre-allocates a paged KV pool from 90% of VRAM; throughput-optimized CUDA stack.",
  },
  sglang: {
    id: "sglang",
    label: "SGLang",
    kind: "capacity-capped",
    fixed_gb: 1.5,
    weight_fraction: 0,
    utilization: 0.9,
    eff: [0.78, 0.92],
    overhead_ms: [1.0, 2.0],
    note: "Static KV pool at mem-fraction-static 0.9; RadixAttention prefix sharing.",
  },
  exllamav2: {
    id: "exllamav2",
    label: "ExLlamaV2",
    kind: "additive",
    fixed_gb: 0.5,
    weight_fraction: 0.02,
    utilization: 1.0,
    eff: [0.80, 0.93],
    overhead_ms: [1.5, 2.5],
    note: "Single-stream CUDA decode; KV allocated near real context.",
  },
  "llama.cpp": {
    id: "llama.cpp",
    label: "llama.cpp",
    kind: "additive",
    fixed_gb: 0.75,
    weight_fraction: 0.03,
    utilization: 1.0,
    eff: [0.80, 0.96],
    overhead_ms: [1.5, 3.0],
    note: "Portable GGUF runtime; near-peak weight streaming on unified-memory boxes.",
  },
  mlx: {
    id: "mlx",
    label: "MLX",
    kind: "additive",
    fixed_gb: 0.5,
    weight_fraction: 0.03,
    // Apple unified memory must leave headroom for the OS; usable is well
    // below the nominal capacity.
    utilization: 0.75,
    eff: [0.55, 0.80],
    overhead_ms: [2.0, 3.5],
    note: "Apple unified-memory runtime; leave ~25% of memory for macOS.",
  },
};

// Multi-unit decode bandwidth efficiency by interconnect (labeled estimate).
const INTERCONNECT_EFFICIENCY: Record<Interconnect, number> = {
  nvswitch: 0.92,
  nvlink: 0.9,
  "infinity-fabric": 0.85,
  pcie: 0.6,
  none: 1.0,
};

// ---------------------------------------------------------------------------
// KV cache
// ---------------------------------------------------------------------------

export interface KvResult {
  bytes_per_token: number;
  estimated: boolean;
}

/**
 * KV-cache bytes per token at the given KV precision (2 for FP16, 1 for
 * FP8/INT8). Exact when the model carries an explicit override or the
 * layers/kv_heads/head_dim triple; otherwise a labeled estimate from the
 * attention variant. Formula: 2 * layers * kv_heads * head_dim * bytes
 * (the 2 covers keys and values).
 */
export function kvBytesPerToken(model: Model, kvPrecisionBytes: number): KvResult {
  // Explicit override (used for MLA models whose compressed latent KV does
  // not follow the heads * head_dim form).
  if (typeof model.kv_bytes_per_token_fp16 === "number") {
    return {
      bytes_per_token: model.kv_bytes_per_token_fp16 * (kvPrecisionBytes / 2),
      estimated: false,
    };
  }

  const layers = model.layers_count;
  if (layers && model.kv_heads && model.head_dim) {
    return {
      bytes_per_token: 2 * layers * model.kv_heads * model.head_dim * kvPrecisionBytes,
      estimated: false,
    };
  }

  // Fallback estimate. Assume head_dim 128; pick kv_heads from the
  // attention variant; estimate layers if absent.
  const headDim = model.head_dim ?? 128;
  const estLayers = layers ?? estimateLayers(model.params_total);
  let kvHeads = model.kv_heads;
  if (!kvHeads) {
    switch (model.attention_variant) {
      case "mha":
        kvHeads = model.hidden_size ? Math.round(model.hidden_size / headDim) : 32;
        break;
      case "mqa":
        kvHeads = 1;
        break;
      case "mla":
        kvHeads = 4; // rough effective; prefer an explicit override for MLA
        break;
      case "gqa":
      case "hybrid-gqa-sliding":
      case "sliding-window":
      default:
        kvHeads = 8;
    }
  }
  return {
    bytes_per_token: 2 * estLayers * kvHeads * headDim * kvPrecisionBytes,
    estimated: true,
  };
}

/** Very rough layer-count estimate from total params, for the fallback only. */
function estimateLayers(paramsTotal: number): number {
  const b = paramsTotal / 1e9;
  if (b <= 4) return 28;
  if (b <= 10) return 32;
  if (b <= 20) return 40;
  if (b <= 40) return 48;
  if (b <= 80) return 64;
  return 80;
}

// ---------------------------------------------------------------------------
// Fit check
// ---------------------------------------------------------------------------

export interface FitInput {
  quant: string;
  contextLength: number;
  kvPrecisionBytes: number; // 2 = FP16 KV, 1 = FP8/INT8 KV
  numUnits: number;
  runtime: Runtime;
  concurrency: number;
}

export interface FitResult {
  fits: boolean;
  weightsBytes: number;
  kvBytes: number;
  overheadBytes: number;
  requiredBytes: number;
  capacityBytes: number;
  /** Usable capacity after a capacity-capped runtime's utilization cut. */
  usableBytes: number;
  kvEstimated: boolean;
}

// Decimal GB (1e9) throughout: vendor capacity specs and param-byte
// products are both decimal, so "70B at FP16 = 140 GB" lines up with the
// gpu-memory-math module.
const GB = 1e9;

export function fitCheck(model: Model, hw: Hardware, input: FitInput): FitResult {
  const profile = RUNTIME_PROFILES[input.runtime];
  const bpp = bytesPerParam(input.quant);
  const weightsBytes = model.params_total * bpp;

  const kv = kvBytesPerToken(model, input.kvPrecisionBytes);
  const kvBytes = kv.bytes_per_token * input.contextLength * Math.max(1, input.concurrency);

  const capacityBytes = input.numUnits * hw.memory_capacity_gb * GB;

  let overheadBytes: number;
  let usableBytes: number;
  if (profile.kind === "capacity-capped") {
    // Usable = utilization * capacity. Overhead is the fixed activation
    // floor; the KV pool fills whatever remains.
    usableBytes = profile.utilization * capacityBytes;
    overheadBytes = profile.fixed_gb * GB;
  } else {
    // Additive. Apple unified memory also needs OS headroom, modeled via
    // the MLX profile's utilization.
    usableBytes = profile.utilization * capacityBytes;
    overheadBytes = profile.fixed_gb * GB + profile.weight_fraction * weightsBytes;
  }

  const requiredBytes = weightsBytes + kvBytes + overheadBytes;
  return {
    fits: requiredBytes <= usableBytes,
    weightsBytes,
    kvBytes,
    overheadBytes,
    requiredBytes,
    capacityBytes,
    usableBytes,
    kvEstimated: kv.estimated,
  };
}

// ---------------------------------------------------------------------------
// Decode tokens/sec (the roofline)
// ---------------------------------------------------------------------------

export interface DecodeInput {
  quant: string;
  contextLength: number;
  kvPrecisionBytes: number;
  numUnits: number;
  runtime: Runtime;
}

export interface DecodeResult {
  /** Theoretical ceiling: min of the memory-bandwidth bound (100% eff, no
   *  overhead) and the compute bound. */
  ceilingTokS: number;
  /** Realistic single-stream band: memory time at an efficiency band plus
   *  a fixed per-token overhead band. */
  lowTokS: number;
  highTokS: number;
  activeWeightsBytes: number;
  kvBytesPerStep: number;
  bytesPerStep: number;
  effectiveBandwidthBytesPerS: number;
  kvEstimated: boolean;
  /** Compute-bound ceiling when the chip has sourced dense FLOPS; the cap
   *  that stops tiny-active / low-quant configs printing absurd speeds. */
  computeBoundTokS?: number;
}

/** Dense FLOPS available for decode matmuls at the quant's precision tier
 *  (FP8 if the weights are <=1 byte and the chip supports it, else FP16),
 *  scaled by unit count. Undefined when the chip has no sourced compute. */
function decodeDenseFlops(hw: Hardware, bytesPerParam: number, numUnits: number): number | undefined {
  const c = hw.compute;
  if (!c) return undefined;
  let tflops: number | undefined;
  if (bytesPerParam <= 1 && c.fp8_dense_tflops) tflops = c.fp8_dense_tflops;
  else tflops = c.fp16_dense_tflops ?? c.fp8_dense_tflops;
  if (!tflops) return undefined;
  return tflops * 1e12 * numUnits;
}

export function effectiveBandwidthBytesPerS(hw: Hardware, numUnits: number): number {
  const perUnit = hw.memory_bandwidth_gbs * 1e9; // GB/s -> bytes/s (decimal GB, vendor convention)
  if (numUnits <= 1) return perUnit;
  const eff = INTERCONNECT_EFFICIENCY[hw.interconnect] ?? 0.6;
  return perUnit * numUnits * eff;
}

export function decodeRoofline(model: Model, hw: Hardware, input: DecodeInput): DecodeResult {
  const bpp = bytesPerParam(input.quant);
  // MoE: active params drive the per-token cost, not total.
  const activeWeightsBytes = model.params_active * bpp;
  const kv = kvBytesPerToken(model, input.kvPrecisionBytes);
  const kvBytesPerStep = kv.bytes_per_token * input.contextLength;
  const bytesPerStep = activeWeightsBytes + kvBytesPerStep;

  const bw = effectiveBandwidthBytesPerS(hw, input.numUnits);
  const profile = RUNTIME_PROFILES[input.runtime];

  // Memory-bandwidth ceiling: 100% efficiency, no fixed overhead.
  let ceilingTokS = bw / bytesPerStep;

  // Compute-bound cap. Decode is normally memory-bound, but a small-active
  // model at low quant on a high-FLOPS chip can hit the compute wall first;
  // cap the fast end so the tool never prints physically absurd speeds.
  // t_compute = 2 * active_params / (dense_flops * mfu); mfu ~ 0.5 for the
  // matrix-vector products of single-stream decode.
  let computeBoundTokS: number | undefined;
  const denseFlops = decodeDenseFlops(hw, bpp, input.numUnits);
  if (denseFlops && model.params_active > 0) {
    computeBoundTokS = (denseFlops * 0.5) / (2 * model.params_active);
    ceilingTokS = Math.min(ceilingTokS, computeBoundTokS);
  }

  // Realistic single-stream band: t = bytes/(bw * eff) + fixed_overhead.
  // The fixed overhead is why fast/small configs reach a lower *effective*
  // utilization than slow/large ones (see the calibration note above).
  const realistic = (effv: number, ohMs: number): number => {
    const t = bytesPerStep / (bw * effv) + ohMs / 1000;
    const v = 1 / t;
    return computeBoundTokS !== undefined ? Math.min(v, computeBoundTokS) : v;
  };
  const highTokS = realistic(profile.eff[1], profile.overhead_ms[0]);
  const lowTokS = realistic(profile.eff[0], profile.overhead_ms[1]);

  return {
    ceilingTokS,
    lowTokS,
    highTokS,
    activeWeightsBytes,
    kvBytesPerStep,
    bytesPerStep,
    effectiveBandwidthBytesPerS: bw,
    kvEstimated: kv.estimated,
    computeBoundTokS,
  };
}

// ---------------------------------------------------------------------------
// Prefill / time-to-first-token (rough, educational secondary)
//
// Prefill is compute-bound: ttft ~= (2 * active_params * prompt_tokens) /
// (dense_flops * MFU). Deliberately rough; returns null when the chip has
// no sourced dense compute figure at the chosen precision.
// ---------------------------------------------------------------------------

export interface PrefillResult {
  ttftMs: number;
  prefillFlops: number;
  denseFlops: number;
  mfu: number;
}

export function prefillTTFT(
  model: Model,
  hw: Hardware,
  opts: { quant: string; promptTokens: number; numUnits: number; mfu?: number },
): PrefillResult | null {
  const compute = hw.compute;
  if (!compute) return null;
  // Match the precision tier to the quant: <=1 byte/param uses FP8 if the
  // chip has it, otherwise FP16. 4-bit decode still does matmuls in a
  // higher precision, so FP16/FP8 dense is the right denominator.
  const bpp = bytesPerParam(opts.quant);
  let denseTflops: number | undefined;
  if (bpp <= 1 && compute.fp8_dense_tflops) denseTflops = compute.fp8_dense_tflops;
  else denseTflops = compute.fp16_dense_tflops ?? compute.fp8_dense_tflops;
  if (!denseTflops) return null;

  const mfu = opts.mfu ?? 0.4;
  const denseFlops = denseTflops * 1e12 * opts.numUnits;
  const prefillFlops = 2 * model.params_active * opts.promptTokens;
  const ttftS = prefillFlops / (denseFlops * mfu);
  return { ttftMs: ttftS * 1000, prefillFlops, denseFlops, mfu };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatGB(bytes: number): string {
  const gb = bytes / GB;
  if (gb >= 100) return `${Math.round(gb)} GB`;
  if (gb >= 10) return `${gb.toFixed(0)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(0)} MB`;
}

export function formatTokS(t: number): string {
  if (t >= 100) return `${Math.round(t)}`;
  if (t >= 10) return `${t.toFixed(0)}`;
  return `${t.toFixed(1)}`;
}

export function formatBandwidth(gbs: number): string {
  if (gbs >= 1000) return `${(gbs / 1000).toFixed(2)} TB/s`;
  return `${gbs} GB/s`;
}

export const HARDWARE_CLASS_LABEL: Record<HardwareClass, string> = {
  datacenter: "Datacenter",
  workstation: "Workstation",
  "apple-unified": "Apple unified",
  "x86-unified": "x86 unified",
  "ai-pc": "AI PC",
};

export const MEMORY_TYPE_LABEL: Record<MemoryType, string> = {
  hbm3: "HBM3",
  hbm3e: "HBM3e",
  hbm2e: "HBM2e",
  hbm4: "HBM4",
  gddr7: "GDDR7",
  gddr6x: "GDDR6X",
  gddr6: "GDDR6",
  lpddr5x: "LPDDR5X",
  "unified-lpddr5x": "Unified LPDDR5X",
};
