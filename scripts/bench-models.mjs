#!/usr/bin/env node
/**
 * Model benchmark harness for the in-site chat agent.
 *
 * Tests the 8 candidate models on 15 representative prompts (3 runs
 * each), scores them on the metrics that matter for THIS site's task
 * profile (citation-marker discipline, tool-call validity, voice rules,
 * tool grounding), and writes a markdown report to bench/MODEL_BENCH.md.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... OPENROUTER_API_KEY=sk-or-... \
 *     node scripts/bench-models.mjs [flags]
 *
 * Flags:
 *   --models <slug,slug>   Test only these models (default: all 8)
 *   --prompts <id,id>      Test only these prompts (default: all 15)
 *   --runs <N>             Runs per prompt (default: 3)
 *   --skip-judge           Skip the LLM judge step (deterministic only)
 *   --dry-run              Print the plan + cost estimate, exit
 *   --yes                  Skip the confirm prompt
 *
 * The harness reads the same system prompt + tool definitions the live
 * chat agent uses, and serves the tools from public/data/*.json on disk
 * (no network for tools). What's tested is what users actually run.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "public/data");
const BENCH_DIR = resolve(ROOT, "bench");
const RUNS_DIR = resolve(BENCH_DIR, "runs");

// ---------------------------------------------------------------------------
// CONFIG: candidate models (the 8 we locked)
// ---------------------------------------------------------------------------

const CANDIDATES = [
  {
    slug: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    id: "deepseek/deepseek-v4-pro",
    provider: "openrouter",
    inputPerM: 0.435,
    outputPerM: 0.87,
    isAnthropicFamily: false,
  },
  {
    slug: "sonnet-4-6",
    name: "Claude Sonnet 4.6",
    id: "anthropic/claude-sonnet-4.6",
    provider: "openrouter",
    inputPerM: 3.0,
    outputPerM: 15.0,
    isAnthropicFamily: true,
  },
  {
    slug: "opus-4-7",
    name: "Claude Opus 4.7",
    id: "anthropic/claude-opus-4.7",
    provider: "openrouter",
    inputPerM: 5.0,
    outputPerM: 25.0,
    isAnthropicFamily: true,
  },
  {
    slug: "haiku-4-5",
    name: "Claude Haiku 4.5",
    id: "anthropic/claude-haiku-4.5",
    provider: "openrouter",
    inputPerM: 1.0,
    outputPerM: 5.0,
    isAnthropicFamily: true,
  },
  {
    slug: "gemini-3-1-pro",
    name: "Gemini 3.1 Pro Preview",
    id: "google/gemini-3.1-pro-preview",
    provider: "openrouter",
    inputPerM: 2.0,
    outputPerM: 12.0,
    isAnthropicFamily: false,
  },
  {
    slug: "gpt-5-5",
    name: "GPT-5.5",
    id: "openai/gpt-5.5",
    provider: "openrouter",
    inputPerM: 5.0,
    outputPerM: 30.0,
    isAnthropicFamily: false,
  },
  {
    slug: "kimi-k2-6",
    name: "Kimi K2.6",
    id: "moonshotai/kimi-k2.6",
    provider: "openrouter",
    inputPerM: 0.73,
    outputPerM: 3.49,
    isAnthropicFamily: false,
  },
  {
    slug: "glm-5-1",
    name: "GLM-5.1",
    id: "z-ai/glm-5.1",
    provider: "openrouter",
    inputPerM: 0.98,
    outputPerM: 3.08,
    isAnthropicFamily: false,
  },
];

// Judge config. Opus 4.7 by default; for any Anthropic-family candidate
// we swap to Gemini 3.1 Pro to avoid same-family bias.
const JUDGE_DEFAULT = {
  id: "anthropic/claude-opus-4.7",
  provider: "openrouter",
  inputPerM: 5.0,
  outputPerM: 25.0,
};
const JUDGE_ANTHROPIC_SUBSET = {
  id: "google/gemini-3.1-pro-preview",
  provider: "openrouter",
  inputPerM: 2.0,
  outputPerM: 12.0,
};

// ---------------------------------------------------------------------------
// SYSTEM PROMPT + TOOL DEFINITIONS (inlined from src/lib/chat/*)
// ---------------------------------------------------------------------------

const COMMON_HEADER = `You are the in-site chat agent for open-source-ai.tech, a curated reference on the open AI stack (10 production-pipeline layers + 5 cross-cutting meta-layers, plus projects, grants, funders, readings, and a daily news log).

The 10 core layers from foundation up: infrastructure (data centers, power, cooling, grid; the physical substrate; added May 2026), silicon (chips and ISAs), compute (scheduling and access control plane), data (corpora), training (pretrain and fine-tune tools), weights (model artifacts and licenses), runtime (inference engines), retrieval-memory (RAG, vector DBs, embeddings, agent memory), agents (frameworks and agent products), protocols (MCP, A2A, agentic payments). The 5 meta-layers observe or constrain the pipeline: evaluation, governance, identity-trust, safety-guardrails, sovereignty-decentralization.

You serve a specific reader: someone who used to fund Bitcoin OSS and is now considering open-source AI. Editorial weight goes to sovereignty / individual-rights / cypherpunk-adjacent funders and projects.`;

const GROUNDING_PROTOCOL = `GROUNDING PROTOCOL (non-negotiable):

1. READ ON THIS TURN. Before composing a reply that cites any source, call a tool ON THIS TURN.

2. SYNTHESIZE INLINE, NEVER SEND OUT. Do not tell the user "go read /grants." Synthesize the answer in the reply with citations.

3. EVERY CITATION CARRIES A SLUG. Use these markers verbatim, no variation:
   - (Layer: <slug>)               for layer pages, e.g. (Layer: silicon)
   - (Funder: <slug>)              for funder profiles, e.g. (Funder: hrf)
   - (Grant: <exact-title>)        for grants
   - (Project: <slug>)             for projects, e.g. (Project: vllm)
   - (Reading: <exact-title>)      for readings
   - (News: <YYYY-MM-DD>)          for daily news
   - (Glossary: <slug>)            for glossary terms, e.g. (Glossary: mixture-of-experts)
   A citation without one of these markers is a claim, not a citation.

4. FAILURE MODE: SAY SO. If a tool returns nothing useful or returns an error, tell the user directly: "I cannot find that in the wiki." Never invent.

5. PRE-REPLY SELF-AUDIT. Did I tool-ground every factual claim? Are any em dashes or banned words present?`;

const EDITORIAL_RULES = `EDITORIAL RULES (binding):

- NEVER use em dashes (—) or en dashes (–). Anywhere.
- BANNED WORDS: delve, tapestry, transformative, robust, leveraging, utilize, fascinating, elevate, unlock, paradigm. Avoid vague "ecosystem."
- Voice: neutral observational, Bloomberg-style. Not marketing.`;

const ANSWER_SYSTEM_PROMPT = `${COMMON_HEADER}

YOUR JOB (Answer mode): lead with the direct answer, use tools to ground, cite inline with the markers above. For list questions, return a short list with one-line context. For depth questions, 2-4 paragraphs. For definitions, call read_glossary first (it accepts aliases).

${GROUNDING_PROTOCOL}

${EDITORIAL_RULES}`;

// Tool definitions, matching src/lib/chat/tools.ts exactly. Per-turn
// rate limits are enforced by the executor below.
const TOOLS = [
  {
    name: "find_grants",
    description:
      "Filter the grants catalog by kind, funder, layer, region, amount, recency. kind: 'project' or 'program'. Returns up to 12. Limit: 3 calls/turn.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["project", "program"] },
        funder: { type: "string" },
        layer: { type: "string" },
        region: { type: "string", enum: ["US", "EU", "UK", "Global", "Asia", "Africa", "LatAm"] },
        amount_bucket: { type: "string", enum: [">10M", "1M-10M", "100K-1M", "<100K", "undisclosed"] },
        recency: { type: "string", enum: ["30d", "90d", "1y", "older"] },
        query: { type: "string" },
      },
    },
  },
  {
    name: "find_funders",
    description: "Filter the funders catalog by region, type, focus_layer, free-text. Returns up to 12. Limit: 2 calls/turn.",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string", enum: ["US", "EU", "UK", "Global", "Asia", "Africa", "LatAm"] },
        type: { type: "string", enum: ["government", "foundation", "corporate", "consortium"] },
        focus_layer: { type: "string" },
        query: { type: "string" },
      },
    },
  },
  {
    name: "find_projects",
    description: "Filter projects by layer, focus, maturity. Returns up to 12. Limit: 3 calls/turn.",
    input_schema: {
      type: "object",
      properties: {
        layer: { type: "string" },
        focus: { type: "string", enum: ["open", "open-weights", "source-available", "proprietary", "standard"] },
        maturity: { type: "string", enum: ["stable", "beta", "alpha", "research", "maintenance", "new"] },
        query: { type: "string" },
      },
    },
  },
  {
    name: "find_readings",
    description: "Filter readings by layer, type, year, free-text. Returns up to 12. Limit: 3 calls/turn.",
    input_schema: {
      type: "object",
      properties: {
        layer: { type: "string" },
        type: { type: "string", enum: ["paper", "post", "talk", "podcast", "book", "thread", "docs"] },
        year_min: { type: "number" },
        query: { type: "string" },
      },
    },
  },
  {
    name: "find_glossary",
    description: "Filter the glossary by layer or free-text query against term + summary. Limit: 3 calls/turn.",
    input_schema: {
      type: "object",
      properties: {
        layer: { type: "string" },
        query: { type: "string" },
      },
    },
  },
  {
    name: "read_layer",
    description: "Fetch the full editorial overview for a layer + metadata. Limit: 3 calls/turn.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "read_funder",
    description: "Fetch full profile of one funder + all attributed grants. Limit: 3 calls/turn.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "read_grant",
    description: "Fetch a single grant by exact title. Limit: 3 calls/turn.",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    name: "read_project",
    description: "Fetch full project entry (incl. explainer + sources) + siblings at the same primary layer. Limit: 4 calls/turn.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "read_glossary",
    description: "Fetch a glossary entry by canonical slug or any alias (resolves 'moe' -> mixture-of-experts). Limit: 4 calls/turn.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "today_news",
    description: "Fetch the latest daily news issue. Limit: 1 call/turn.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search",
    description: "Full-text search across everything as fallback. Limit: 2 calls/turn.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

const TOOL_LIMITS = {
  find_grants: 3, find_funders: 2, find_projects: 3, find_readings: 3,
  find_glossary: 3, read_layer: 3, read_funder: 3, read_grant: 3,
  read_project: 4, read_glossary: 4, today_news: 1,
  search: 2,
};

// ---------------------------------------------------------------------------
// NODE-SIDE TOOL EXECUTOR (reads from public/data/*.json on disk)
// ---------------------------------------------------------------------------

let DATA_CACHE = null;
function loadData() {
  if (DATA_CACHE) return DATA_CACHE;
  const read = (name) => {
    const p = resolve(DATA_DIR, name);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8"));
  };
  const layersRoot = read("layers.json") ?? { core: [], meta: [] };
  const layers = [
    ...(layersRoot.core ?? []).map((l) => ({ ...l, tier: "core" })),
    ...(layersRoot.meta ?? []).map((l) => ({ ...l, tier: "meta" })),
  ];
  DATA_CACHE = {
    layers,
    layerContent: read("layer-content.json") ?? [],
    projects: (read("projects.json") ?? { projects: [] }).projects,
    funders: (read("funders.json") ?? { funders: [] }).funders,
    grants: (read("grants.json") ?? { grants: [] }).grants,
    readings: (read("reading-lists.json") ?? { readings: [] }).readings,
    glossary: read("glossary.json") ?? [],
    todayNews: read("today-news.json"),
  };
  return DATA_CACHE;
}

function fuzzy(a, b) {
  return String(a).toLowerCase().includes(String(b).toLowerCase());
}
function amountBucket(n) {
  if (!n || n <= 0) return "undisclosed";
  if (n < 100_000) return "<100K";
  if (n < 1_000_000) return "100K-1M";
  if (n < 10_000_000) return "1M-10M";
  return ">10M";
}
function recencyBucket(date, today = new Date()) {
  const [y, m, d] = String(date).split("-").map(Number);
  const dt = new Date(y || 0, (m || 1) - 1, d || 1);
  if (isNaN(dt.getTime())) return "older";
  const days = (today.getTime() - dt.getTime()) / 86400000;
  if (days <= 30) return "30d";
  if (days <= 90) return "90d";
  if (days <= 365) return "1y";
  return "older";
}

// Per-turn budget + cache (mirrors the browser-side ToolBudget).
class ToolBudget {
  constructor() {
    this.counts = new Map();
    this.cache = new Map();
  }
  canCall(name) {
    return (this.counts.get(name) ?? 0) < (TOOL_LIMITS[name] ?? Infinity);
  }
  recordCall(name) {
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
  }
  cacheGet(name, args) {
    return this.cache.get(name + ":" + JSON.stringify(args));
  }
  cacheSet(name, args, result) {
    this.cache.set(name + ":" + JSON.stringify(args), result);
  }
}

function executeTool(name, args, budget) {
  const cached = budget.cacheGet(name, args);
  if (cached !== undefined) return { ...cached, _cached: true };
  if (!budget.canCall(name)) {
    return { error: `Tool '${name}' is rate-limited for this turn.` };
  }
  budget.recordCall(name);

  const data = loadData();
  let result;
  const today = new Date();

  switch (name) {
    case "find_grants": {
      let hits = data.grants.filter((g) => {
        if (args.kind && g.kind !== args.kind) return false;
        if (args.funder && g.funder !== args.funder) return false;
        if (args.layer && !(g.layers || []).includes(args.layer)) return false;
        if (args.region && g.region !== args.region) return false;
        if (args.amount_bucket && amountBucket(g.amount_usd) !== args.amount_bucket) return false;
        if (args.recency && recencyBucket(g.date, today) !== args.recency) return false;
        if (args.query) {
          const blob = `${g.title} ${g.recipient} ${g.description}`;
          if (!fuzzy(blob, args.query)) return false;
        }
        return true;
      });
      hits.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      result = { count: hits.length, grants: hits.slice(0, 12) };
      break;
    }
    case "find_funders": {
      const hits = data.funders.filter((f) => {
        if (args.region && f.region !== args.region) return false;
        if (args.type && f.type !== args.type) return false;
        if (args.focus_layer && !(f.focus_layers || []).includes(args.focus_layer)) return false;
        if (args.query) {
          const blob = `${f.name} ${f.mission} ${f.notable_recent}`;
          if (!fuzzy(blob, args.query)) return false;
        }
        return true;
      });
      result = { count: hits.length, funders: hits.slice(0, 12) };
      break;
    }
    case "find_projects": {
      const hits = data.projects.filter((p) => {
        if (args.layer && !(p.layers || []).includes(args.layer)) return false;
        if (args.focus && p.focus !== args.focus) return false;
        if (args.maturity && p.maturity !== args.maturity) return false;
        if (args.query) {
          const blob = `${p.name} ${p.description}`;
          if (!fuzzy(blob, args.query)) return false;
        }
        return true;
      });
      result = { count: hits.length, projects: hits.slice(0, 12) };
      break;
    }
    case "find_readings": {
      const hits = data.readings.filter((r) => {
        if (args.layer && !(r.layers || []).includes(args.layer)) return false;
        if (args.type && r.type !== args.type) return false;
        if (typeof args.year_min === "number" && r.year < args.year_min) return false;
        if (args.query) {
          const blob = `${r.title} ${r.source} ${r.description}`;
          if (!fuzzy(blob, args.query)) return false;
        }
        return true;
      });
      hits.sort((a, b) => b.year - a.year);
      result = { count: hits.length, readings: hits.slice(0, 12) };
      break;
    }
    case "find_glossary": {
      const hits = data.glossary.filter((g) => {
        if (args.layer) {
          const inPrimary = g.primary_layer === args.layer;
          const inSecondary = (g.secondary_layers || []).includes(args.layer);
          if (!inPrimary && !inSecondary) return false;
        }
        if (args.query) {
          const blob = `${g.term} ${(g.aliases || []).join(" ")} ${g.summary}`;
          if (!fuzzy(blob, args.query)) return false;
        }
        return true;
      });
      hits.sort((a, b) => String(a.term).toLowerCase().localeCompare(String(b.term).toLowerCase()));
      result = {
        count: hits.length,
        glossary: hits.slice(0, 12).map((g) => ({
          slug: g.slug, term: g.term, aliases: g.aliases,
          primary_layer: g.primary_layer, secondary_layers: g.secondary_layers, summary: g.summary,
        })),
      };
      break;
    }
    case "read_layer": {
      const slug = String(args.slug ?? "").trim();
      const meta = data.layers.find((l) => l.slug === slug);
      const intro = data.layerContent.find((l) => l.slug === slug);
      result = meta
        ? { ...meta, body: intro?.body ?? "" }
        : { error: `No layer with slug '${slug}'.`, available: data.layers.map((l) => l.slug) };
      break;
    }
    case "read_funder": {
      const slug = String(args.slug ?? "").trim();
      const f = data.funders.find((x) => x.slug === slug);
      if (!f) {
        result = { error: `No funder with slug '${slug}'.`, available: data.funders.map((x) => x.slug) };
      } else {
        const attributed = data.grants.filter((g) => g.funder === slug);
        result = { ...f, grants: attributed };
      }
      break;
    }
    case "read_grant": {
      const title = String(args.title ?? "").trim();
      const g = data.grants.find((x) => x.title === title);
      result = g ?? {
        error: `No grant titled '${title}'.`,
        suggestions: data.grants
          .filter((x) => x.title.toLowerCase().includes(title.toLowerCase().slice(0, 12)))
          .slice(0, 5).map((x) => x.title),
      };
      break;
    }
    case "read_project": {
      const slug = String(args.slug ?? "").trim();
      const p = data.projects.find((x) => x.slug === slug);
      if (!p) {
        result = {
          error: `No project with slug '${slug}'.`,
          suggestions: data.projects
            .filter((x) => x.slug.includes(slug.toLowerCase()))
            .slice(0, 5).map((x) => `${x.slug} (${x.name})`),
        };
      } else {
        const primary = p.layers[0];
        const siblings = data.projects
          .filter((x) => x.slug !== p.slug && x.layers.includes(primary))
          .map((x) => ({
            slug: x.slug, name: x.name, focus: x.focus, maturity: x.maturity, description: x.description,
          }));
        result = { ...p, primary_layer: primary, siblings_at_primary_layer: siblings };
      }
      break;
    }
    case "read_glossary": {
      const raw = String(args.slug ?? "").trim();
      const want = raw.toLowerCase().replace(/\s+/g, "-");
      const g = data.glossary.find((e) => {
        if (e.slug === want) return true;
        if (String(e.term).toLowerCase() === raw.toLowerCase()) return true;
        return (e.aliases || []).some(
          (a) => String(a).toLowerCase().replace(/\s+/g, "-") === want,
        );
      });
      result = g ?? {
        error: `No glossary entry for '${raw}'.`,
        suggestions: data.glossary
          .filter((e) => e.slug.includes(want) || String(e.term).toLowerCase().includes(raw.toLowerCase()))
          .slice(0, 5).map((e) => `${e.slug} (${e.term})`),
      };
      break;
    }
    case "today_news": {
      result = data.todayNews ?? { error: "No news issues published yet." };
      break;
    }
    case "search": {
      // Simple substring fallback. The browser version uses MiniSearch.
      const q = String(args.query ?? "").trim().toLowerCase();
      if (!q) { result = { error: "Empty query." }; break; }
      const hits = [];
      const push = (kind, ref, title) => hits.push({ kind, ref, title });
      for (const p of data.projects) if (fuzzy(`${p.name} ${p.description}`, q)) push("project", p.slug, p.name);
      for (const f of data.funders) if (fuzzy(`${f.name} ${f.mission}`, q)) push("funder", f.slug, f.name);
      for (const g of data.grants) if (fuzzy(`${g.title} ${g.description}`, q)) push("grant", g.title, g.title);
      for (const r of data.readings) if (fuzzy(`${r.title} ${r.description}`, q)) push("reading", r.url, r.title);
      for (const l of data.layers) if (fuzzy(`${l.title} ${l.short_description}`, q)) push("layer", l.slug, l.title);
      for (const e of data.glossary) if (fuzzy(`${e.term} ${e.summary}`, q)) push("glossary", e.slug, e.term);
      result = { query: q, hits: hits.slice(0, 10) };
      break;
    }
    default:
      result = { error: `Unknown tool: ${name}` };
  }

  budget.cacheSet(name, args, result);
  return result;
}

// ---------------------------------------------------------------------------
// AGENT LOOP (one turn = user prompt -> assistant final text)
// ---------------------------------------------------------------------------

function buildContextBlock(pageContext) {
  if (!pageContext) return "CURRENT PAGE CONTEXT:\nThe user is currently on: /";
  const lines = ["CURRENT PAGE CONTEXT:", `The user is currently on: ${pageContext.pathname ?? "/"}`];
  if (pageContext.entity) {
    const e = pageContext.entity;
    if (e.kind === "layer") lines.push(`They are looking at the layer page for '${e.slug}'.`);
    else if (e.kind === "funder") lines.push(`They are looking at the funder profile for '${e.slug}'.`);
    else if (e.kind === "project") lines.push(`They are looking at the project page for '${e.slug}'. Use read_project to ground references.`);
    else if (e.kind === "glossary") lines.push(`They are looking at the glossary entry for '${e.slug}'. Use read_glossary to ground references.`);
    else if (e.kind === "news") lines.push(`They are reading the news issue dated ${e.date}.`);
  }
  return lines.join("\n");
}

function makeClient(provider, apiKey) {
  if (provider === "anthropic") {
    return new Anthropic({ apiKey });
  }
  return new Anthropic({
    apiKey,
    baseURL: "https://openrouter.ai/api",
    defaultHeaders: {
      "HTTP-Referer": "https://open-source-ai.tech",
      "X-Title": "open-source-ai-stack-bench",
    },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers ?? {});
      headers.delete("anthropic-version");
      headers.delete("anthropic-dangerous-direct-browser-access");
      return fetch(input, { ...init, headers });
    },
  });
}

const MAX_TOOL_TURNS = 8;
const MAX_TOKENS_PER_TURN = 1800;

async function runTurn({ candidate, prompt, apiKey }) {
  const client = makeClient(candidate.provider, apiKey);
  const system = ANSWER_SYSTEM_PROMPT + "\n\n" + buildContextBlock(prompt.page_context);
  const messages = [{ role: "user", content: prompt.text }];
  const toolEvents = [];
  const budget = new ToolBudget();
  let inputTokens = 0;
  let outputTokens = 0;
  let assistantText = "";
  let stopReason = "unknown";
  let error = null;
  const started = Date.now();

  try {
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const resp = await client.messages.create({
        model: candidate.id,
        system,
        messages,
        tools: TOOLS,
        max_tokens: MAX_TOKENS_PER_TURN,
      });
      inputTokens += resp.usage?.input_tokens ?? 0;
      outputTokens += resp.usage?.output_tokens ?? 0;
      stopReason = resp.stop_reason ?? "unknown";

      // Collect assistant content blocks.
      const assistantBlocks = resp.content ?? [];
      messages.push({ role: "assistant", content: assistantBlocks });

      const textBlocks = assistantBlocks.filter((b) => b.type === "text");
      const toolUseBlocks = assistantBlocks.filter((b) => b.type === "tool_use");

      // Accumulate the assistant text (only the last turn's text matters
      // as the final answer, but we keep all for inspection).
      assistantText = textBlocks.map((b) => b.text).join("\n").trim();

      if (toolUseBlocks.length === 0) break;

      const toolResults = [];
      for (const block of toolUseBlocks) {
        const ev = {
          id: block.id, name: block.name, input: block.input, done: false,
        };
        toolEvents.push(ev);
        let result;
        try {
          result = executeTool(block.name, block.input ?? {}, budget);
        } catch (e) {
          result = { error: e?.message ?? String(e) };
        }
        ev.done = true;
        ev.result = result;
        ev.cached = !!result?._cached;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result).slice(0, 32000),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }
  } catch (e) {
    error = e?.message ?? String(e);
  }

  return {
    assistantText,
    toolEvents,
    inputTokens,
    outputTokens,
    stopReason,
    error,
    latencyMs: Date.now() - started,
    messages: messages.slice(0, 50), // cap so file size stays sane
  };
}

// ---------------------------------------------------------------------------
// SCORERS (deterministic, regex-based)
// ---------------------------------------------------------------------------

const MARKER_RE = /\((Layer|Funder|Grant|Project|Reading|News|Glossary):\s*([^)]+)\)/g;
const BANNED_WORDS = [
  "delve", "tapestry", "transformative", "robust", "leveraging",
  "utilize", "fascinating", "elevate", "unlock", "paradigm",
];

function scoreMarkers(text, validRefs) {
  const matches = [...text.matchAll(MARKER_RE)];
  const total = matches.length;
  let validRef = 0;
  const byKind = {};
  for (const m of matches) {
    const kind = m[1];
    const ref = m[2].trim();
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    let ok = false;
    switch (kind) {
      case "Layer": ok = validRefs.layerSlugs.has(ref); break;
      case "Funder": ok = validRefs.funderSlugs.has(ref); break;
      case "Project": ok = validRefs.projectSlugs.has(ref); break;
      case "Glossary": ok = validRefs.glossarySlugs.has(ref); break;
      case "Grant": ok = validRefs.grantTitles.has(ref); break;
      case "Reading": ok = validRefs.readingTitles.has(ref); break;
      case "News": ok = /^\d{4}-\d{2}-\d{2}$/.test(ref); break;
    }
    if (ok) validRef++;
  }
  return { total, validRef, byKind };
}

function scoreToolCalls(toolEvents) {
  const knownTools = new Set(TOOLS.map((t) => t.name));
  let total = toolEvents.length;
  let knownName = 0;
  let validArgs = 0;
  for (const ev of toolEvents) {
    if (knownTools.has(ev.name)) {
      knownName++;
      // Check required args present.
      const def = TOOLS.find((t) => t.name === ev.name);
      const required = def?.input_schema?.required ?? [];
      const argsOk = required.every((k) => ev.input && ev.input[k] != null);
      if (argsOk) validArgs++;
    }
  }
  return { total, knownName, validArgs };
}

function scoreVoice(text) {
  const emDashes = (text.match(/[—–]/g) || []).length;
  const banned = [];
  for (const w of BANNED_WORDS) {
    const re = new RegExp(`\\b${w}\\b`, "gi");
    const hits = [...text.matchAll(re)];
    if (hits.length) banned.push({ word: w, count: hits.length });
  }
  return {
    emDashes,
    bannedHits: banned,
    pass: emDashes === 0 && banned.length === 0,
  };
}

function scoreGrounding(text, toolEvents) {
  // Crude proxy: extract numeric claims from text; check whether each
  // appears in the JSON-serialized tool results from this turn. Avoids
  // requiring an LLM judge for grounding by accepting any digit
  // sequence overlap as "grounded." False positives possible; gives
  // direction-of-travel, not precision.
  const numberish = [...text.matchAll(/\$?[\d]{1,3}(,\d{3})+|\$?[\d]+(\.\d+)?(?:[KMB])?/g)].map((m) => m[0]);
  if (numberish.length === 0) return { numericClaims: 0, grounded: 0 };
  const corpus = toolEvents.map((e) => JSON.stringify(e.result || {})).join(" ");
  let grounded = 0;
  for (const n of numberish) {
    const stripped = n.replace(/[$,]/g, "").replace(/[KMB]$/i, "");
    if (corpus.includes(stripped) || corpus.includes(n)) grounded++;
  }
  return { numericClaims: numberish.length, grounded };
}

// Aggregate all deterministic scores for one (model, prompt, run).
function scoreRun({ run, prompt, validRefs }) {
  const markers = scoreMarkers(run.assistantText, validRefs);
  const tools = scoreToolCalls(run.toolEvents);
  const voice = scoreVoice(run.assistantText);
  const grounding = scoreGrounding(run.assistantText, run.toolEvents);
  const meetsMinMarkers = markers.total >= (prompt.min_markers ?? 0);
  const hitExpectedTools =
    !prompt.expected_tools?.length ||
    prompt.expected_tools.some((t) => run.toolEvents.some((e) => e.name === t));
  const hitExpectedKinds =
    !prompt.expected_marker_kinds?.length ||
    prompt.expected_marker_kinds.every((k) => (markers.byKind[k] ?? 0) > 0);
  return {
    markers, tools, voice, grounding,
    meetsMinMarkers, hitExpectedTools, hitExpectedKinds,
  };
}

// ---------------------------------------------------------------------------
// JUDGE (LLM scoring of synthesis quality, 1-5)
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM = `You are an evaluation judge for an AI chat agent on an open-source-AI reference site. Score the model's response on a 1-5 scale per the rubric provided. Output JSON only: {"score": <1-5>, "rationale": "<one sentence>"}. Score 5 only if the response is excellent. Score 1 if it's wrong or absent.`;

async function judgeRun({ prompt, run, judgeConfig, apiKey }) {
  if (!run.assistantText) return { score: 1, rationale: "no assistant text" };
  const client = makeClient(judgeConfig.provider, apiKey);
  const judgePrompt = `USER PROMPT TO AGENT:
${prompt.text}

RUBRIC:
${prompt.judge_rubric}

AGENT'S RESPONSE:
${run.assistantText.slice(0, 6000)}

Return JSON only.`;
  try {
    const resp = await client.messages.create({
      model: judgeConfig.id,
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: judgePrompt }],
      max_tokens: 200,
    });
    const text = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const m = text.match(/\{[\s\S]*?\}/);
    if (!m) return { score: null, rationale: `judge returned no JSON: ${text.slice(0, 80)}` };
    const parsed = JSON.parse(m[0]);
    return {
      score: typeof parsed.score === "number" ? parsed.score : null,
      rationale: parsed.rationale ?? "",
      tokensIn: resp.usage?.input_tokens ?? 0,
      tokensOut: resp.usage?.output_tokens ?? 0,
    };
  } catch (e) {
    return { score: null, rationale: `judge error: ${e?.message ?? e}` };
  }
}

// ---------------------------------------------------------------------------
// CLI FLAG PARSING
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const out = { models: null, prompts: null, runs: 3, skipJudge: false, dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--models") out.models = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--prompts") out.prompts = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--runs") out.runs = parseInt(argv[++i], 10);
    else if (a === "--skip-judge") out.skipJudge = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--help" || a === "-h") {
      console.log("Usage: node scripts/bench-models.mjs [--models a,b] [--prompts id,id] [--runs N] [--skip-judge] [--dry-run] [--yes]");
      process.exit(0);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// COST ESTIMATE (per-turn budget assumption: 8K in, 1.5K out; judge: 2K in, 0.2K out)
// ---------------------------------------------------------------------------

function estimateCost({ candidates, promptCount, runs, skipJudge }) {
  const turnIn = 8000, turnOut = 1500;
  const judgeIn = 2000, judgeOut = 200;
  let totalModelCost = 0;
  let totalJudgeCost = 0;
  for (const c of candidates) {
    const turns = promptCount * runs;
    totalModelCost += turns * ((c.inputPerM * turnIn + c.outputPerM * turnOut) / 1_000_000);
    if (!skipJudge) {
      const j = c.isAnthropicFamily ? JUDGE_ANTHROPIC_SUBSET : JUDGE_DEFAULT;
      totalJudgeCost += turns * ((j.inputPerM * judgeIn + j.outputPerM * judgeOut) / 1_000_000);
    }
  }
  return { modelCost: totalModelCost, judgeCost: totalJudgeCost, total: totalModelCost + totalJudgeCost };
}

// ---------------------------------------------------------------------------
// REPORT WRITER
// ---------------------------------------------------------------------------

function fmt(n, p = 2) { return Number(n).toFixed(p); }
function pct(num, denom) { return denom === 0 ? "n/a" : `${fmt((num / denom) * 100, 0)}%`; }

function writeReport({ results, started, ended }) {
  mkdirSync(BENCH_DIR, { recursive: true });
  mkdirSync(RUNS_DIR, { recursive: true });

  // Per-model aggregate.
  const perModel = new Map();
  for (const r of results) {
    const m = r.candidate.slug;
    if (!perModel.has(m)) {
      perModel.set(m, {
        candidate: r.candidate, runs: [],
      });
    }
    perModel.get(m).runs.push(r);
  }

  let md = `# Model benchmark results\n\n`;
  md += `Run: ${new Date(started).toISOString()} → ${new Date(ended).toISOString()} (${Math.round((ended - started) / 1000)}s wall-clock).\n\n`;
  md += `Tested ${perModel.size} models × ${[...new Set(results.map((r) => r.prompt.id))].length} prompts × ${results.length / perModel.size / [...new Set(results.map((r) => r.prompt.id))].length} runs each = ${results.length} total turns.\n\n`;
  md += `Scoring: deterministic checks (marker discipline, tool validity, voice rules, grounding proxy) + LLM judge (1-5 synthesis quality, cross-family).\n\n`;

  md += `## Summary table\n\n`;
  md += `| Model | Marker valid | Marker hit min | Tool name valid | Voice pass | Synth (1-5) | $/turn | p50 latency |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;
  for (const [, agg] of perModel) {
    const N = agg.runs.length;
    const markerValid = agg.runs.reduce((s, r) => s + (r.scores?.markers.total ? r.scores.markers.validRef / r.scores.markers.total : 1), 0) / N;
    const markerHitMin = agg.runs.filter((r) => r.scores?.meetsMinMarkers).length / N;
    const toolKnown = agg.runs.reduce((s, r) => {
      const t = r.scores?.tools;
      return s + (t && t.total ? t.knownName / t.total : 1);
    }, 0) / N;
    const voicePass = agg.runs.filter((r) => r.scores?.voice.pass).length / N;
    const judgeScores = agg.runs.map((r) => r.judge?.score).filter((s) => typeof s === "number");
    const synth = judgeScores.length ? judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length : null;
    const cost = agg.runs.reduce((s, r) => s + ((agg.candidate.inputPerM * (r.inputTokens ?? 0) + agg.candidate.outputPerM * (r.outputTokens ?? 0)) / 1_000_000), 0) / N;
    const latencies = agg.runs.map((r) => r.latencyMs ?? 0).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;
    md += `| **${agg.candidate.name}** | ${fmt(markerValid * 100, 0)}% | ${fmt(markerHitMin * 100, 0)}% | ${fmt(toolKnown * 100, 0)}% | ${fmt(voicePass * 100, 0)}% | ${synth == null ? "n/a" : fmt(synth, 1)} | $${fmt(cost, 4)} | ${(p50 / 1000).toFixed(1)}s |\n`;
  }

  md += `\n## Per-prompt breakdown\n\n`;
  const prompts = [...new Set(results.map((r) => r.prompt.id))];
  for (const promptId of prompts) {
    const prompt = results.find((r) => r.prompt.id === promptId).prompt;
    md += `### ${promptId} — "${prompt.text}"\n\n`;
    md += `Rubric: ${prompt.judge_rubric}\n\n`;
    md += `| Model | Markers (valid/total) | Tools called | Voice | Synth | Cost |\n`;
    md += `|---|---|---|---|---|---|\n`;
    for (const [, agg] of perModel) {
      const runs = agg.runs.filter((r) => r.prompt.id === promptId);
      if (!runs.length) continue;
      const sample = runs[0];
      const markers = sample.scores?.markers;
      const tools = sample.toolEvents.map((e) => e.name).join(", ") || "—";
      const voice = sample.scores?.voice.pass ? "✓" : (`✗ (${sample.scores?.voice.bannedHits.length} banned, ${sample.scores?.voice.emDashes} em-dash)`);
      const synthAvg = runs.map((r) => r.judge?.score).filter((s) => typeof s === "number");
      const synth = synthAvg.length ? fmt(synthAvg.reduce((a, b) => a + b) / synthAvg.length, 1) : "n/a";
      const cost = (agg.candidate.inputPerM * (sample.inputTokens ?? 0) + agg.candidate.outputPerM * (sample.outputTokens ?? 0)) / 1_000_000;
      md += `| ${agg.candidate.name} | ${markers?.validRef ?? 0}/${markers?.total ?? 0} | ${tools} | ${voice} | ${synth} | $${fmt(cost, 4)} |\n`;
    }
    md += `\n`;
  }

  md += `## Notes\n\n`;
  md += `- "Marker valid" = fraction of citation markers that point to a real slug/title in the data.\n`;
  md += `- "Marker hit min" = fraction of runs where the model emitted at least the prompt's min_markers count.\n`;
  md += `- "Tool name valid" = fraction of tool calls whose name is in the registered tool set (catches hallucinated tools).\n`;
  md += `- "Voice pass" = fraction of runs with zero em dashes and zero banned-word hits.\n`;
  md += `- "Synth" = LLM-judge mean (1-5). Cross-family: Anthropic models judged by Gemini; others judged by Opus 4.7.\n`;
  md += `- "Grounding proxy" available in raw run JSON (bench/runs/) but not summarized here; it's a crude numeric-overlap heuristic, not authoritative.\n\n`;
  md += `Raw run data: \`bench/runs/run-${new Date(started).toISOString().replace(/[:.]/g, "-")}.json\`\n`;

  const reportPath = resolve(BENCH_DIR, "MODEL_BENCH.md");
  writeFileSync(reportPath, md);
  const runPath = resolve(RUNS_DIR, `run-${new Date(started).toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(runPath, JSON.stringify(results, null, 2));
  return { reportPath, runPath };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function confirm(text) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`${text} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(ans.trim());
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  // Filter candidates and prompts.
  const allPrompts = JSON.parse(readFileSync(resolve(__dirname, "bench-prompts.json"), "utf8")).prompts;
  const candidates = flags.models
    ? CANDIDATES.filter((c) => flags.models.includes(c.slug))
    : CANDIDATES;
  const prompts = flags.prompts
    ? allPrompts.filter((p) => flags.prompts.includes(p.id))
    : allPrompts;
  if (!candidates.length) { console.error("No candidates matched --models"); process.exit(1); }
  if (!prompts.length) { console.error("No prompts matched --prompts"); process.exit(1); }

  // Build valid-refs index for marker scoring.
  const data = loadData();
  const validRefs = {
    layerSlugs: new Set(data.layers.map((l) => l.slug)),
    funderSlugs: new Set(data.funders.map((f) => f.slug)),
    projectSlugs: new Set(data.projects.map((p) => p.slug)),
    glossarySlugs: new Set(data.glossary.map((g) => g.slug)),
    grantTitles: new Set(data.grants.map((g) => g.title)),
    readingTitles: new Set(data.readings.map((r) => r.title)),
  };

  // Estimate cost + print plan.
  const est = estimateCost({
    candidates, promptCount: prompts.length, runs: flags.runs, skipJudge: flags.skipJudge,
  });
  const turns = candidates.length * prompts.length * flags.runs;
  console.log(`\nBench plan:`);
  console.log(`  ${candidates.length} models × ${prompts.length} prompts × ${flags.runs} runs = ${turns} model turns`);
  console.log(`  Judge: ${flags.skipJudge ? "skipped" : "Opus 4.7 (Gemini 3.1 Pro for Anthropic subset)"}`);
  console.log(`  Estimated cost: $${fmt(est.total, 2)} (model: $${fmt(est.modelCost, 2)}, judge: $${fmt(est.judgeCost, 2)})`);
  console.log(`  Models: ${candidates.map((c) => c.slug).join(", ")}`);
  console.log(`  Prompts: ${prompts.map((p) => p.id).join(", ")}`);
  console.log("");

  if (flags.dryRun) {
    console.log("--dry-run: not making any API calls. Exiting.");
    process.exit(0);
  }

  // Verify keys for the providers we'll hit.
  const needsAnthropic = candidates.some((c) => c.provider === "anthropic");
  const needsOpenRouter = candidates.some((c) => c.provider === "openrouter") || !flags.skipJudge;
  if (needsAnthropic && !process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY (needed for Anthropic-direct candidates).");
    process.exit(1);
  }
  if (needsOpenRouter && !process.env.OPENROUTER_API_KEY) {
    console.error("Missing OPENROUTER_API_KEY (needed for OpenRouter candidates + judge).");
    process.exit(1);
  }

  // Confirm.
  if (!flags.yes) {
    const ok = await confirm(`Run benchmark for ~$${fmt(est.total, 2)}?`);
    if (!ok) { console.log("Aborted."); process.exit(0); }
  }

  // Execute.
  const started = Date.now();
  const results = [];
  let idx = 0;
  for (const candidate of candidates) {
    const apiKey = candidate.provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENROUTER_API_KEY;
    for (const prompt of prompts) {
      for (let run = 0; run < flags.runs; run++) {
        idx++;
        process.stdout.write(`[${idx}/${turns}] ${candidate.slug} • ${prompt.id} • run ${run + 1}/${flags.runs} ... `);
        const r = await runTurn({ candidate, prompt, apiKey });
        const scores = scoreRun({ run: r, prompt, validRefs });
        let judge = null;
        if (!flags.skipJudge && !r.error) {
          const judgeConfig = candidate.isAnthropicFamily ? JUDGE_ANTHROPIC_SUBSET : JUDGE_DEFAULT;
          judge = await judgeRun({
            prompt, run: r, judgeConfig, apiKey: process.env.OPENROUTER_API_KEY,
          });
        }
        results.push({
          candidate, prompt, run, ...r, scores, judge,
        });
        process.stdout.write(`${r.error ? `ERR: ${r.error.slice(0, 60)}` : `${scores.markers.total}m ${r.toolEvents.length}t ${judge?.score ?? "–"}/5`}\n`);
      }
    }
  }
  const ended = Date.now();

  const { reportPath, runPath } = writeReport({ results, started, ended });
  console.log(`\nReport: ${reportPath}`);
  console.log(`Raw:    ${runPath}`);
}

main().catch((e) => {
  console.error("\nFatal:", e);
  process.exit(1);
});
