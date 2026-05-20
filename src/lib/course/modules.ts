/**
 * The 15-module curriculum for the /learn course.
 *
 * Locked May 2026 per docs/COURSE.md. Each module corresponds to one
 * or more existing stack-layer slugs; the course walks from
 * infrastructure (foundation) up to protocols (surface) with
 * meta-layers slotted where they first become applicable, and
 * sovereignty-decentralization as the final synthesis capstone.
 */

export type ModuleType = "core" | "meta" | "capstone";
export type ModulePhase =
  | "read"
  | "probe"
  | "compare"
  | "why_open"
  | "synthesize";
export type ProgressPhase = ModulePhase | "complete";

export type CourseTrack = "stack-walk" | "self-host";

export interface CourseModule {
  order: number;
  slug: string;
  title: string;
  type: ModuleType;
  /** Track. Stack-walk modules pull their Read content from layer MDX
   *  files and their probe_primer from the layer's frontmatter.
   *  Self-host modules pull their Read content from the
   *  self_host_modules content collection and carry probe_primer
   *  inline below. Defaults to "stack-walk" when omitted. */
  track?: CourseTrack;
  /** The layer slug(s) this module covers. Empty for self-host
   *  modules since they don't map 1:1 to layers. */
  layer_slugs: string[];
  /** Short editorial framing used on /learn and the module page header. */
  one_liner: string;
  /** Anchor projects / standards the Compare phase asks the user to contrast. */
  compare_axis_label: string;
  compare_anchors: string[];
  /** Optional probe primer claims for self-host modules. Stack-walk
   *  modules leave this empty and pull from the layer frontmatter. */
  probe_primer?: string[];
}

export const MODULES: readonly CourseModule[] = [
  {
    order: 1,
    slug: "infrastructure",
    title: "Infrastructure",
    type: "core",
    layer_slugs: ["infrastructure"],
    one_liner:
      "Data centers, power, cooling, and the grid that runs the rest of the stack.",
    compare_axis_label:
      "Compare hyperscaler vs sovereign vs decentralized vs neocloud infrastructure",
    compare_anchors: ["coreweave", "g42", "akash", "crusoe"],
  },
  {
    order: 2,
    slug: "silicon",
    title: "Silicon",
    type: "core",
    layer_slugs: ["silicon"],
    one_liner: "Chips and ISAs that execute the math.",
    compare_axis_label: "Compare NVIDIA vs AMD vs Tenstorrent vs Apple Silicon",
    compare_anchors: ["nvidia-h100", "amd-mi300x", "tenstorrent", "apple-silicon"],
  },
  {
    order: 3,
    slug: "compute",
    title: "Compute",
    type: "core",
    layer_slugs: ["compute"],
    one_liner: "Where silicon physically runs and gets accessed (scheduling, networking, batching).",
    compare_axis_label: "Compare control-plane approaches: NVLink fabric vs RoCE; spot vs reserved",
    compare_anchors: [],
  },
  {
    order: 4,
    slug: "data",
    title: "Data",
    type: "core",
    layer_slugs: ["data"],
    one_liner: "Training corpora, open and closed.",
    compare_axis_label: "Compare The Pile vs RedPajama vs FineWeb vs Dolma (license, scale, filtering)",
    compare_anchors: ["the-pile", "redpajama", "fineweb", "dolma"],
  },
  {
    order: 5,
    slug: "training",
    title: "Training",
    type: "core",
    layer_slugs: ["training"],
    one_liner: "Tools to pretrain and fine-tune.",
    compare_axis_label: "Compare Megatron vs DeepSpeed vs Axolotl vs Unsloth (parallelism, UX)",
    compare_anchors: ["megatron-lm", "deepspeed", "axolotl", "unsloth"],
  },
  {
    order: 6,
    slug: "weights",
    title: "Weights",
    type: "core",
    layer_slugs: ["weights"],
    one_liner: "Model artifacts and their license tiers.",
    compare_axis_label:
      "Compare Llama vs Qwen vs DeepSeek vs Gemma vs OLMo on license posture",
    compare_anchors: ["llama", "qwen", "deepseek", "gemma", "olmo"],
  },
  {
    order: 7,
    slug: "evaluation",
    title: "Evaluation",
    type: "meta",
    layer_slugs: ["evaluation"],
    one_liner: "Benchmarks, harnesses, leaderboards.",
    compare_axis_label:
      "Compare MMLU vs HumanEval vs SWE-Bench vs ARC-AGI vs HLE",
    compare_anchors: ["mmlu", "humaneval", "swe-bench", "frontiermath", "hle"],
  },
  {
    order: 8,
    slug: "governance",
    title: "Governance",
    type: "meta",
    layer_slugs: ["governance"],
    one_liner: "Licensing, definitions, foundations, OSAID.",
    compare_axis_label:
      "Compare Apache 2.0 vs Llama Community License vs Gemma Terms vs OSAID",
    compare_anchors: ["apache-2", "llama-license", "gemma-terms", "osaid"],
  },
  {
    order: 9,
    slug: "runtime",
    title: "Runtime",
    type: "core",
    layer_slugs: ["runtime"],
    one_liner: "Inference engines that serve tokens from weights.",
    compare_axis_label:
      "Compare vLLM vs SGLang vs llama.cpp vs TensorRT-LLM (openness, perf, deploy)",
    compare_anchors: ["vllm", "sglang", "llama-cpp", "tensorrt-llm"],
  },
  {
    order: 10,
    slug: "identity-trust",
    title: "Identity and Trust",
    type: "meta",
    layer_slugs: ["identity-trust"],
    one_liner: "TEEs, confidential computing, verifiable inference.",
    compare_axis_label:
      "Compare Intel TDX vs AMD SEV-SNP vs NVIDIA Confidential Compute vs ZKML",
    compare_anchors: ["apple-pcc", "nvidia-h100-cc", "ezkl", "lagrange"],
  },
  {
    order: 11,
    slug: "retrieval-memory",
    title: "Retrieval and Memory",
    type: "core",
    layer_slugs: ["retrieval-memory"],
    one_liner: "Vector databases, embeddings, agent memory, RAG.",
    compare_axis_label:
      "Compare lexical vs dense vs ColBERT vs hybrid; pgvector vs Qdrant vs LanceDB",
    compare_anchors: ["lancedb", "qdrant", "pgvector", "chroma"],
  },
  {
    order: 12,
    slug: "agents",
    title: "Agents",
    type: "core",
    layer_slugs: ["agents"],
    one_liner: "Frameworks and agent products.",
    compare_axis_label:
      "Compare LangChain vs LlamaIndex vs Goose vs AutoGen (control flow, tool use)",
    compare_anchors: ["langchain", "llama-index", "goose", "autogen"],
  },
  {
    order: 13,
    slug: "safety-guardrails",
    title: "Safety and Guardrails",
    type: "meta",
    layer_slugs: ["safety-guardrails"],
    one_liner: "Llama Guard, NeMo Guardrails, sandbox-escape evals.",
    compare_axis_label:
      "Compare Llama Guard vs NeMo Guardrails vs Constitutional AI",
    compare_anchors: ["llama-guard", "nemo-guardrails", "constitutional-ai"],
  },
  {
    order: 14,
    slug: "protocols",
    title: "Protocols",
    type: "core",
    layer_slugs: ["protocols"],
    one_liner: "MCP, A2A, agentic payments, the integration wire.",
    compare_axis_label:
      "Compare MCP vs A2A; x402 vs L402 (payments)",
    compare_anchors: ["mcp", "a2a", "x402", "l402"],
  },
  {
    order: 15,
    slug: "sovereignty-decentralization",
    title: "Sovereignty and Decentralization (Capstone)",
    type: "capstone",
    layer_slugs: ["sovereignty-decentralization"],
    one_liner:
      "Assemble your own theory of why open AI matters; synthesize the threads from prior modules.",
    compare_axis_label:
      "Compare hyperscaler-rented vs sovereign-state vs decentralized vs local-first postures",
    compare_anchors: ["g42", "akash", "petals", "apple-pcc"],
  },
] as const;

/**
 * Self-host track: practical companion to the stack walk. 7 modules
 * derived from the Ahmad Osman "Self-hosted LLMs / Local AI" series.
 * Each carries its probe_primer inline (since the Read content lives
 * in the self_host_modules collection, not the layers collection).
 */
export const SELF_HOST_MODULES: readonly CourseModule[] = [
  {
    order: 1,
    slug: "gpu-memory-math",
    title: "GPU memory math",
    type: "core",
    track: "self-host",
    layer_slugs: [],
    one_liner: "VRAM ≈ parameters × (bits ÷ 8). The one formula that explains every model-fits-or-doesn't question.",
    compare_axis_label: "Compare FP16, FP8, 4-bit (GGUF / GPTQ / AWQ / NF4) memory footprints across model sizes",
    compare_anchors: ["llama-3-1-70b-instruct", "llama-3-1-405b-instruct", "deepseek-v3"],
    probe_primer: [
      "VRAM ≈ parameters × (bits ÷ 8) is the first-pass formula. FP16 = roughly 2x model size in GB; FP8 = 1x; 4-bit = 0.5x.",
      "The VRAM tax is real: KV cache, activations, framework overhead, and CUDA Graphs can add 10-30 percent to the weight footprint, more for long context and high concurrency.",
      "MoE models break the single-dimension fit-or-don't math. Total parameters decide memory fit; active parameters decide decode speed. An 8x7B MoE is 56B for fit and roughly 13B for speed.",
      "GGUF's per-quant memory numbers (Q6_K roughly 0.82 GB per 1B, Q4_K roughly 0.56, Q2_K roughly 0.33) are runtime-specific to llama.cpp. The same weights in other engines may have very different memory footprints.",
      "A 70B model is roughly 140 GB at FP16, 70 GB at FP8, or 35-40 GB at 4-bit. Stop asking 'can I run this?' and start asking 'how do I want to run this?'",
    ],
  },
  {
    order: 2,
    slug: "memory-bandwidth",
    title: "Memory bandwidth",
    type: "core",
    track: "self-host",
    layer_slugs: [],
    one_liner: "Capacity decides what fits. Bandwidth decides how fast it runs. They are not the same.",
    compare_axis_label: "Compare RTX 5090 (1792 GB/s), Mac Studio M3 Ultra (819 GB/s), DGX Spark (273 GB/s), Strix Halo (256 GB/s)",
    compare_anchors: [],
    probe_primer: [
      "Capacity tells you what fits. Bandwidth tells you how hard the box can breathe. The software stack tells you how much of the spec sheet you actually see.",
      "The 2026 bandwidth tiers run from 1792 GB/s (RTX 5090, RTX PRO 6000 Blackwell) down to 135 GB/s (thin-and-light AI PCs). Apple's Mac Studio M3 Ultra sits at 819 GB/s.",
      "A 32 GB RTX 5090 and a 96 GB RTX PRO 6000 Blackwell have the same bandwidth but live in different worlds once model size exceeds 32 GB. Capacity and bandwidth are independent dimensions.",
      "Even when a model fits in memory, decode speed still depends on bandwidth, KV cache growth, dequantization cost, batching, and scheduler quality. Fitting is not serving.",
      "Apple unified memory is a capacity superpower with bandwidth tradeoffs, not HBM. The Mac Studio Ultra wins when you want one box with 512 GB of memory and silence. NVIDIA HBM wins when you need raw decode throughput.",
    ],
  },
  {
    order: 3,
    slug: "quantization-formats",
    title: "Quantization formats",
    type: "core",
    track: "self-host",
    layer_slugs: [],
    one_liner: "GGUF, GPTQ, AWQ, NF4, EXL2, EXL3, FP8, FP4, MLX, ONNX. None are interchangeable.",
    compare_axis_label: "Compare GPTQ vs AWQ vs NF4 vs EXL2 vs GGUF on engine compatibility and quality",
    compare_anchors: [],
    probe_primer: [
      "GGUF, GPTQ, AWQ, NF4, EXL2, EXL3, FP8, FP4, MLX formats, and ONNX are not interchangeable. The right format is the one your engine has optimized kernels for.",
      "GPTQ and AWQ are both 4-bit GPU-oriented post-training quantizations; vLLM, SGLang, and TensorRT-LLM optimize for both. NF4 (from QLoRA) is the bitsandbytes default for fine-tuning workflows.",
      "EXL2 and EXL3 are ExLlama's native formats, optimized for consumer NVIDIA GPUs. They are not portable to vLLM or SGLang without re-quantization.",
      "FP8 (on H100 and later) and FP4 (on B200 and later) are hardware-native formats. Using them requires both the right silicon and engine kernels that target them.",
      "'It fits in 6 GB' claims are runtime-specific. The same weights at the same bit count can have very different memory footprints in different engines because of how each handles dequantized scratch buffers and KV cache representation.",
    ],
  },
  {
    order: 4,
    slug: "inference-engines",
    title: "Inference engines",
    type: "core",
    track: "self-host",
    layer_slugs: [],
    one_liner: "The traffic cop, memory manager, scheduler, and API surface that turns hardware into served tokens.",
    compare_axis_label: "Compare llama.cpp vs MLX vs ExLlamaV2 vs vLLM vs SGLang vs TensorRT-LLM by intended workload",
    compare_anchors: ["llama-cpp", "vllm", "sglang", "tensorrt-llm"],
    probe_primer: [
      "An inference engine is not the model. It is the traffic cop, memory manager, kernel dispatcher, scheduler, KV cache accountant, and API surface that turns hardware into served tokens.",
      "Prefill (compute-bound) and decode (memory-bandwidth-bound) have different cost shapes. Most production optimizations target one or the other.",
      "There are four engine families: portable local (llama.cpp, MLC LLM, ONNX-RT, OpenVINO), Apple unified-memory (MLX, MLX-LM), consumer CUDA quant (ExLlamaV2 / V3), and production serving (vLLM, SGLang, TensorRT-LLM, TGI, LMDeploy).",
      "vLLM is the default open-source production server. SGLang adds disaggregated prefill / decode plus structured-output routing. TensorRT-LLM is the NVIDIA-max-performance option. llama.cpp is the portability king.",
      "Above engines sit orchestration layers like NVIDIA Dynamo, which handle fleet-level concerns: disaggregation, KV-aware routing, multi-tier KV caching, autoscaling.",
    ],
  },
  {
    order: 5,
    slug: "hardware-strategy",
    title: "Hardware strategy",
    type: "core",
    track: "self-host",
    layer_slugs: [],
    one_liner: "Pick a hardware strategy and workload shape first; the engine follows.",
    compare_axis_label: "Compare single-RTX, 8xH100, Apple Studio Ultra, Strix Halo, DGX Spark, Tenstorrent",
    compare_anchors: [],
    probe_primer: [
      "Discrete GPUs win when the model fits in their HBM. Apple unified memory wins when the model doesn't fit on a normal GPU but does fit in 192-512 GB of unified memory.",
      "DGX Spark is a coherent-memory CUDA developer appliance (273 GB/s, 128 GB unified). Not a bandwidth monster, but a clean developer experience with NVFP4 support.",
      "Strix Halo / Ryzen AI Max is the first real x86 unified-memory contender (256 GB/s, up to 128 GB memory with ~96 GB exposed as GPU memory).",
      "Tenstorrent ships a fully-open stack on RISC-V. Wormhole n300 (576 GB/s, 24 GB) and Blackhole p150 (512 GB/s, 32 GB) are real options for teams willing to invest in a non-CUDA software path.",
      "The 'AI PC' trap: most AI PCs are bandwidth-starved at 135-228 GB/s. Fine for small models and edge workloads, not for serious local inference of 9B+ dense models.",
    ],
  },
  {
    order: 6,
    slug: "production-serving",
    title: "Production serving",
    type: "core",
    track: "self-host",
    layer_slugs: [],
    one_liner: "Prefill, decode, batching, scheduling, parallelism. The system around the model.",
    compare_axis_label: "Compare vLLM, SGLang, TensorRT-LLM on PagedAttention, disaggregation, routing, and parallelism",
    compare_anchors: ["vllm", "sglang", "tensorrt-llm"],
    probe_primer: [
      "PagedAttention partitions the KV cache into blocks. Continuous batching adds and removes requests on every decode step. Both target the same fragmentation-plus-throughput axis.",
      "Tensor parallelism needs all-reduce after every layer and is bandwidth-hungry. Without NVLink, pipeline parallelism often outperforms it on the same hardware.",
      "Expert parallelism (for MoE) needs all-to-all traffic on every routing step. Disaggregated serving separates prefill workers from decode workers entirely, transferring KV cache between them.",
      "TTFT, TPOT, and p95 / p99 percentiles matter more than average tokens-per-second. A model with 30 ms average TPOT and a 400 ms p99 feels inconsistent and frustrating in practice.",
      "KV-aware routing in orchestration layers like NVIDIA Dynamo lets fleets keep cache hot for shared-prefix workloads and route around hot decode workers.",
    ],
  },
  {
    order: 7,
    slug: "benchmarking-operations",
    title: "Benchmarking and operations",
    type: "capstone",
    track: "self-host",
    layer_slugs: [],
    one_liner: "Bad benchmark: 180 tok/s. Good benchmark: TTFT, TPOT, p95, cost per million tokens, at your workload shape.",
    compare_axis_label: "Compare engines on TTFT, TPOT, p95, KV cache hit rate, cost per million tokens",
    compare_anchors: [],
    probe_primer: [
      "A bad benchmark says 180 tok/s. A good benchmark separates prefill from decode, tracks p95 and p99, and uses your actual prompt distribution and concurrency.",
      "Single-user TPS is a misleading metric for production serving. Concurrent batching changes everything; a 2x throughput claim at batch=1 can vanish at batch=64.",
      "KV cache memory headroom and KV cache hit rate are first-class metrics for any serving workload with repeated prefixes or long contexts.",
      "Cost per million tokens is the only metric that lets you compare across engines, hardware, and parallelism strategies on the same axis. Track it explicitly.",
      "The ten questions to answer before picking an engine: hardware, model size, decode-vs-prefill bottleneck, context length, concurrency, prompt sharing, architecture (dense or MoE), local vs production vs orchestration, quant format, interconnect.",
    ],
  },
] as const;

export const MODULE_BY_SLUG: Record<string, CourseModule> = Object.fromEntries(
  [...MODULES, ...SELF_HOST_MODULES].map((m) => [m.slug, m]),
);

/** Returns the in-track list for a module's track. */
function modulesForTrack(track: CourseTrack): readonly CourseModule[] {
  return track === "self-host" ? SELF_HOST_MODULES : MODULES;
}

export function nextModule(slug: string): CourseModule | null {
  const m = MODULE_BY_SLUG[slug];
  if (!m) return null;
  const list = modulesForTrack(m.track ?? "stack-walk");
  const idx = list.findIndex((x) => x.slug === slug);
  if (idx < 0 || idx === list.length - 1) return null;
  return list[idx + 1];
}

export function prevModule(slug: string): CourseModule | null {
  const m = MODULE_BY_SLUG[slug];
  if (!m) return null;
  const list = modulesForTrack(m.track ?? "stack-walk");
  const idx = list.findIndex((x) => x.slug === slug);
  if (idx <= 0) return null;
  return list[idx - 1];
}

export const PHASE_ORDER: readonly ProgressPhase[] = [
  "read",
  "probe",
  "compare",
  "why_open",
  "synthesize",
  "complete",
];

export function nextPhase(phase: ModulePhase): ProgressPhase {
  const idx = PHASE_ORDER.indexOf(phase);
  return PHASE_ORDER[idx + 1] ?? "complete";
}

export function phaseLabel(phase: ProgressPhase): string {
  return {
    read: "Read",
    probe: "Probe",
    compare: "Compare",
    why_open: "Why open",
    synthesize: "Synthesize",
    complete: "Complete",
  }[phase];
}
