import Anthropic from "@anthropic-ai/sdk";

/**
 * Rich detail used by the OpenRouter model picker on /settings.
 * Pricing and context windows verified against openrouter.ai 2026-05-19.
 *
 * Capability ratings (0-5) below are mapped from public benchmarks
 * relevant to this site's task profile (tool-using chat agent that
 * emits strict citation markers across 14 tools). Source benchmarks:
 *   - Tools:    BFCL (Berkeley Function Calling Leaderboard, gorilla.cs.berkeley.edu),
 *               TAU3-Bench (sierra.ai), MCPMark
 *   - Reason:   Artificial Analysis Intelligence Index (artificialanalysis.ai),
 *               GPQA Diamond
 *   - Instruct: IFEval and the closed-model family's published track
 *               record on strict-format adherence. Open-weights models
 *               generally trail the Anthropic/OpenAI/Google frontier
 *               here, which is why the open tier is rated 3 even when
 *               their tools/reason scores are 4.
 *
 * These are MAPPED-FROM-PUBLIC-BENCHMARK ratings, not measurements
 * of this specific agent's behavior under this specific system prompt.
 * The bench harness at scripts/bench-models.mjs is the path to actual
 * site-specific measurements when we run it.
 */
export interface ModelDetails {
  id: string;
  name: string;
  vendor: string;
  inputPerM: number; // USD per 1M input tokens
  outputPerM: number; // USD per 1M output tokens
  contextLabel: string;
  speedLabel: string;
  capabilities: {
    tools: number; // tool-calling reliability
    reasoning: number; // multi-step synthesis quality
    instruct: number; // instruction-following (citation format discipline)
  };
  description: string;
  recommendedFor?: string; // chip text
}

export interface ProviderModel {
  id: string;
  label: string;
  description: string;
}

// Estimated cost-per-turn assumes a typical turn at this site:
// ~8,000 input tokens (system prompt + page context + tool-result
// inflation across 3-5 tool calls) and ~1,500 output tokens.
const TURN_INPUT_TOKENS = 8000;
const TURN_OUTPUT_TOKENS = 1500;

export function estimateCostPerTurn(m: {
  inputPerM: number;
  outputPerM: number;
}): number {
  return (
    (m.inputPerM * TURN_INPUT_TOKENS + m.outputPerM * TURN_OUTPUT_TOKENS) /
    1_000_000
  );
}

// OpenRouter: 8-model lineup, refreshed 2026-05-19. Descriptions cite
// the most-relevant public benchmark per model. Capability ratings
// mapped from BFCL / TAU3-Bench / Artificial Analysis Intelligence
// Index / GPQA Diamond / IFEval; see file header.
export const OPENROUTER_MODEL_DETAILS: ModelDetails[] = [
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    vendor: "DeepSeek",
    inputPerM: 0.435,
    outputPerM: 0.87,
    contextLabel: "1M",
    speedLabel: "Fast",
    capabilities: { tools: 4, reasoning: 4, instruct: 3 },
    description:
      "Open-weights MoE, 1.6T total / 49B active parameters. AA Intelligence Index 52; SWE-Bench Pro 67.9%. Launch promo pricing through 2026-05-31; rises to $1.74/$3.48 after.",
    recommendedFor: "Default",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    vendor: "Anthropic",
    inputPerM: 3.0,
    outputPerM: 15.0,
    contextLabel: "1M",
    speedLabel: "Fast",
    capabilities: { tools: 5, reasoning: 4, instruct: 5 },
    description:
      "Anthropic mid-tier. ARC-AGI-2 Verified 58.3%. Strong on MCP-Atlas tool-use benchmark.",
  },
  {
    id: "anthropic/claude-opus-4.7",
    name: "Claude Opus 4.7",
    vendor: "Anthropic",
    inputPerM: 5.0,
    outputPerM: 25.0,
    contextLabel: "1M",
    speedLabel: "Moderate",
    capabilities: { tools: 5, reasoning: 5, instruct: 5 },
    description:
      "Anthropic flagship. SWE-Bench Pro 64.3%, GPQA Diamond 94.2%, AA Intelligence Index 57. New tokenizer uses ~35% more tokens for English text than 4.6, so effective cost is higher than headline.",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    vendor: "Anthropic",
    inputPerM: 1.0,
    outputPerM: 5.0,
    contextLabel: "200K",
    speedLabel: "Very Fast",
    capabilities: { tools: 4, reasoning: 3, instruct: 4 },
    description:
      "Anthropic cheap tier. Fastest Anthropic option, 200K context.",
  },
  {
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    vendor: "Google",
    inputPerM: 2.0,
    outputPerM: 12.0,
    contextLabel: "1M",
    speedLabel: "Fast",
    capabilities: { tools: 4, reasoning: 5, instruct: 4 },
    description:
      "Google flagship. GPQA Diamond 94.3% (highest of any model). Configurable thinking levels.",
  },
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    vendor: "OpenAI",
    inputPerM: 5.0,
    outputPerM: 30.0,
    contextLabel: "1M",
    speedLabel: "Fast",
    capabilities: { tools: 5, reasoning: 5, instruct: 4 },
    description:
      "OpenAI flagship, released April 23, 2026. AA Intelligence Index 60 (top of all models), Terminal-Bench 2.0 82.7%. Input above 272K tokens doubles in price.",
  },
  {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    vendor: "Moonshot AI",
    inputPerM: 0.73,
    outputPerM: 3.49,
    contextLabel: "256K",
    speedLabel: "Fast",
    capabilities: { tools: 4, reasoning: 4, instruct: 3 },
    description:
      "Open-weights MoE, 1T total / 32B active parameters. Terminal-Bench 2.0 86.0% (leads open weights). AA Intelligence Index 54. Modified-MIT license.",
  },
  {
    id: "z-ai/glm-5.1",
    name: "GLM-5.1",
    vendor: "Z.ai",
    inputPerM: 0.98,
    outputPerM: 3.08,
    contextLabel: "200K",
    speedLabel: "Fast",
    capabilities: { tools: 4, reasoning: 3, instruct: 3 },
    description:
      "MIT-licensed open weights. TAU3-Bench 70.6% (third overall on agentic tool use). AA Intelligence Index 51.",
  },
];

export const OPENROUTER_MODELS: ProviderModel[] =
  OPENROUTER_MODEL_DETAILS.map((m) => ({
    id: m.id,
    label: m.name,
    description: m.description,
  }));

export const DEFAULT_MODEL = "deepseek/deepseek-v4-pro";

/**
 * Build an OpenRouter client for the given API key. Pure BYOK: no
 * shared key fallback. If apiKey is empty, callers should redirect
 * the user to /settings rather than calling this.
 *
 * OpenRouter exposes the Anthropic-compatible Messages endpoint at
 * /api/v1/messages; the SDK appends "/v1/messages" to baseURL, so
 * the baseURL must stop at "/api".
 */
export function makeClient(apiKey: string): Anthropic {
  if (!apiKey) throw new Error("API key required");
  return new Anthropic({
    apiKey,
    baseURL: "https://openrouter.ai/api",
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      "HTTP-Referer":
        typeof window !== "undefined" ? window.location.origin : "",
      "X-Title": "open-source-ai-stack",
    },
    // OpenRouter's CORS allow-list does not include the SDK-default
    // anthropic-version header; strip it so the preflight passes.
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers ?? {});
      headers.delete("anthropic-version");
      headers.delete("anthropic-dangerous-direct-browser-access");
      return fetch(input as RequestInfo | URL, { ...init, headers });
    },
  });
}
