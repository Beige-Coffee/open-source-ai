/**
 * Tool definitions and executor for the in-site chat agent.
 *
 * All tools execute browser-side over JSON in /public/data/. Each has
 * a per-turn rate limit and a dedup cache (instantiated per turn via
 * ToolBudget). Patterns ported from meaning-crisis/src/lib/tools.ts.
 */
import {
  getGrants,
  getFunders,
  getProjects,
  getReadings,
  getLayers,
  getLayerContent,
  getTodayNews,
  getGlossary,
  getModels,
  getHardware,
} from "./data";
import { searchAll } from "./retrieve";

// ----------------------------------------------------------------------
// Anthropic tool schemas
// ----------------------------------------------------------------------

export const TOOLS = [
  {
    name: "find_grants",
    description:
      "Filter the grants catalog by kind, funder, layer, region, amount, or recency. 'kind' is the most important filter: 'project' = a specific named project that got money (Maple AI, Goose, BridgingBot); 'program' = a cohort, fellowship, RFP, or aggregate announcement (AI Safety Fund Dec 2025 round, SFF-2025 allocations, Anthropic Fellows). Default to projects unless the user is asking about programs to apply to. Returns up to 12 grants. Limit: 3 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["project", "program"], description: "Filter to specific projects vs cohort/program announcements." },
        funder: { type: "string", description: "Funder slug, e.g. 'hrf', 'cosmos-institute', 'foresight-institute'." },
        layer: { type: "string", description: "Layer slug, e.g. 'silicon', 'identity-trust', 'sovereignty-decentralization'." },
        region: { type: "string", enum: ["US", "EU", "UK", "Global", "Asia", "Africa", "LatAm"] },
        amount_bucket: { type: "string", enum: [">10M", "1M-10M", "100K-1M", "<100K", "undisclosed"] },
        recency: { type: "string", enum: ["30d", "90d", "1y", "older"], description: "30d, 90d, 1y, or older than a year." },
        query: { type: "string", description: "Free-text query to filter description (e.g. 'confidential computing')." },
      },
    },
  },
  {
    name: "find_funders",
    description:
      "Filter the funders catalog by region, type, focus layer, or free-text query. Use to find funders matching a thesis (e.g. 'cypherpunk-adjacent funders', 'EU public funders'). Returns up to 12 funders with profile fields. Limit: 2 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string", enum: ["US", "EU", "UK", "Global", "Asia", "Africa", "LatAm"] },
        type: { type: "string", enum: ["government", "foundation", "corporate", "consortium"] },
        focus_layer: { type: "string", description: "Layer slug they prioritize, e.g. 'safety-guardrails', 'sovereignty-decentralization'." },
        query: { type: "string", description: "Free-text query against funder mission and notable_recent." },
      },
    },
  },
  {
    name: "find_projects",
    description:
      "Filter the projects catalog by layer, focus tag, or maturity. Use to enumerate projects at a layer, or compare openness postures (e.g. 'open-source agents'). Returns up to 12 projects. Limit: 3 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        layer: { type: "string", description: "Layer slug." },
        focus: { type: "string", enum: ["open", "open-weights", "source-available", "proprietary", "standard"] },
        maturity: { type: "string", enum: ["stable", "beta", "alpha", "research", "maintenance", "new"] },
        query: { type: "string", description: "Free-text query." },
      },
    },
  },
  {
    name: "find_readings",
    description:
      "Filter curated reading list. Use to recommend papers, posts, talks, podcasts, books, or docs at a layer. Returns up to 12 readings. Limit: 3 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        layer: { type: "string", description: "Layer slug." },
        type: { type: "string", enum: ["paper", "post", "talk", "podcast", "book", "thread", "docs"] },
        year_min: { type: "number", description: "Inclusive lower bound on publication year." },
        query: { type: "string", description: "Free-text query." },
      },
    },
  },
  {
    name: "read_layer",
    description:
      "Fetch the full editorial overview for a single layer (the 'What it is' prose), plus its sidebar metadata (lock-in vector, sovereignty relevance, related layers). Use when the user wants to understand a layer in depth. Limit: 3 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Layer slug." },
      },
      required: ["slug"],
    },
  },
  {
    name: "read_funder",
    description:
      "Fetch the full profile of one funder, plus all grants attributed to them. Use when the user asks about a specific funder. Limit: 3 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Funder slug." },
      },
      required: ["slug"],
    },
  },
  {
    name: "read_project",
    description:
      "Fetch the full record for one project: its description, license, focus, maturity, primary url, github (if any), the layers it sits in, and (for high-priority projects) a multi-paragraph explainer with cited sources covering what it is, how it compares to siblings at the same layer, why it matters, who uses it, and production-readiness. ALSO returns sibling projects at the same primary layer so you can compare. Use this when the user asks about a specific named project. Limit: 4 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Project slug, e.g. 'risc-v', 'vllm', 'goose'." },
      },
      required: ["slug"],
    },
  },
  {
    name: "read_grant",
    description:
      "Fetch a single grant by exact title. Returns all fields (recipient, funder, amount, layers, url, description) plus optional `explainer` (multi-paragraph research) and `sources` array when a richer writeup exists. Use when the user asks about a specific named grant; prefer this over find_grants when you already know the title. Limit: 3 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Exact grant title." },
      },
      required: ["title"],
    },
  },
  {
    name: "today_news",
    description:
      "Fetch today's daily news roundup. Returns date, editorial letter, layer buckets (which layers had items), and the body. Use when user asks about recent news. Limit: 1 call per turn.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "find_glossary",
    description:
      "Filter the glossary by layer, free-text query against term or summary, or list every entry. Use to surface candidate definitions when the user asks 'what is X' or 'what are the key concepts at <layer>'. Returns up to 12 entries with term, summary, primary_layer, aliases. Limit: 3 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        layer: { type: "string", description: "Layer slug; matches primary_layer or any secondary_layer." },
        query: { type: "string", description: "Free-text query against term and summary." },
      },
    },
  },
  {
    name: "read_glossary",
    description:
      "Fetch the full glossary entry for one term by canonical slug OR by any alias (e.g. slug='moe' resolves to mixture-of-experts). Returns term, aliases, summary, primary_layer, secondary_layers, full body prose, sources. Use when the user asks for a deeper explanation of a specific concept, or after a 'Chat about this' click on a hover card. Limit: 4 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Canonical slug or alias of the glossary term." },
      },
      required: ["slug"],
    },
  },
  {
    name: "find_models",
    description:
      "Filter the catalog of language-model checkpoints (open and closed, since Feb 2023) by family, developer, openness tier, architecture, release year, or free-text query. Returns up to 12 checkpoints with identity, release date, openness, architecture, params, context, and any reported benchmark scores. Use when the user asks about which models exist, when, or how openness/architecture options compare. Limit: 3 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        family: { type: "string", description: "Family slug, e.g. 'llama', 'qwen', 'deepseek', 'claude', 'gemini'." },
        developer: { type: "string", description: "Developer name, e.g. 'Meta', 'OpenAI', 'Anthropic', 'DeepSeek'." },
        openness: { type: "string", enum: ["open", "open-weights", "source-available", "proprietary"], description: "Openness tier." },
        architecture: { type: "string", enum: ["dense", "moe", "hybrid", "ssm", "unknown"] },
        type: { type: "string", enum: ["base", "instruct", "chat", "reasoning", "code", "vision-language"] },
        year: { type: "number", description: "Release year (4 digits)." },
        query: { type: "string", description: "Free-text query against display_name, release_context, notable_innovations." },
      },
    },
  },
  {
    name: "read_model",
    description:
      "Fetch the full record for one model checkpoint by canonical slug. Returns identity, timeline, openness, license, architecture (params, attention variant, position encoding, MoE experts when applicable), training (tokens, hardware, post-training stages), every reported benchmark with its as-of date and source URL, cost (input + output $/M tok via Artificial Analysis), speed (decode tokens/sec, TTFT), lineage (parent + children slugs), recommended use cases, known limitations, long-form 'why people cared' essay, quantizations and runtimes that support it, release_context, notable_innovations, reception quotes with author + URL, full sources list, and the family siblings. Use this when the user asks about a specific named model; prefer it over find_models when you already know the slug. Limit: 4 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Canonical model slug, e.g. 'deepseek-r1', 'llama-3-1-405b-instruct', 'claude-3-5-sonnet'." },
      },
      required: ["slug"],
    },
  },
  {
    name: "compare_models",
    description:
      "Compare 2 to 4 model checkpoints by slug. Returns an array of records (one per slug) with normalized fields ready for side-by-side analysis: identity, openness, architecture, params, context, cost, speed, full benchmark scores, recommended use cases, lineage, and release_context. Use when the user asks to compare named models. Limit: 2 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        slugs: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 4,
          description: "Array of 2 to 4 canonical model slugs.",
        },
      },
      required: ["slugs"],
    },
  },
  {
    name: "find_hardware",
    description:
      "Filter the hardware catalog (datacenter, workstation, Apple unified, x86 unified, AI-PC) by class, vendor, or free-text query, or by a minimum memory capacity. Returns each SKU's memory capacity, memory type, memory bandwidth (the decode-speed determinant), dense compute, power, and release date. Use when the user asks what hardware exists, or which boxes have enough memory or bandwidth for a model. Memory bandwidth, not FLOPS, predicts single-stream decode tokens/sec. Limit: 3 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        class: { type: "string", enum: ["datacenter", "workstation", "apple-unified", "x86-unified", "ai-pc"] },
        vendor: { type: "string", description: "e.g. 'NVIDIA', 'AMD', 'Apple', 'Qualcomm', 'Intel', 'Tenstorrent'." },
        min_memory_gb: { type: "number", description: "Only return SKUs with at least this much memory per unit." },
        query: { type: "string", description: "Free-text query against name, vendor, notes." },
      },
    },
  },
  {
    name: "read_hardware",
    description:
      "Fetch the full record for one hardware SKU by slug: memory capacity and type, memory bandwidth, dense compute (FP16/FP8/FP4/INT8), form factor, power, interconnect, typical multi-unit deployment, NPU TOPS if any, release date, the cross-linked silicon project, neutral notes, and sources. Use when the user asks about a specific named accelerator or box. For 'will model X fit / how fast' questions, combine with read_model: fit needs total params vs capacity; decode tokens/sec is roughly memory_bandwidth divided by (active_params times bytes-per-weight plus KV streamed). Limit: 4 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Hardware slug, e.g. 'nvidia-h100-sxm', 'apple-mac-studio-m3-ultra', 'nvidia-rtx-5090'." },
      },
      required: ["slug"],
    },
  },
  {
    name: "search",
    description:
      "Full-text search across grants, funders, projects, readings, layer overviews, and models. Use as a fallback when no structured filter fits. Returns up to 10 hits with kind, title, url. Limit: 2 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
      },
      required: ["query"],
    },
  },
] as const;

// ----------------------------------------------------------------------
// ToolBudget: per-turn rate limits + dedup cache
// ----------------------------------------------------------------------

const LIMITS: Record<string, number> = {
  find_grants: 3,
  find_funders: 2,
  find_projects: 3,
  find_readings: 3,
  find_glossary: 3,
  find_models: 3,
  read_layer: 3,
  read_funder: 3,
  read_grant: 3,
  read_project: 4,
  read_glossary: 4,
  read_model: 4,
  compare_models: 2,
  find_hardware: 3,
  read_hardware: 4,
  today_news: 1,
  search: 2,
};

export class ToolBudget {
  private counts = new Map<string, number>();
  private cache = new Map<string, unknown>();

  reset(): void {
    this.counts.clear();
    this.cache.clear();
  }

  canCall(name: string): boolean {
    const used = this.counts.get(name) ?? 0;
    const limit = LIMITS[name] ?? Number.POSITIVE_INFINITY;
    return used < limit;
  }

  recordCall(name: string): void {
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
  }

  cacheGet(name: string, args: unknown): unknown | undefined {
    return this.cache.get(this.cacheKey(name, args));
  }

  cacheSet(name: string, args: unknown, result: unknown): void {
    this.cache.set(this.cacheKey(name, args), result);
  }

  private cacheKey(name: string, args: unknown): string {
    return name + ":" + JSON.stringify(args);
  }
}

// ----------------------------------------------------------------------
// Tool execution
// ----------------------------------------------------------------------

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolEventStart {
  kind: "start";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface ToolEventDone {
  kind: "done";
  id: string;
  name: string;
  input: Record<string, unknown>;
  result: unknown;
  cached?: boolean;
}
export type ToolEvent = ToolEventStart | ToolEventDone;

function amountBucket(n: number | undefined | null): string {
  if (!n || n <= 0) return "undisclosed";
  if (n < 100_000) return "<100K";
  if (n < 1_000_000) return "100K-1M";
  if (n < 10_000_000) return "1M-10M";
  return ">10M";
}

function recencyBucket(date: string, today = new Date()): string {
  const parts = String(date).split("-");
  const y = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) - 1 : 0;
  const d = parts[2] ? parseInt(parts[2], 10) : 1;
  const grant = new Date(y, m, d);
  if (isNaN(grant.getTime())) return "older";
  const diffDays =
    (today.getTime() - grant.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 30) return "30d";
  if (diffDays <= 90) return "90d";
  if (diffDays <= 365) return "1y";
  return "older";
}

function fuzzyMatch(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export async function executeTool(
  call: ToolCall,
  budget: ToolBudget,
): Promise<unknown> {
  const cached = budget.cacheGet(call.name, call.input);
  if (cached !== undefined) {
    return { ...(cached as object), _cached: true };
  }
  if (!budget.canCall(call.name)) {
    return {
      error: `Tool '${call.name}' is rate-limited for this turn. Pick a different tool or work with what you already have.`,
    };
  }
  budget.recordCall(call.name);

  let result: unknown;
  try {
    switch (call.name) {
      case "find_grants": {
        const args = call.input as {
          kind?: string;
          funder?: string;
          layer?: string;
          region?: string;
          amount_bucket?: string;
          recency?: string;
          query?: string;
        };
        const grants = await getGrants();
        let hits = grants.filter((g) => {
          if (args.kind && g.kind !== args.kind) return false;
          if (args.funder && g.funder !== args.funder) return false;
          if (args.layer && !g.layers.includes(args.layer)) return false;
          if (args.region && g.region !== args.region) return false;
          if (args.amount_bucket && amountBucket(g.amount_usd) !== args.amount_bucket)
            return false;
          if (args.recency && recencyBucket(g.date) !== args.recency)
            return false;
          if (args.query) {
            const blob = `${g.title} ${g.recipient} ${g.description}`;
            if (!fuzzyMatch(blob, args.query)) return false;
          }
          return true;
        });
        // Newest first.
        hits.sort((a, b) => String(b.date).localeCompare(String(a.date)));
        result = { count: hits.length, grants: hits.slice(0, 12) };
        break;
      }

      case "find_funders": {
        const args = call.input as {
          region?: string;
          type?: string;
          focus_layer?: string;
          query?: string;
        };
        const funders = await getFunders();
        let hits = funders.filter((f) => {
          if (args.region && f.region !== args.region) return false;
          if (args.type && f.type !== args.type) return false;
          if (args.focus_layer && !f.focus_layers.includes(args.focus_layer))
            return false;
          if (args.query) {
            const blob = `${f.name} ${f.mission} ${f.notable_recent}`;
            if (!fuzzyMatch(blob, args.query)) return false;
          }
          return true;
        });
        result = { count: hits.length, funders: hits.slice(0, 12) };
        break;
      }

      case "find_projects": {
        const args = call.input as {
          layer?: string;
          focus?: string;
          maturity?: string;
          query?: string;
        };
        const projects = await getProjects();
        let hits = projects.filter((p) => {
          if (args.layer && !p.layers.includes(args.layer)) return false;
          if (args.focus && p.focus !== args.focus) return false;
          if (args.maturity && p.maturity !== args.maturity) return false;
          if (args.query) {
            const blob = `${p.name} ${p.description}`;
            if (!fuzzyMatch(blob, args.query)) return false;
          }
          return true;
        });
        result = { count: hits.length, projects: hits.slice(0, 12) };
        break;
      }

      case "find_readings": {
        const args = call.input as {
          layer?: string;
          type?: string;
          year_min?: number;
          query?: string;
        };
        const readings = await getReadings();
        let hits = readings.filter((r) => {
          if (args.layer && !r.layers.includes(args.layer)) return false;
          if (args.type && r.type !== args.type) return false;
          if (typeof args.year_min === "number" && r.year < args.year_min)
            return false;
          if (args.query) {
            const blob = `${r.title} ${r.source} ${r.description}`;
            if (!fuzzyMatch(blob, args.query)) return false;
          }
          return true;
        });
        hits.sort((a, b) => b.year - a.year);
        result = { count: hits.length, readings: hits.slice(0, 12) };
        break;
      }

      case "read_layer": {
        const slug = String(call.input.slug ?? "").trim();
        const [layers, content] = await Promise.all([
          getLayers(),
          getLayerContent(),
        ]);
        const meta = layers.find((l) => l.slug === slug);
        const intro = content.find((l) => l.slug === slug);
        if (!meta) {
          result = {
            error: `No layer with slug '${slug}'.`,
            available: layers.map((l) => l.slug),
          };
        } else {
          result = { ...meta, body: intro?.body ?? "" };
        }
        break;
      }

      case "read_funder": {
        const slug = String(call.input.slug ?? "").trim();
        const [funders, grants] = await Promise.all([
          getFunders(),
          getGrants(),
        ]);
        const f = funders.find((x) => x.slug === slug);
        if (!f) {
          result = {
            error: `No funder with slug '${slug}'.`,
            available: funders.map((x) => x.slug),
          };
        } else {
          const attributed = grants.filter((g) => g.funder === slug);
          attributed.sort((a, b) => String(b.date).localeCompare(String(a.date)));
          result = { ...f, grants: attributed };
        }
        break;
      }

      case "read_project": {
        const slug = String(call.input.slug ?? "").trim();
        const projects = await getProjects();
        const p = projects.find((x) => x.slug === slug);
        if (!p) {
          // Suggest near matches.
          const close = projects
            .filter((x) =>
              x.slug.includes(slug.toLowerCase()) ||
              x.name.toLowerCase().includes(slug.toLowerCase()),
            )
            .slice(0, 5)
            .map((x) => `${x.slug} (${x.name})`);
          result = {
            error: `No project with slug '${slug}'.`,
            suggestions: close,
          };
        } else {
          const primaryLayer = p.layers[0];
          const siblings = projects
            .filter((x) => x.slug !== p.slug && x.layers.includes(primaryLayer))
            .map((x) => ({
              slug: x.slug,
              name: x.name,
              focus: x.focus,
              maturity: x.maturity,
              description: x.description,
            }));
          result = {
            ...p,
            primary_layer: primaryLayer,
            siblings_at_primary_layer: siblings,
          };
        }
        break;
      }

      case "read_grant": {
        const title = String(call.input.title ?? "").trim();
        const grants = await getGrants();
        const g = grants.find((x) => x.title === title);
        if (!g) {
          // Suggest near matches.
          const close = grants
            .filter((x) =>
              x.title.toLowerCase().includes(title.toLowerCase().slice(0, 12)),
            )
            .slice(0, 5)
            .map((x) => x.title);
          result = {
            error: `No grant titled '${title}'.`,
            suggestions: close,
          };
        } else {
          result = g;
        }
        break;
      }

      case "today_news": {
        const news = await getTodayNews();
        if (!news) {
          result = { error: "No news issues published yet." };
        } else {
          result = news;
        }
        break;
      }

      case "find_glossary": {
        const args = call.input as { layer?: string; query?: string };
        const glossary = await getGlossary();
        const hits = glossary.filter((g) => {
          if (args.layer) {
            const inPrimary = g.primary_layer === args.layer;
            const inSecondary = (g.secondary_layers ?? []).includes(args.layer);
            if (!inPrimary && !inSecondary) return false;
          }
          if (args.query) {
            const blob = `${g.term} ${(g.aliases ?? []).join(" ")} ${g.summary}`;
            if (!fuzzyMatch(blob, args.query)) return false;
          }
          return true;
        });
        hits.sort((a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase()));
        result = {
          count: hits.length,
          glossary: hits.slice(0, 12).map((g) => ({
            slug: g.slug,
            term: g.term,
            aliases: g.aliases,
            primary_layer: g.primary_layer,
            secondary_layers: g.secondary_layers,
            summary: g.summary,
          })),
        };
        break;
      }

      case "read_glossary": {
        const raw = String(call.input.slug ?? "").trim();
        const want = raw.toLowerCase().replace(/\s+/g, "-");
        const glossary = await getGlossary();
        const g = glossary.find((entry) => {
          if (entry.slug === want) return true;
          if (entry.term.toLowerCase() === raw.toLowerCase()) return true;
          return (entry.aliases ?? []).some(
            (a) => a.toLowerCase().replace(/\s+/g, "-") === want,
          );
        });
        if (!g) {
          const close = glossary
            .filter((entry) =>
              entry.slug.includes(want) ||
              entry.term.toLowerCase().includes(raw.toLowerCase()),
            )
            .slice(0, 5)
            .map((entry) => `${entry.slug} (${entry.term})`);
          result = {
            error: `No glossary entry for '${raw}'.`,
            suggestions: close,
          };
        } else {
          result = g;
        }
        break;
      }

      case "find_models": {
        const args = call.input as {
          family?: string;
          developer?: string;
          openness?: string;
          architecture?: string;
          type?: string;
          year?: number;
          query?: string;
        };
        const models = await getModels();
        const hits = models.filter((m) => {
          if (args.family && m.family !== args.family) return false;
          if (args.developer && m.developer !== args.developer) return false;
          if (args.openness && m.openness !== args.openness) return false;
          if (args.architecture && m.architecture !== args.architecture) return false;
          if (args.type && m.type !== args.type) return false;
          if (args.year) {
            const year = parseInt(String(m.released_date).slice(0, 4), 10);
            if (year !== args.year) return false;
          }
          if (args.query) {
            const blob = `${m.display_name} ${m.family} ${m.developer} ${m.release_context ?? ""} ${(m.notable_innovations ?? []).join(" ")}`;
            if (!fuzzyMatch(blob, args.query)) return false;
          }
          return true;
        });
        // Most recent first.
        hits.sort((a, b) => (b.released_date ?? "").localeCompare(a.released_date ?? ""));
        result = {
          count: hits.length,
          models: hits.slice(0, 12).map((m) => ({
            slug: m.slug,
            display_name: m.display_name,
            family: m.family,
            developer: m.developer,
            released_date: m.released_date,
            openness: m.openness,
            license: m.license,
            architecture: m.architecture,
            params_total: m.params_total,
            params_active: m.params_active,
            context_window: m.context_window,
            attention_variant: m.attention_variant,
            benchmarks: m.benchmarks,
          })),
        };
        break;
      }

      case "compare_models": {
        const slugs = Array.isArray(call.input.slugs) ? (call.input.slugs as string[]) : [];
        if (slugs.length < 2 || slugs.length > 4) {
          result = { error: "compare_models requires 2 to 4 slugs." };
          break;
        }
        const models = await getModels();
        const compared = slugs.map((s) => {
          const m = models.find((x) => x.slug === s);
          if (!m) return { slug: s, error: `unknown slug` };
          return {
            slug: m.slug,
            display_name: m.display_name,
            family: m.family,
            developer: m.developer,
            released_date: m.released_date,
            openness: m.openness,
            license: m.license,
            architecture: m.architecture,
            params_total: m.params_total,
            params_active: m.params_active,
            experts: m.experts,
            experts_active: m.experts_active,
            context_window: m.context_window,
            attention_variant: m.attention_variant,
            cost: m.cost,
            speed: m.speed,
            benchmarks: m.benchmarks,
            recommended_use_cases: m.recommended_use_cases,
            release_context: m.release_context,
            lineage: m.lineage,
          };
        });
        result = { models: compared };
        break;
      }

      case "read_model": {
        const slug = String(call.input.slug ?? "").trim();
        const models = await getModels();
        const m = models.find((x) => x.slug === slug);
        if (!m) {
          const close = models
            .filter((x) =>
              x.slug.includes(slug.toLowerCase()) ||
              x.display_name.toLowerCase().includes(slug.toLowerCase()),
            )
            .slice(0, 5)
            .map((x) => `${x.slug} (${x.display_name})`);
          result = {
            error: `No model with slug '${slug}'.`,
            suggestions: close,
          };
        } else {
          const siblings = models
            .filter((x) => x.slug !== m.slug && x.family === m.family)
            .map((x) => ({
              slug: x.slug,
              display_name: x.display_name,
              released_date: x.released_date,
              openness: x.openness,
            }));
          result = { ...m, siblings };
        }
        break;
      }

      case "find_hardware": {
        const args = call.input as {
          class?: string;
          vendor?: string;
          min_memory_gb?: number;
          query?: string;
        };
        const hardware = await getHardware();
        const hits = hardware.filter((h) => {
          if (args.class && h.class !== args.class) return false;
          if (args.vendor && !fuzzyMatch(h.vendor, args.vendor)) return false;
          if (args.min_memory_gb && h.memory_capacity_gb < args.min_memory_gb) return false;
          if (args.query) {
            const blob = `${h.name} ${h.vendor} ${h.notes ?? ""}`;
            if (!fuzzyMatch(blob, args.query)) return false;
          }
          return true;
        });
        hits.sort((a, b) => b.memory_bandwidth_gbs - a.memory_bandwidth_gbs);
        result = {
          count: hits.length,
          hardware: hits.map((h) => ({
            slug: h.slug,
            name: h.name,
            vendor: h.vendor,
            class: h.class,
            memory_capacity_gb: h.memory_capacity_gb,
            memory_type: h.memory_type,
            memory_bandwidth_gbs: h.memory_bandwidth_gbs,
            compute: h.compute,
            power_w: h.power_w,
            multi_unit_default: h.multi_unit_default,
            release_date: h.release_date,
          })),
        };
        break;
      }

      case "read_hardware": {
        const slug = String(call.input.slug ?? "").trim();
        const hardware = await getHardware();
        const h = hardware.find((x) => x.slug === slug);
        if (!h) {
          const close = hardware
            .filter((x) => x.slug.includes(slug.toLowerCase()) || x.name.toLowerCase().includes(slug.toLowerCase()))
            .slice(0, 5)
            .map((x) => `${x.slug} (${x.name})`);
          result = { error: `No hardware with slug '${slug}'.`, suggestions: close };
        } else {
          result = h;
        }
        break;
      }

      case "search": {
        const q = String(call.input.query ?? "").trim();
        if (!q) {
          result = { error: "Empty query." };
          break;
        }
        const hits = await searchAll(q, 10);
        result = { query: q, hits };
        break;
      }

      default:
        result = { error: `Unknown tool: ${call.name}` };
    }
  } catch (e) {
    result = { error: e instanceof Error ? e.message : String(e) };
  }

  budget.cacheSet(call.name, call.input, result);
  return result;
}
