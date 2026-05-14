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
  getPredictions,
  getLayers,
  getLayerContent,
  getSynthesis,
  getTodayNews,
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
    name: "read_grant",
    description:
      "Fetch a single grant by exact title. Use when the user asks about a specific named grant. Limit: 3 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Exact grant title." },
      },
      required: ["title"],
    },
  },
  {
    name: "read_predictions",
    description:
      "Fetch the predictions filed at a given layer. Returns claim, horizon, confidence, resolves_when, filed-on date. Use when the user asks 'what are we predicting about X'. Limit: 2 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        layer: { type: "string", description: "Layer slug." },
      },
      required: ["layer"],
    },
  },
  {
    name: "read_essay",
    description:
      "Fetch a full synthesis essay (the load-bearing arguments). Use when the user asks about a concept covered in an essay. Limit: 3 calls per turn.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Essay slug." },
      },
      required: ["slug"],
    },
  },
  {
    name: "today_news",
    description:
      "Fetch today's daily news roundup. Returns date, editorial letter, layer buckets (which layers had items), and the body. Use when user asks about recent news. Limit: 1 call per turn.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search",
    description:
      "Full-text search across grants, funders, projects, readings, layer overviews, and essays. Use as a fallback when no structured filter fits. Returns up to 10 hits with kind, title, url. Limit: 2 calls per turn.",
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
  read_layer: 3,
  read_funder: 3,
  read_grant: 3,
  read_predictions: 2,
  read_essay: 3,
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

      case "read_predictions": {
        const layer = String(call.input.layer ?? "").trim();
        const all = await getPredictions();
        const hits = all.filter((p) => p.layer === layer);
        result = { layer, count: hits.length, predictions: hits };
        break;
      }

      case "read_essay": {
        const slug = String(call.input.slug ?? "").trim();
        const essays = await getSynthesis();
        const e = essays.find((x) => x.slug === slug);
        if (!e) {
          result = {
            error: `No essay with slug '${slug}'.`,
            available: essays.map((x) => x.slug),
          };
        } else {
          result = e;
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
