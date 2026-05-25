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

export type CourseTrack = "stack-walk" | "self-host" | "how-llms-work";

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

/**
 * How-LLMs-work track: the model-side foundation for the self-host
 * track. 14 modules adapted from Ahmad Osman's "LLMs 101: A Practical
 * Guide (2026)" (https://x.com/TheAhmadOsman/status/2057590224729911346).
 * Like self-host, each carries its probe_primer inline (the Read content
 * lives in the how_llms_work_modules content collection, not the layers
 * collection) and maps to no single layer. The final module hands off to
 * the self-host track for the hardware and serving half.
 */
export const HOW_LLMS_WORK_MODULES: readonly CourseModule[] = [
  {
    order: 1,
    slug: "inference-loop",
    title: "The inference loop",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "Tokens in, probabilities out, one next token at a time. Every other decision follows from this loop.",
    compare_axis_label: "Compare the cost of a long prompt (prefill) against the cost of a long answer (decode) for the same model",
    compare_anchors: [],
    probe_primer: [
      "Inference is one loop repeated: text becomes tokens, the model scores every possible next token, a decoding policy picks one, it is appended to the sequence, and the loop runs again until a stop token, the user stops it, or a token limit is reached.",
      "The model produces one token at a time, not a whole answer at once. Each new token becomes part of the sequence that conditions the next token.",
      "Logits are the raw per-token scores; softmax turns them into a probability distribution; decoding selects one token from that distribution. The only inputs are the weights and the running sequence.",
      "Generation speed is measured in tokens per second because the system runs a forward pass, picks a token, updates the KV cache, and repeats. The wait for the first token is dominated by processing the prompt.",
      "A long pasted document is felt as a pause before the first word (prompt processing), while a long answer is felt as slow streaming (token-by-token generation).",
    ],
  },
  {
    order: 2,
    slug: "tokens",
    title: "Tokens and tokenizers",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "Models read integer token IDs, not words. Token counts, not word counts, set context limits and memory.",
    compare_axis_label: "Compare how two tokenizer families split the same text, and what that does to the context budget and cost",
    compare_anchors: [],
    probe_primer: [
      "A model does not see words; it sees tokens, small chunks of text mapped to integer IDs. A token can be a whole word, a word fragment, punctuation, a whitespace-prefixed string, a byte-level fallback, or a special control marker.",
      "Different model families use different tokenizers (BPE-style, SentencePiece-style). The same document can be 5,000 tokens in one tokenizer and 7,500 in another, so tokens-per-second is not directly comparable across families.",
      "Vocabulary size is a tradeoff: a larger vocabulary can compress text into fewer tokens but changes the embedding and output-projection size.",
      "Tokens are the unit of work that determines how much text fits the context window, how large the KV cache grows, and how much latency the prompt costs.",
      "A context window is the maximum number of tokens the model can attend to at once. Supported length is not the same as fast, cheap, or accurate at that length; test the lengths you actually use.",
    ],
  },
  {
    order: 3,
    slug: "transformers",
    title: "The Transformer",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "Most chat models are decoder-only Transformers: embeddings, attention, feed-forward blocks, stacked and projected to logits.",
    compare_axis_label: "Compare where a Transformer's parameters live (attention vs feed-forward) and what each block contributes",
    compare_anchors: [],
    probe_primer: [
      "Most modern chat LLMs are decoder-only Transformers: they predict the next token while attending only to previous tokens.",
      "A Transformer layer turns token IDs into vectors (embeddings), adds positional information (often RoPE, which encodes position by rotating representations), runs self-attention, then a feed-forward block, with layer normalization and residual connections around them.",
      "A large fraction of a model's parameters live in the feed-forward blocks, not in attention.",
      "The final hidden state is projected to logits over the vocabulary; stacking the same layer recipe dozens or hundreds of times is what makes a language model.",
      "Positional encoding matters because attention itself is order-agnostic; the model needs an explicit signal for token order.",
    ],
  },
  {
    order: 4,
    slug: "attention",
    title: "Attention",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "Attention decides which earlier tokens matter. The variant chosen (MHA, MQA, GQA, MLA) sets the KV-cache bill.",
    compare_axis_label: "Compare MHA, MQA, GQA, and MLA on KV-cache size, expressiveness, and long-context cost",
    compare_anchors: [],
    probe_primer: [
      "Attention is how each token decides which earlier tokens matter for the next prediction. It is also one reason long-context inference is so memory-sensitive.",
      "Classic multi-head attention (MHA) stores separate key/value state per head, which makes the KV cache large. MQA shares one key/value head across query heads (memory-efficient, less expressive); GQA groups query heads to share key/value heads (the common middle ground); MLA is a latent-compression variant used by some recent models.",
      "FlashAttention and SDPA-style kernels reduce attention memory traffic and keep the accelerator busier; a runtime with good kernels can be much faster on the same model and hardware.",
      "Parameter count is not the whole story: a 7B MHA model at long context can exhaust a 24 GB card while a 7B GQA model with the same advertised context fits with room to spare.",
      "When comparing models for long context, look at attention type, KV-head count, context length, and runtime support, not just the parameter count.",
    ],
  },
  {
    order: 5,
    slug: "kv-cache",
    title: "The KV cache",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "The model's working memory. It keeps generation usable and it is the hidden memory bill that grows with every token.",
    compare_axis_label: "Compare KV-cache memory at FP16 vs FP8/INT8, and across MHA vs GQA, for a fixed context length",
    compare_anchors: [],
    probe_primer: [
      "The KV cache stores key/value attention states for previous tokens so the model does not recompute the whole history on every generated token. Without it, generation would be far slower.",
      "KV-cache memory scales as tokens times layers times kv_heads times head_dim times precision times 2 (the 2 is for keys and values). For an older Llama-like 7B MHA model in FP16 this works out to about 0.5 MiB per token, so 4K tokens is roughly 2 GiB and 32K tokens roughly 16 GiB of KV cache alone.",
      "GQA and MQA reduce this substantially. FP8 or INT8 KV cache is the practical local compression floor; going below 8-bit is research-heavy and workload-sensitive, so it should be benchmarked, not assumed.",
      "KV-cache quantization (shrinking live context memory) is not the same as weight quantization (shrinking the model), and neither is the same as speculative decoding (drafting future tokens to cut latency).",
      "A model can load at an empty prompt and then run out of memory on a long document: the weights fit, the working memory did not.",
    ],
  },
  {
    order: 6,
    slug: "prefill-and-decode",
    title: "Prefill and decode",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "Two regimes with different costs. Prefill processes the prompt (time to first token); decode generates one token at a time (streaming speed).",
    compare_axis_label: "Compare what punishes prefill against what punishes decode, and where a long conversation pays both",
    compare_anchors: [],
    probe_primer: [
      "Inference has two regimes. Prefill processes the input prompt before the first output token; it is parallelizable and relatively compute-bound. Decode generates new tokens one at a time and is sequential and memory-bandwidth-bound.",
      "Time to first token is usually prefill time; the streaming typing effect, and whether a model feels fast, usually come from decode.",
      "Long prompts punish prefill; long answers punish decode; long conversations punish both because the KV cache keeps growing.",
      "In a chat session every turn adds to the cache, so a conversation that reaches 16K tokens pays the memory cost of all 16K tokens on every newly generated token. This is why chat interfaces that keep unbounded history eventually slow down or crash.",
      "Pasting a large document is felt as a pause (prefill); a slow stream after that is decode.",
    ],
  },
  {
    order: 7,
    slug: "decoding",
    title: "Decoding controls",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "After logits, nothing is written yet. Decoding turns scores into one token, and the knobs change voice, determinism, and risk.",
    compare_axis_label: "Compare greedy decoding against sampling (temperature, top-p, top-k) for evals, coding, and creative work",
    compare_anchors: [],
    probe_primer: [
      "After the model produces logits it has only scored possible next tokens. Decoding is the policy that selects one, appends it, and repeats. The knobs change the model's voice, determinism, and tendency to loop without changing the weights.",
      "The practical questions a decoding policy answers: how much randomness is allowed, how far into low-probability tokens the sampler can reach, and what boundaries (stop sequences, repetition penalties, max tokens) prevent loops or schema breaks.",
      "For precise work, start narrow: low temperature, short token limits, explicit stop sequences, and constrained decoding when output must match a schema. For creative work, give the sampler more room and rank candidates afterward.",
      "Greedy decoding is not always more accurate; it can get stuck in loops or produce generic answers because it never explores alternatives. Use deterministic settings, including a fixed seed, for evals.",
      "Constrained decoding can force output to match JSON or a grammar, which is more reliable than asking politely for valid JSON.",
    ],
  },
  {
    order: 8,
    slug: "model-packages",
    title: "Model packages and chat templates",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "Weights are not the whole model. Config, tokenizer, chat template, and generation defaults travel together, and the template is the part most often broken.",
    compare_axis_label: "Compare what breaks when the chat template, tokenizer, or special tokens are wrong against when the weights themselves are wrong",
    compare_anchors: [],
    probe_primer: [
      "A runnable model package is more than one weight file: it includes architecture/config (layer count, hidden size, attention type, RoPE settings, vocabulary, special tokens, context length), the weights, the tokenizer, the chat template, generation defaults, and a license and model card.",
      "If the tokenizer, config, or chat template is wrong, the same weights can feel broken. The weights are the largest file, not the whole model.",
      "A chat model was trained with a specific conversation format (system/user/assistant markers, BOS/EOS tokens, sometimes reasoning or tool-call wrappers). Using the wrong format causes gibberish, role confusion, ignored system prompts, broken tool calls, and bad benchmark results that look like the model being weak.",
      "Best practice is to use the tokenizer's built-in chat template (for example apply_chat_template) or the model-specific template the runtime ships, and to confirm whether the model is base, instruct, chat, reasoning, or tool-tuned.",
      "Treat the template like an API contract: if it is wrong, you are not testing the model you think you are testing.",
    ],
  },
  {
    order: 9,
    slug: "model-types",
    title: "Model types",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "Base, instruct, chat, reasoning, tool-tuned. Starting with the wrong type is a common reason a capable model feels useless.",
    compare_axis_label: "Compare base, instruct, chat, reasoning, and tool-tuned models on what each is good for",
    compare_anchors: [],
    probe_primer: [
      "Not all LLMs are tuned for the same behavior. A base model completes your prompt rather than answering it; it is useful for pretraining research, fine-tuning, and custom pipelines, and frustrating for direct use.",
      "Asked 'What is the capital of France?', a base model might continue with 'and what is the population of Paris?' instead of answering.",
      "Instruct models follow direct instructions; chat models handle multi-turn dialogue with role formatting; reasoning models benefit from extra thinking tokens and verification; tool-tuned models are built for structured calls and function use.",
      "For most users the default starting point is a recent instruct or chat model in a size that fits comfortably in memory.",
      "Do not start with a base model unless you know why you want one.",
    ],
  },
  {
    order: 10,
    slug: "long-context",
    title: "Long context",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "128K, 256K, 1M tokens is useful but not free. It is expensive attention, not a free notebook, and not a replacement for retrieval.",
    compare_axis_label: "Compare long context against retrieval for a large corpus, and where each is the right tool",
    compare_anchors: [],
    probe_primer: [
      "Long context is useful but has real costs: more KV-cache memory, slower prompt processing, more attention work, harder evaluation, and more ways for irrelevant text to distract the model.",
      "Quality can decay across distance; a model may handle the start and end of a long document well while missing details buried in the middle.",
      "Long context is a complement to retrieval, not a replacement. Use retrieval for large corpora and long context for the final selected evidence.",
      "Practical habits help: put critical instructions near the beginning and end, use section headers and delimiters, ask for citations tied to source chunks, and use summary memory instead of unbounded chat history.",
      "Supported context length is not the same as fast, cheap, or accurate at that length.",
    ],
  },
  {
    order: 11,
    slug: "rag",
    title: "RAG: retrieval-augmented generation",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "Retrieve relevant chunks and give only those to the model. Most bad RAG is bad retrieval and chunking, not a bad model.",
    compare_axis_label: "Compare where a RAG pipeline fails: parsing, chunking, retrieval, reranking, or generation",
    compare_anchors: [],
    probe_primer: [
      "RAG (retrieval-augmented generation) retrieves relevant chunks from a knowledge base and gives only those to the model, instead of stuffing everything into the prompt.",
      "A RAG pipeline has many stages (ingestion, parsing, chunking, embeddings, a vector index, retrieval, reranking, prompt construction, generation, grounding checks, evaluation) and each stage is a failure point.",
      "Most bad RAG systems are bad because of chunking, retrieval, reranking, and evaluation, not because of the model. A good model cannot answer from evidence it never received.",
      "Chunking strategy is the quiet failure: fixed-size chunks with no overlap can split a sentence or split an answer across boundaries. The right chunk size and overlap have to be evaluated on your actual documents.",
      "A good reranker can rescue mediocre retrieval, but no reranker can recover an answer that was lost during ingestion.",
    ],
  },
  {
    order: 12,
    slug: "tool-use",
    title: "Tool use and agents",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "Tools make a model useful and change the safety model. A chatbot that hallucinates is annoying; an agent with shell access is dangerous.",
    compare_axis_label: "Compare the four guardrail layers (scope, constrained execution, hostile inputs, audit trail) for a file vs shell vs browser agent",
    compare_anchors: [],
    probe_primer: [
      "Tool use (file search, shell, browser, databases, code execution, internal APIs) makes a model much more useful and changes the safety model. An agent with filesystem access can delete things; one with shell access can damage the machine.",
      "Local agent safety has layers: scope the agent tightly (only the directories, APIs, and credentials it needs), constrain execution (sandboxes, least-privilege users, confirmations for destructive actions, schema-validated arguments), treat inputs as hostile, and keep an audit trail of tool calls and approvals.",
      "Structured outputs (JSON schemas, constrained decoding, function signatures) make tool calls easier to validate but are not a security boundary; they do not prove the model chose a safe action or resisted injected instructions.",
      "For serious tool use, the policy checks belong outside the model.",
      "Retrieved documents, web pages, tickets, and emails are untrusted input and can contain prompt injection aimed at the model.",
    ],
  },
  {
    order: 13,
    slug: "fine-tuning",
    title: "Fine-tuning",
    type: "core",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "LoRA and QLoRA change behavior cheaply, but fine-tuning is the last lever, not the first. Try template, prompt, model, and RAG first.",
    compare_axis_label: "Compare the fixes in order: chat template, prompting, a better model, decoding, RAG, few-shot, then fine-tuning",
    compare_anchors: [],
    probe_primer: [
      "Fine-tuning changes behavior by training on additional data. LoRA freezes the base model and trains small low-rank adapters; QLoRA fine-tunes through a frozen 4-bit quantized model into LoRA adapters.",
      "Fine-tune for a consistent style, a domain-specific output format, repetitive classification or extraction, tool-call reliability, a specialized persona, or domain adaptation that retrieval cannot solve.",
      "Do not fine-tune first. The order to try is: correct chat template, better prompting, a better model, better decoding, RAG, reranking, few-shot examples, then fine-tuning.",
      "Many problems that look like 'the model does not understand my domain' are actually a vague prompt, a wrong template, or broken retrieval.",
      "A sound fine-tuning plan includes clean data, train/validation/test splits, baseline evals, a clear target behavior, overfitting and regression checks, adapter versioning, license review, and a rollback plan.",
    ],
  },
  {
    order: 14,
    slug: "multimodal",
    title: "Multimodal models",
    type: "capstone",
    track: "how-llms-work",
    layer_slugs: [],
    one_liner: "Images, audio, and video become tokens too. The non-text input is a memory cost and a new way to get the template wrong.",
    compare_axis_label: "Compare the hidden token and memory cost of text against a high-resolution image and against audio or video input",
    compare_anchors: [],
    probe_primer: [
      "Multimodal models accept images, and sometimes audio or video, in addition to text. The hidden cost is that non-text input becomes tokens too: vision encoders add memory and image patches consume context.",
      "A single high-resolution image can consume thousands of tokens, so image tokens should be counted against the same budget as text tokens.",
      "Multimodal templates are easier to get wrong than text-only templates.",
      "Small vision-language models can hallucinate visual details, OCR reliability varies, and charts and tables remain hard; evaluate with real samples rather than trusting a clean demo.",
      "The through-line of the whole track still holds: the model predicts one token at a time, tokens are not words, weights are not the whole model, the chat template matters, and the KV cache is the hidden memory bill. Once the mechanics are clear, the hardware and serving choices in the self-host track become easier to reason about.",
    ],
  },
] as const;

export const MODULE_BY_SLUG: Record<string, CourseModule> = Object.fromEntries(
  [...MODULES, ...SELF_HOST_MODULES, ...HOW_LLMS_WORK_MODULES].map((m) => [m.slug, m]),
);

/** Returns the in-track list for a module's track. */
function modulesForTrack(track: CourseTrack): readonly CourseModule[] {
  if (track === "self-host") return SELF_HOST_MODULES;
  if (track === "how-llms-work") return HOW_LLMS_WORK_MODULES;
  return MODULES;
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
