/**
 * Canonical quantization format families surfaced on /models.
 *
 * A model's `quantizations_available[]` is normalized to these family ids.
 * A family is asserted for a model only when a primary source confirms it
 * (the model's Hugging Face page / model tree, an official quant repo, or
 * the lab's release), and it renders only when its verification verdict is
 * in the PASS set: the value is gated exactly like every other model fact.
 *
 * Scope decision (locked with Austin): format FAMILIES, not specific
 * precisions or every community upload. The unit is "this model has GGUF /
 * AWQ / GPTQ / EXL2 / MLX / FP8 weights available," which is what can be
 * sourced and kept verifiably correct. Proprietary (closed-weight) models
 * have no public quantizations by definition.
 */

export type QuantFamily = "gguf" | "awq" | "gptq" | "exl2" | "mlx" | "fp8" | "bnb";

export interface QuantEngine {
  name: string;
  /** Glossary slug if an entry exists, for safe in-site linking. */
  glossary?: string;
}

export interface QuantFamilyMeta {
  id: QuantFamily;
  label: string;
  /** One-line description of the format. */
  blurb: string;
  /** Inference engines that load this format. */
  engines: QuantEngine[];
}

export const QUANT_FAMILIES: QuantFamilyMeta[] = [
  {
    id: "gguf",
    label: "GGUF",
    blurb: "llama.cpp's container; the common local format, k-quants from Q2 to Q8.",
    engines: [{ name: "llama.cpp", glossary: "llama-cpp" }, { name: "Ollama", glossary: "ollama" }],
  },
  {
    id: "awq",
    label: "AWQ",
    blurb: "Activation-aware 4-bit weight quantization for GPU serving.",
    engines: [{ name: "vLLM", glossary: "vllm" }, { name: "SGLang", glossary: "sglang" }],
  },
  {
    id: "gptq",
    label: "GPTQ",
    blurb: "Post-training 4-bit weight quantization for GPU serving.",
    engines: [{ name: "vLLM", glossary: "vllm" }, { name: "SGLang", glossary: "sglang" }, { name: "Transformers" }],
  },
  {
    id: "exl2",
    label: "EXL2",
    blurb: "ExLlamaV2's variable-bitrate format for consumer GPUs.",
    engines: [{ name: "ExLlamaV2" }],
  },
  {
    id: "mlx",
    label: "MLX",
    blurb: "Apple MLX 4/8-bit layout for Apple silicon.",
    engines: [{ name: "Apple MLX", glossary: "mlx" }],
  },
  {
    id: "fp8",
    label: "FP8",
    blurb: "8-bit float, frequently a native release on Hopper / Blackwell GPUs.",
    engines: [{ name: "vLLM", glossary: "vllm" }, { name: "SGLang", glossary: "sglang" }, { name: "TensorRT-LLM", glossary: "tensorrt-llm" }],
  },
  {
    id: "bnb",
    label: "bitsandbytes",
    blurb: "On-the-fly NF4 / INT8 weight quantization inside Transformers.",
    engines: [{ name: "Transformers" }],
  },
];

export const QUANT_BY_ID: Record<string, QuantFamilyMeta> =
  Object.fromEntries(QUANT_FAMILIES.map((q) => [q.id, q]));
export const QUANT_FAMILY_IDS: QuantFamily[] = QUANT_FAMILIES.map((q) => q.id);

/**
 * Coerce a raw token from models.yaml to a family id, or null if it is not
 * a family we track (bare precisions like fp16/bf16/int4/w4a4 are the
 * native release or ambiguous, not a quant family). Bare GGUF precisions
 * (q4_k_m, q8_0, "2bit") fold into "gguf".
 */
export function normalizeQuantToken(raw: string): QuantFamily | null {
  const t = String(raw).toLowerCase().trim();
  if (t.startsWith("gguf") || /^q\d/.test(t) || /^\d+bit$/.test(t) || t === "k-quant") return "gguf";
  if (t.startsWith("awq")) return "awq";
  if (t.startsWith("gptq")) return "gptq";
  if (t.startsWith("exl2") || t.startsWith("exllama")) return "exl2";
  if (t.startsWith("mlx")) return "mlx";
  if (t === "fp8" || t === "f8") return "fp8";
  if (t.includes("bitsandbytes") || t === "bnb" || t === "nf4") return "bnb";
  if ((QUANT_FAMILY_IDS as string[]).includes(t)) return t as QuantFamily;
  return null;
}

/** Normalize + dedupe a model's raw quant list into ordered family ids. */
export function normalizeQuantList(raw: string[] | undefined): QuantFamily[] {
  if (!raw) return [];
  const set = new Set<QuantFamily>();
  for (const r of raw) {
    const f = normalizeQuantToken(r);
    if (f) set.add(f);
  }
  return QUANT_FAMILY_IDS.filter((id) => set.has(id));
}
