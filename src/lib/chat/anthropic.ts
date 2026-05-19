import Anthropic from "@anthropic-ai/sdk";

export type Provider = "anthropic" | "openrouter";

export interface ProviderModel {
  id: string;
  label: string;
  description: string;
}

/**
 * Rich detail used by the OpenRouter model picker on /settings.
 * Pricing and context windows are kept in sync with the openrouter.ai
 * model pages; numbers below verified 2026-05-19.
 *
 * Lineup refresh 2026-05-19: replaced Gemini 2.5 Pro -> 3.1 Pro,
 * GPT-5 -> GPT-5.5, Qwen3 235B -> Kimi K2.6; added DeepSeek V4 Pro
 * (default) and GLM-5.1. Descriptions are intentionally minimal until
 * we have empirical results from the bench harness; capabilities are
 * uniform 3/3/3 placeholders, NOT measured ratings.
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

// Anthropic native: 3 models, all relevant.
export const ANTHROPIC_MODELS: ProviderModel[] = [
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    description: "Deepest reasoning, slower, costlier",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    description: "Balanced default",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    description: "Fast and cheap, near-frontier discipline",
  },
];

// OpenRouter: 8-model lineup, refreshed 2026-05-19. Descriptions
// kept intentionally minimal (no editorial claims about quality,
// discipline, or instruct-following) pending empirical results from
// the bench harness. Capability dots are uniform 3/3/3 placeholders.
export const OPENROUTER_MODEL_DETAILS: ModelDetails[] = [
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    vendor: "DeepSeek",
    inputPerM: 0.435,
    outputPerM: 0.87,
    contextLabel: "1M",
    speedLabel: "Fast",
    capabilities: { tools: 3, reasoning: 3, instruct: 3 },
    description:
      "Open-weights MoE, 1.6T total / 49B active parameters. Launch-promo pricing through 2026-05-31; rises to $1.74/$3.48 after.",
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
    capabilities: { tools: 3, reasoning: 3, instruct: 3 },
    description: "Anthropic mid-tier.",
  },
  {
    id: "anthropic/claude-opus-4.7",
    name: "Claude Opus 4.7",
    vendor: "Anthropic",
    inputPerM: 5.0,
    outputPerM: 25.0,
    contextLabel: "1M",
    speedLabel: "Moderate",
    capabilities: { tools: 3, reasoning: 3, instruct: 3 },
    description:
      "Anthropic flagship. New tokenizer uses ~35% more tokens than 4.6 for the same English text, so effective cost is higher than the headline rate.",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    vendor: "Anthropic",
    inputPerM: 1.0,
    outputPerM: 5.0,
    contextLabel: "200K",
    speedLabel: "Very Fast",
    capabilities: { tools: 3, reasoning: 3, instruct: 3 },
    description: "Anthropic cheap tier.",
  },
  {
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    vendor: "Google",
    inputPerM: 2.0,
    outputPerM: 12.0,
    contextLabel: "1M",
    speedLabel: "Fast",
    capabilities: { tools: 3, reasoning: 3, instruct: 3 },
    description: "Google flagship with configurable thinking levels.",
  },
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    vendor: "OpenAI",
    inputPerM: 5.0,
    outputPerM: 30.0,
    contextLabel: "1M",
    speedLabel: "Fast",
    capabilities: { tools: 3, reasoning: 3, instruct: 3 },
    description:
      "OpenAI flagship, released April 23, 2026. Input above 272K tokens doubles in price.",
  },
  {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    vendor: "Moonshot AI",
    inputPerM: 0.73,
    outputPerM: 3.49,
    contextLabel: "256K",
    speedLabel: "Fast",
    capabilities: { tools: 3, reasoning: 3, instruct: 3 },
    description:
      "Open-weights MoE, 1T total / 32B active parameters. Modified-MIT license.",
  },
  {
    id: "z-ai/glm-5.1",
    name: "GLM-5.1",
    vendor: "Z.ai",
    inputPerM: 0.98,
    outputPerM: 3.08,
    contextLabel: "200K",
    speedLabel: "Fast",
    capabilities: { tools: 3, reasoning: 3, instruct: 3 },
    description: "MIT-licensed open weights.",
  },
];

export const OPENROUTER_MODELS: ProviderModel[] =
  OPENROUTER_MODEL_DETAILS.map((m) => ({
    id: m.id,
    label: m.name,
    description: m.description,
  }));

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-6",
  openrouter: "deepseek/deepseek-v4-pro",
};

export function modelsFor(provider: Provider): ProviderModel[] {
  return provider === "anthropic" ? ANTHROPIC_MODELS : OPENROUTER_MODELS;
}

/**
 * Build a client for the given provider and key. Pure BYOK: no shared
 * key fallback. If apiKey is empty, callers should redirect the user
 * to /settings.
 */
export function makeClient(provider: Provider, apiKey: string): Anthropic {
  if (!apiKey) throw new Error("API key required");
  if (provider === "anthropic") {
    return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }
  // OpenRouter exposes the Anthropic-compat Messages endpoint at
  // /api/v1/messages. The SDK appends "/v1/messages" to baseURL, so
  // the baseURL must stop at "/api".
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
