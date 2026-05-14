import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

export type ProjectFocus =
  | "open"
  | "open-weights"
  | "source-available"
  | "proprietary"
  | "standard";

export type ProjectMaturity =
  | "stable"
  | "beta"
  | "alpha"
  | "research"
  | "maintenance"
  | "new";

export interface ProjectSource {
  title: string;
  url: string;
}

export interface Project {
  slug: string;
  name: string;
  layers: string[];
  license: string;
  focus: ProjectFocus;
  maturity: ProjectMaturity;
  url: string;
  github?: string;
  description: string;
  /**
   * Optional 200-400 word explainer for high-priority projects.
   * Covers: what it is, how it compares to siblings at the same
   * layer, why it matters for open-source AI, who is using it, and
   * whether it is production-ready. Every numerical or factual
   * claim must be traceable to `sources` per CLAUDE.md citation rule.
   * Renders as an expandable section on the layer page card; the
   * chat agent reads it via the read_project tool.
   */
  explainer?: string;
  /**
   * Additional sources beyond `url` / `github`. Required when
   * `explainer` is populated and contains specific factual claims.
   */
  sources?: ProjectSource[];
}

/**
 * Load the project catalog from `data/projects.yaml`.
 * Runs at build time only.
 */
export function loadProjects(): Project[] {
  const path = resolve(process.cwd(), "data/projects.yaml");
  const text = readFileSync(path, "utf-8");
  const parsed = yaml.load(text) as { projects: Project[] };
  return parsed.projects;
}

/**
 * Return all projects whose `layers` array includes the given layer slug.
 * Projects can sit in multiple layers; this returns all matches.
 */
export function loadProjectsForLayer(layerSlug: string): Project[] {
  return loadProjects().filter((p) => p.layers.includes(layerSlug));
}

/**
 * Group projects by primary layer (first element of `layers`).
 * Useful for catalog views that need a single bucket per project.
 */
export function loadProjectsGroupedByPrimaryLayer(): Record<string, Project[]> {
  const result: Record<string, Project[]> = {};
  for (const p of loadProjects()) {
    const primary = p.layers[0];
    if (!result[primary]) result[primary] = [];
    result[primary].push(p);
  }
  return result;
}

/**
 * Human-readable focus label.
 */
export function focusLabel(focus: ProjectFocus): string {
  switch (focus) {
    case "open":
      return "Open source";
    case "open-weights":
      return "Open weights";
    case "source-available":
      return "Source available";
    case "proprietary":
      return "Proprietary";
    case "standard":
      return "Open standard";
  }
}

/**
 * CSS color token for focus, matching the brand palette in global.css.
 * The CSS variables are declared in BaseLayout/global stylesheet.
 */
export function focusColor(focus: ProjectFocus): string {
  switch (focus) {
    case "open":
      return "var(--color-focus-open)";
    case "open-weights":
      return "var(--color-focus-open-weights)";
    case "source-available":
      return "var(--color-focus-source-available)";
    case "proprietary":
      return "var(--color-focus-proprietary)";
    case "standard":
      return "var(--color-focus-standard)";
  }
}
