import { loadProjects, type Project } from "./projects";

/**
 * Agent-SDK comparison overlay.
 *
 * The canonical, audited facts (name, license, url, github, focus,
 * maturity) come from data/projects.yaml via loadProjects(); the
 * citation linter and the claims-audit pipeline cover those. This
 * overlay adds ONLY the comparison-specific fields that the projects
 * schema does not type: category, languages, model-coupling, MCP
 * style, multi-agent style, the version/date label, and the two
 * editorial scatter scores.
 *
 * The labels here restate facts that are written out (and audited) in
 * each entry's `explainer` in data/projects.yaml; keep them in sync.
 * The two numeric scores (`coupling` and `abstraction`) are editorial
 * placements for the quadrant scatter, not verifiable facts: 0..1 on
 * each axis. They are framing, surfaced as such in the chart caption.
 */

export type SdkCategory = "vendor" | "independent";

export interface SdkOverlay {
  slug: string;
  maker: string;
  category: SdkCategory;
  languages: string[];
  /** Model coupling: 0 = vendor-tied, 1 = fully model-agnostic. */
  coupling: number;
  couplingLabel: string;
  /** Editorial abstraction level: 0 = low-level primitives, 1 = batteries-included. */
  abstraction: number;
  multiAgent: string;
  /** MCP support label, and whether it ships in the core library. */
  mcpLabel: string;
  mcpNative: boolean;
  /** Short "latest major version (date)" label. */
  latest: string;
  /**
   * License wrinkle worth muting in the matrix (set only where the
   * one-token license field hides something material). The `licenseMuted`
   * cells render in a lighter value with this note as a tooltip.
   */
  licenseNote?: string;
}

// Display order: vendor SDKs first, then the independent / model-agnostic
// frameworks. Within each group, ordered roughly by release recency of
// the agent SDK rather than alphabetically.
const OVERLAY: SdkOverlay[] = [
  {
    slug: "openai-agents-sdk",
    maker: "OpenAI",
    category: "vendor",
    languages: ["Python", "TypeScript"],
    coupling: 0.6,
    couplingLabel: "Agnostic (LiteLLM)",
    abstraction: 0.3,
    multiAgent: "Handoffs",
    mcpLabel: "Native",
    mcpNative: true,
    latest: "0.17.x (0.x)",
  },
  {
    slug: "claude-agent-sdk",
    maker: "Anthropic",
    category: "vendor",
    languages: ["Python", "TypeScript"],
    coupling: 0.05,
    couplingLabel: "Claude-only",
    abstraction: 0.5,
    multiAgent: "Subagents",
    mcpLabel: "Native + in-process",
    mcpNative: true,
    latest: "0.2.x (0.x)",
    licenseNote: "Package is MIT; use governed by Anthropic Commercial Terms.",
  },
  {
    slug: "google-adk",
    maker: "Google",
    category: "vendor",
    languages: ["Python", "Java", "Go", "TypeScript", "Kotlin"],
    coupling: 0.55,
    couplingLabel: "Agnostic (LiteLLM)",
    abstraction: 0.6,
    multiAgent: "Workflow agents",
    mcpLabel: "Native",
    mcpNative: true,
    latest: "2.0 (May 2026)",
  },
  {
    slug: "microsoft-agent-framework",
    maker: "Microsoft",
    category: "vendor",
    languages: ["Python", ".NET"],
    coupling: 0.6,
    couplingLabel: "Agnostic (connectors)",
    abstraction: 0.65,
    multiAgent: "Graph + group chat",
    mcpLabel: "Native",
    mcpNative: true,
    latest: "1.0 (Apr 2026)",
  },
  {
    slug: "vercel-ai-sdk",
    maker: "Vercel",
    category: "vendor",
    languages: ["TypeScript"],
    coupling: 0.85,
    couplingLabel: "Agnostic (unified API)",
    abstraction: 0.3,
    multiAgent: "Subagents",
    mcpLabel: "Native (lightweight)",
    mcpNative: true,
    latest: "6.0 (Dec 2025)",
  },
  {
    slug: "strands-agents",
    maker: "AWS",
    category: "vendor",
    languages: ["Python", "TypeScript (preview)"],
    coupling: 0.6,
    couplingLabel: "Agnostic (LiteLLM)",
    abstraction: 0.5,
    multiAgent: "Workflow / graph / swarm",
    mcpLabel: "Native",
    mcpNative: true,
    latest: "1.x (GA Jul 2025)",
  },
  {
    slug: "langchain",
    maker: "LangChain, Inc.",
    category: "independent",
    languages: ["Python", "JavaScript/TypeScript"],
    coupling: 0.9,
    couplingLabel: "Agnostic",
    abstraction: 0.15,
    multiAgent: "Graph (LangGraph)",
    mcpLabel: "Via adapter",
    mcpNative: false,
    latest: "1.0 (Oct 2025)",
    licenseNote: "Core is MIT; the langgraph-api runtime is Elastic License 2.0.",
  },
  {
    slug: "llama-index",
    maker: "run-llama",
    category: "independent",
    languages: ["Python", "TypeScript"],
    coupling: 0.9,
    couplingLabel: "Agnostic",
    abstraction: 0.7,
    multiAgent: "AgentWorkflow",
    mcpLabel: "Via package",
    mcpNative: false,
    latest: "0.14.x (0.x)",
  },
  {
    slug: "crewai",
    maker: "crewAI, Inc.",
    category: "independent",
    languages: ["Python"],
    coupling: 0.85,
    couplingLabel: "Agnostic (LiteLLM)",
    abstraction: 0.9,
    multiAgent: "Crews (roles)",
    mcpLabel: "Via adapter",
    mcpNative: false,
    latest: "1.x (GA Oct 2025)",
  },
  {
    slug: "pydantic-ai",
    maker: "Pydantic",
    category: "independent",
    languages: ["Python"],
    coupling: 0.9,
    couplingLabel: "Agnostic",
    abstraction: 0.45,
    multiAgent: "A2A + graph",
    mcpLabel: "Native",
    mcpNative: true,
    latest: "1.x (GA Sep 2025)",
  },
  {
    slug: "mastra",
    maker: "Mastra (Gatsby team)",
    category: "independent",
    languages: ["TypeScript"],
    coupling: 0.85,
    couplingLabel: "Agnostic (Vercel AI SDK)",
    abstraction: 0.8,
    multiAgent: "Supervisor / sub-agents",
    mcpLabel: "Native",
    mcpNative: true,
    latest: "1.0 (Jan 2026)",
    licenseNote: "Apache-2.0 core; ee/ directories under a separate enterprise license.",
  },
];

export interface AgentSdk extends SdkOverlay {
  name: string;
  license: string;
  url: string;
  github?: string;
  focus: Project["focus"];
  maturity: Project["maturity"];
  /** True when the entry has an explainer (so /projects/<slug> exists). */
  hasPage: boolean;
}

/**
 * Join the overlay with the audited projects.yaml entries. Throws at
 * build time if an overlay slug is missing from projects.yaml, so the
 * two cannot drift apart silently.
 */
export function loadAgentSdks(): AgentSdk[] {
  const projects = loadProjects();
  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  return OVERLAY.map((o) => {
    const p = bySlug.get(o.slug);
    if (!p) {
      throw new Error(
        `agent-sdks overlay references slug "${o.slug}" which is not in data/projects.yaml`,
      );
    }
    return {
      ...o,
      name: p.name,
      license: p.license,
      url: p.url,
      github: p.github,
      focus: p.focus,
      maturity: p.maturity,
      hasPage: Boolean(p.explainer),
    };
  });
}

export function couplingDescriptor(score: number): string {
  if (score < 0.2) return "vendor-tied";
  if (score < 0.7) return "agnostic, house default";
  return "fully agnostic";
}

export function abstractionDescriptor(score: number): string {
  if (score < 0.35) return "low-level primitives";
  if (score < 0.7) return "middle";
  return "batteries-included";
}
