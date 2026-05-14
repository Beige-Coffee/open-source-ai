import Anthropic from "@anthropic-ai/sdk";

export type Provider = "anthropic" | "openrouter";

export interface ProviderModel {
  id: string;
  label: string;
  description: string;
}

export const ANTHROPIC_MODELS: ProviderModel[] = [
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", description: "Deepest reasoning, slower, costlier" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Balanced default" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", description: "Fast and cheap" },
];

export const OPENROUTER_MODELS: ProviderModel[] = [
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", description: "Recommended default; best instruction-following for citations" },
  { id: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7", description: "Highest capability; slower and pricier" },
  { id: "openai/gpt-5", label: "GPT-5", description: "OpenAI flagship; strong code, tends to be more declarative" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "2M context, cheapest high-capability option" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", description: "Open weights via OpenRouter; cheapest, looser citation behavior" },
];

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
  // /api/v1/messages. The SDK appends "/v1/messages" to baseURL, so the
  // baseURL must stop at "/api".
  return new Anthropic({
    apiKey,
    baseURL: "https://openrouter.ai/api",
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "",
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
