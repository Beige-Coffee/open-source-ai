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

export interface CourseModule {
  order: number;
  slug: string;
  title: string;
  type: ModuleType;
  /** The layer slug(s) this module covers. Most modules are 1:1 with a layer. */
  layer_slugs: string[];
  /** Short editorial framing used on /learn and the module page header. */
  one_liner: string;
  /** Anchor projects / standards the Compare phase asks the user to contrast. */
  compare_axis_label: string;
  compare_anchors: string[];
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

export const MODULE_BY_SLUG: Record<string, CourseModule> =
  Object.fromEntries(MODULES.map((m) => [m.slug, m]));

export function nextModule(slug: string): CourseModule | null {
  const idx = MODULES.findIndex((m) => m.slug === slug);
  if (idx < 0 || idx === MODULES.length - 1) return null;
  return MODULES[idx + 1];
}

export function prevModule(slug: string): CourseModule | null {
  const idx = MODULES.findIndex((m) => m.slug === slug);
  if (idx <= 0) return null;
  return MODULES[idx - 1];
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
