/**
 * Browser-side data loaders. Fetch the JSON written by
 * scripts/build-data.mjs at /data/<name>.json. Each loader caches the
 * result so repeated tool calls in a session do not re-fetch.
 */

interface LayerEntry {
  slug: string;
  title: string;
  short_description: string;
  tier?: "core" | "meta";
  order?: number;
  lock_in_vector?: string;
  sovereignty_relevance?: number;
  related_layers?: string[];
  body?: string;
}

interface ProjectSource {
  title: string;
  url: string;
}

interface Project {
  slug: string;
  name: string;
  layers: string[];
  license: string;
  focus: string;
  maturity: string;
  url: string;
  github?: string;
  description: string;
  /** Optional 200-400 word explainer; only on high-priority projects. */
  explainer?: string;
  /** Sources for claims in the explainer. */
  sources?: ProjectSource[];
}

interface Funder {
  slug: string;
  name: string;
  region: string;
  type: string;
  mission: string;
  funding_range: string;
  cadence: string;
  process: string;
  url: string;
  focus_layers: string[];
  notable_recent: string;
}

interface GrantSource {
  title: string;
  url: string;
}

interface Grant {
  title: string;
  kind: "project" | "program";
  funder: string;
  recipient: string;
  date: string;
  amount_usd?: number;
  amount_label: string;
  layers: string[];
  region: string;
  url: string;
  description: string;
  /** Multi-paragraph deeper writeup; only on grants with verified research. */
  explainer?: string;
  /** Additional sources beyond the primary `url`. */
  sources?: GrantSource[];
}

interface Reading {
  title: string;
  source: string;
  url: string;
  type: string;
  year: number;
  layers: string[];
  description: string;
}

interface Prediction {
  layer: string;
  claim: string;
  horizon: string;
  confidence: number;
  resolves_when: string;
  filed: string;
}

interface NewsIssue {
  date: string;
  editorial_letter: string;
  item_count: number;
  layer_buckets: Record<string, number>;
  body: string;
}

interface GlossaryEntry {
  slug: string;
  term: string;
  aliases: string[];
  primary_layer: string;
  secondary_layers: string[];
  summary: string;
  sources?: { title: string; url: string }[];
  updated: string;
  body: string;
}

const cache = new Map<string, unknown>();

async function getJson<T>(name: string): Promise<T> {
  if (cache.has(name)) return cache.get(name) as T;
  const res = await fetch(`/data/${name}.json`);
  if (!res.ok) throw new Error(`Fetch ${name}.json: ${res.status}`);
  const data = (await res.json()) as T;
  cache.set(name, data);
  return data;
}

export async function getLayers(): Promise<LayerEntry[]> {
  const root = await getJson<{ core: LayerEntry[]; meta: LayerEntry[] }>(
    "layers",
  );
  return [
    ...root.core.map((l) => ({ ...l, tier: "core" as const })),
    ...root.meta.map((l) => ({ ...l, tier: "meta" as const })),
  ];
}

export async function getLayerContent(): Promise<LayerEntry[]> {
  return getJson<LayerEntry[]>("layer-content");
}

export async function getProjects(): Promise<Project[]> {
  const root = await getJson<{ projects: Project[] }>("projects");
  return root.projects;
}

export async function getFunders(): Promise<Funder[]> {
  const root = await getJson<{ funders: Funder[] }>("funders");
  return root.funders;
}

export async function getGrants(): Promise<Grant[]> {
  const root = await getJson<{ grants: Grant[] }>("grants");
  return root.grants;
}

export async function getReadings(): Promise<Reading[]> {
  const root = await getJson<{ readings: Reading[] }>("reading-lists");
  return root.readings;
}

export async function getPredictions(): Promise<Prediction[]> {
  const root = await getJson<{ predictions: Prediction[] }>("predictions");
  return root.predictions;
}

export async function getTodayNews(): Promise<NewsIssue | null> {
  return getJson<NewsIssue | null>("today-news");
}

export async function getGlossary(): Promise<GlossaryEntry[]> {
  return getJson<GlossaryEntry[]>("glossary");
}

export type {
  LayerEntry,
  Project,
  Funder,
  Grant,
  Reading,
  Prediction,
  NewsIssue,
  GlossaryEntry,
};
