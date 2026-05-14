import Anthropic from "@anthropic-ai/sdk";

export type Provider = "anthropic" | "openrouter";

export interface ProviderModel {
  id: string;
  label: string;
  description: string;
}

/**
 * Rich detail used by the OpenRouter model picker on /settings.
 * Pricing and context windows on this site are kept in sync with the
 * openrouter.ai model pages; numbers below verified 2026-05-14.
 *
 * Capability ratings (0-5) are this site's editorial judgment for the
 * specific task profile here: tool-use + reasoning + strict citation
 * format. They are NOT general capability scores.
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

// OpenRouter: curated for THIS site's task profile (tool-use + reasoning
// + strict citation discipline). Verified 2026-05-14 against
// openrouter.ai model pages.
export const OPENROUTER_MODEL_DETAILS: ModelDetails[] = [
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    vendor: "Anthropic",
    inputPerM: 3.0,
    outputPerM: 15.0,
    contextLabel: "1M",
    speedLabel: "Fast",
    capabilities: { tools: 5, reasoning: 5, instruct: 5 },
    description:
      "The default workhorse. Best instruction-following of the lot, excellent at wiki-grounded synthesis, very reliable about emitting the (Layer: ...) / (Project: ...) citation markers verbatim. Start here.",
    recommendedFor: "Recommended default",
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
      "Highest capability ceiling. Noticeably more expensive than Sonnet but better on multi-tool-call sessions where the agent has to thread many entries together. Worth it for hard cross-layer questions.",
    recommendedFor: "Deepest",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    vendor: "Anthropic",
    inputPerM: 1.0,
    outputPerM: 5.0,
    contextLabel: "200K",
    speedLabel: "Very Fast",
    capabilities: { tools: 4, reasoning: 4, instruct: 5 },
    description:
      "Fastest Anthropic option and the cheapest one that holds the citation-format discipline reliably. Slightly weaker on multi-step reasoning than Sonnet. Good default for casual browsing.",
    recommendedFor: "Cheapest Anthropic",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    vendor: "Google",
    inputPerM: 1.25,
    outputPerM: 10.0,
    contextLabel: "1M",
    speedLabel: "Very Fast",
    capabilities: { tools: 4, reasoning: 4, instruct: 4 },
    description:
      "Wide context window and strong cost-to-capability ratio. Slightly looser on the strict citation-marker discipline than the Anthropic models, but the price-and-context combination is hard to beat for browse-style sessions.",
    recommendedFor: "Best value",
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    vendor: "OpenAI",
    inputPerM: 1.25,
    outputPerM: 10.0,
    contextLabel: "400K",
    speedLabel: "Fast",
    capabilities: { tools: 5, reasoning: 4, instruct: 4 },
    description:
      "OpenAI's flagship. Strong tool-calling, comparable to Sonnet on synthesis. Tends to be more declarative and slightly less rigorous about emitting citations on every factual claim; nudge it if you want the strict discipline.",
  },
  {
    id: "qwen/qwen3-235b-a22b",
    name: "Qwen3 235B A22B",
    vendor: "Alibaba",
    inputPerM: 0.455,
    outputPerM: 1.82,
    capabilities: { tools: 4, reasoning: 5, instruct: 4 },
    contextLabel: "131K",
    speedLabel: "Fast",
    description:
      "Open-weights MoE model, hosted on OpenRouter. Strong reasoning (with thinking mode), tool-calling is solid, instruction-following is a notch below Anthropic on the strict citation format. By far the cheapest credible option. The on-brand choice for this site if you want to dogfood open weights.",
    recommendedFor: "Open weights",
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
  openrouter: "anthropic/claude-sonnet-4.6",
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
