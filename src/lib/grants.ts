import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

export interface Source {
  title: string;
  url: string;
}

export interface Funder {
  slug: string;
  name: string;
  region: string;
  type: "government" | "foundation" | "corporate" | "consortium";
  mission: string;
  funding_range: string;
  cadence: string;
  process: string;
  url: string;
  focus_layers: string[];
  notable_recent: string;
  /**
   * Additional sources for claims in mission / notable_recent that are
   * NOT already documented at `url`. Per the citation-discipline rule
   * in CLAUDE.md.
   */
  sources?: Source[];
}

export type Region = "US" | "EU" | "UK" | "Global" | "Asia" | "Africa" | "LatAm";
export type GrantKind = "project" | "program";

export interface Grant {
  title: string;
  /**
   * "project": a specific named project that received money. You can
   *            look it up and see what it does.
   * "program": a cohort, RFP, fellowship round, or aggregate funder
   *            announcement. The "thing" here is the program itself.
   */
  kind: GrantKind;
  funder: string;
  recipient: string;
  date: string;
  amount_usd?: number;
  amount_label: string;
  layers: string[];
  region: Region;
  url: string;
  description: string;
  /**
   * Optional multi-paragraph explainer rendered on /grants/<slug>. Only
   * a subset of grants have one (those where research yielded
   * verifiable depth beyond the one-line description). Mirrors the
   * `explainer` field on projects.yaml. Every factual claim in the
   * explainer must trace back to an entry in `sources` per the
   * citation-discipline rule in CLAUDE.md.
   */
  explainer?: string;
  /**
   * Additional sources beyond `url`. Most grant entries do not need
   * this because their `url` is the announcement. Required when
   * `explainer` is populated and references claims not documented at
   * `url`.
   */
  sources?: Source[];
}

/**
 * Bucket a grant amount for the amount-range filter.
 * Returns one of: "undisclosed" | "<100K" | "100K-1M" | "1M-10M" | ">10M"
 */
export function amountBucket(amount: number | undefined | null): string {
  if (!amount || amount <= 0) return "undisclosed";
  if (amount < 100_000) return "<100K";
  if (amount < 1_000_000) return "100K-1M";
  if (amount < 10_000_000) return "1M-10M";
  return ">10M";
}

/**
 * Bucket a grant date string (YYYY-MM-DD or YYYY-MM or YYYY) for the
 * recency filter. Returns one of: "30d" | "90d" | "1y" | "older"
 */
export function recencyBucket(date: string, today: Date = new Date()): string {
  // Normalize: accept YYYY, YYYY-MM, YYYY-MM-DD
  const parts = String(date).split("-");
  const y = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) - 1 : 0;
  const d = parts[2] ? parseInt(parts[2], 10) : 1;
  const grantDate = new Date(y, m, d);
  if (isNaN(grantDate.getTime())) return "older";
  const diffMs = today.getTime() - grantDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays <= 30) return "30d";
  if (diffDays <= 90) return "90d";
  if (diffDays <= 365) return "1y";
  return "older";
}

export interface UnderfundedArea {
  id: string;
  layer: string;
  title: string;
  description: string;
  project_shapes: string[];
  priority: "high" | "medium" | "low";
}

export function loadFunders(): Funder[] {
  const path = resolve(process.cwd(), "data/funders.yaml");
  const text = readFileSync(path, "utf-8");
  const parsed = yaml.load(text) as { funders: Funder[] };
  return parsed.funders;
}

export function loadGrants(): Grant[] {
  const path = resolve(process.cwd(), "data/grants.yaml");
  const text = readFileSync(path, "utf-8");
  const parsed = yaml.load(text) as { grants: Grant[] };
  // Newest first.
  return [...parsed.grants].sort((a, b) =>
    String(b.date).localeCompare(String(a.date)),
  );
}

export function loadUnderfunded(): UnderfundedArea[] {
  const path = resolve(process.cwd(), "data/underfunded.yaml");
  const text = readFileSync(path, "utf-8");
  const parsed = yaml.load(text) as { underfunded: UnderfundedArea[] };
  const order = { high: 0, medium: 1, low: 2 };
  return [...parsed.underfunded].sort(
    (a, b) => order[a.priority] - order[b.priority],
  );
}

/**
 * Aggregate grants by layer for the funded-vs-underfunded rollup.
 * Returns map: layer slug -> { grantCount, totalUsd, underfundedCount }
 */
export interface LayerRollup {
  layer: string;
  grant_count: number;
  total_usd: number;
  underfunded_count: number;
  underfunded_high_count: number;
  funders: Set<string>;
}

export function buildLayerRollup(): Record<string, LayerRollup> {
  const grants = loadGrants();
  const underfunded = loadUnderfunded();
  const result: Record<string, LayerRollup> = {};

  const ensure = (layer: string): LayerRollup => {
    if (!result[layer]) {
      result[layer] = {
        layer,
        grant_count: 0,
        total_usd: 0,
        underfunded_count: 0,
        underfunded_high_count: 0,
        funders: new Set(),
      };
    }
    return result[layer];
  };

  for (const g of grants) {
    for (const layer of g.layers) {
      const row = ensure(layer);
      row.grant_count += 1;
      if (g.amount_usd) row.total_usd += g.amount_usd;
      row.funders.add(g.funder);
    }
  }
  for (const u of underfunded) {
    const row = ensure(u.layer);
    row.underfunded_count += 1;
    if (u.priority === "high") row.underfunded_high_count += 1;
  }
  return result;
}

/**
 * Derive a URL slug from a grant title. Grants don't have a slug
 * field in YAML (their primary key is the title string); this is the
 * single source of truth. Used by the per-grant route at
 * /grants/<slug> and by the card-link on /grants.
 *
 * Collisions across grants would break routing. `assertGrantSlugsUnique`
 * runs at build time and throws on duplicates so the failure surfaces
 * during astro build, not at request time.
 */
export function grantSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function assertGrantSlugsUnique(grants: Grant[]): void {
  const seen = new Map<string, string>();
  for (const g of grants) {
    const slug = grantSlug(g.title);
    const prior = seen.get(slug);
    if (prior) {
      throw new Error(
        `Two grants slug to "${slug}": ${JSON.stringify(prior)} and ${JSON.stringify(g.title)}. Rename one to disambiguate.`,
      );
    }
    seen.set(slug, g.title);
  }
}

export function formatUsd(amount: number | undefined): string {
  if (!amount) return "";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}
