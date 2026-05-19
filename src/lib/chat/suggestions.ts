/**
 * Context-aware suggestion strings for the in-site chat agent.
 *
 * The ChatBubble shows ~4 starter prompts when a thread is empty. Per
 * the May 2026 UX pass, those are derived from the user's current
 * page rather than from a global mode setting. The intent: opening
 * the chat on /stack/silicon should show silicon-specific suggestions;
 * opening on /projects/vllm should show vLLM-specific ones; everything
 * else falls back to a generic set.
 *
 * Suggestions are template-derived (not hand-curated per entity) so
 * adding a new project/layer/funder/glossary entry surfaces in the
 * chat with zero per-entity authoring.
 */
import type { PageContext } from "./types";
import {
  getProjects,
  getFunders,
  getLayers,
  getGlossary,
} from "./data";

const GENERIC_SUGGESTIONS: string[] = [
  "Which funders cross over from Bitcoin OSS to AI?",
  "What's vLLM and why does it matter for local AI?",
  "Show me grants under $100K at the identity-trust layer",
  "Recent news at the runtime layer?",
];

/**
 * Async-resolves the four suggestions to show for the given context.
 * Falls back to GENERIC_SUGGESTIONS when the entity can't be found.
 *
 * The display-name lookups (e.g. slug "vllm" -> "vLLM") use the same
 * /public/data/*.json the chat tools read; nothing extra over the wire
 * because those files are already in the cache when the panel mounts.
 */
export async function suggestionsForContext(
  ctx: PageContext,
): Promise<string[]> {
  if (!ctx.entity) {
    return routeSuggestions(ctx.pathname) ?? GENERIC_SUGGESTIONS;
  }

  if (ctx.entity.kind === "layer") {
    const layers = await getLayers().catch(() => []);
    const found = layers.find((l) => l.slug === ctx.entity!.slug);
    const name = found?.title ?? prettySlug(ctx.entity.slug);
    return [
      `What are the most important projects at the ${name} layer?`,
      `Why does open source matter at the ${name} layer?`,
      `Who funds work at the ${name} layer?`,
      `Recent news at the ${name} layer?`,
    ];
  }

  if (ctx.entity.kind === "project") {
    const projects = await getProjects().catch(() => []);
    const found = projects.find((p) => p.slug === ctx.entity!.slug);
    const name = found?.name ?? prettySlug(ctx.entity.slug);
    return [
      `What is ${name} and where does it sit in the stack?`,
      `What are the alternatives to ${name}?`,
      `What's the license and openness posture of ${name}?`,
      `Who's actually using ${name} in production?`,
    ];
  }

  if (ctx.entity.kind === "funder") {
    const funders = await getFunders().catch(() => []);
    const found = funders.find((f) => f.slug === ctx.entity!.slug);
    const name = found?.name ?? prettySlug(ctx.entity.slug);
    return [
      `What has ${name} actually funded recently?`,
      `What's ${name}'s thesis or focus area?`,
      `How do you apply for a grant from ${name}?`,
      `Which layers of the stack does ${name} cover?`,
    ];
  }

  if (ctx.entity.kind === "glossary") {
    const glossary = await getGlossary().catch(() => []);
    const found = glossary.find((g) => g.slug === ctx.entity!.slug);
    const term = found?.term ?? prettySlug(ctx.entity.slug);
    return [
      `Explain ${term} in plain English.`,
      `What problem does ${term} solve?`,
      `How does ${term} relate to the rest of the stack?`,
      `What are the practical tradeoffs of ${term}?`,
    ];
  }

  if (ctx.entity.kind === "news") {
    return [
      `Summarize the news from ${ctx.entity.date}.`,
      "What changed at the runtime layer recently?",
      "Any new grant announcements this week?",
      "Which layer saw the most activity?",
    ];
  }

  return GENERIC_SUGGESTIONS;
}

/** Suggestions for section-index pages that don't resolve to a single entity. */
function routeSuggestions(pathname: string): string[] | null {
  if (pathname === "/grants" || pathname.startsWith("/grants?")) {
    return [
      "Show me grants in the last 90 days.",
      "Which funders are sovereignty-focused?",
      "What are the underfunded areas in the stack?",
      "Grants over $1M, in any layer?",
    ];
  }
  if (pathname === "/predictions") {
    return [
      "Which predictions are most likely to resolve in the next year?",
      "What's our most contentious prediction?",
      "Show me only high-confidence claims.",
      "What predictions sit at the silicon layer?",
    ];
  }
  if (pathname === "/news" || pathname === "/today") {
    return [
      "Summarize the most recent news issue.",
      "What changed at the runtime layer recently?",
      "Any new grant announcements this week?",
      "Which layer saw the most activity recently?",
    ];
  }
  if (pathname === "/glossary") {
    return [
      "What is mixture of experts?",
      "Explain MCP and why it matters.",
      "Definitions at the retrieval-memory layer.",
      "What's PagedAttention?",
    ];
  }
  if (pathname === "/stack" || pathname === "/stack/") {
    return [
      "Which layer is most contested right now?",
      "What's the lock-in vector at each layer?",
      "Which meta-layer ties to sovereignty most directly?",
      "Where's open-source weakest?",
    ];
  }
  return null;
}

function prettySlug(slug: string): string {
  return slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export { GENERIC_SUGGESTIONS };
