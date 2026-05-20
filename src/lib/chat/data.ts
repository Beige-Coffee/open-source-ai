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

export async function getTodayNews(): Promise<NewsIssue | null> {
  return getJson<NewsIssue | null>("today-news");
}

export async function getGlossary(): Promise<GlossaryEntry[]> {
  return getJson<GlossaryEntry[]>("glossary");
}

interface ModelBenchmarkScore {
  score: number;
  as_of: string;
  source: string;
  variant?: string;
}

interface ModelReceptionQuote {
  quote: string;
  author: string;
  affiliation?: string;
  url: string;
  date: string;
}

interface ModelSource {
  title: string;
  url: string;
}

interface ModelEntry {
  slug: string;
  display_name: string;
  family: string;
  developer: string;
  developer_country?: string;
  type: string;
  released_date: string;
  weights_released_date?: string;
  paper_date?: string;
  deprecated_date?: string;
  openness: string;
  license: string;
  osi_approved: boolean;
  data_released: boolean;
  training_code_released: boolean;
  training_logs_released: boolean;
  architecture: string;
  params_total: number;
  params_active: number;
  experts?: number;
  experts_active?: number;
  context_window: number;
  attention_variant: string;
  position_encoding: string;
  tokenizer?: string;
  layers_count?: number;
  vocab_size?: number;
  pretraining_tokens?: number;
  training_data_summary?: string;
  post_training?: string[];
  training_hardware?: string;
  training_compute_flops?: number;
  benchmarks?: Record<string, ModelBenchmarkScore>;
  quantizations_available?: string[];
  runtimes_supporting?: string[];
  release_context?: string;
  notable_innovations?: string[];
  reception?: ModelReceptionQuote[];
  sources: ModelSource[];
}

export async function getModels(): Promise<ModelEntry[]> {
  const root = await getJson<{ models: ModelEntry[] }>("models");
  return root.models ?? [];
}

export type {
  LayerEntry,
  Project,
  Funder,
  Grant,
  Reading,
  NewsIssue,
  GlossaryEntry,
  ModelEntry,
};
