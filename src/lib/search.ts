/**
 * Site-wide search.
 *
 * Loads /data/search-index.json once, builds a MiniSearch index in
 * the browser, exposes searchAll() with hits grouped by content
 * type. Independent of src/lib/chat/retrieve.ts: the chat agent's
 * index is shaped for tool-driven retrieval; this one is shaped
 * for a user typing into a box.
 *
 * The index is fetched lazily on first search to keep the bundle
 * small and the first paint fast. ~414KB on disk, ~130KB gzipped.
 */
import MiniSearch from "minisearch";

export type SearchType =
  | "layer"
  | "project"
  | "funder"
  | "grant"
  | "glossary"
  | "news"
  | "prediction"
  | "reading";

export interface SearchDoc {
  id: string;
  type: SearchType;
  title: string;
  summary: string;
  body: string;
  url: string;
  layers: string[];
  meta?: Record<string, unknown>;
}

export interface SearchHit extends SearchDoc {
  score: number;
  matched: string[];
}

interface IndexFile {
  version: number;
  generated_at: string;
  docs: SearchDoc[];
}

let docs: SearchDoc[] = [];
let docById: Map<string, SearchDoc> = new Map();
let ms: MiniSearch<SearchDoc> | null = null;
let loadPromise: Promise<void> | null = null;

const TYPE_ORDER: SearchType[] = [
  "layer",
  "glossary",
  "project",
  "grant",
  "funder",
  "news",
  "prediction",
  "reading",
];

export const TYPE_LABEL: Record<SearchType, string> = {
  layer: "Stack layer",
  project: "Project",
  funder: "Funder",
  grant: "Grant",
  glossary: "Glossary",
  news: "News",
  prediction: "Prediction",
  reading: "Reading",
};

export const TYPE_LABEL_PLURAL: Record<SearchType, string> = {
  layer: "Stack layers",
  project: "Projects",
  funder: "Funders",
  grant: "Grants",
  glossary: "Glossary",
  news: "News",
  prediction: "Predictions",
  reading: "Readings",
};

export function compareTypes(a: SearchType, b: SearchType): number {
  return TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b);
}

/**
 * Lazy-load the index. Safe to call repeatedly; resolves immediately
 * once loaded. Returns the promise so callers can await readiness.
 */
export function ensureIndex(): Promise<void> {
  if (ms) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const res = await fetch("/data/search-index.json", {
      cache: "force-cache",
    });
    if (!res.ok) throw new Error(`search-index.json: ${res.status}`);
    const file = (await res.json()) as IndexFile;
    docs = file.docs;
    docById = new Map(docs.map((d) => [d.id, d]));
    const instance = new MiniSearch<SearchDoc>({
      fields: ["title", "summary", "body"],
      storeFields: ["id"],
      idField: "id",
      searchOptions: {
        boost: { title: 4, summary: 2 },
        fuzzy: 0.2,
        prefix: true,
        combineWith: "AND",
      },
    });
    instance.addAll(docs);
    ms = instance;
  })();
  return loadPromise;
}

export interface SearchOptions {
  /** Cap total results across all types. Default 50. */
  limit?: number;
  /** Restrict to a subset of types. */
  types?: SearchType[];
}

/**
 * Returns a flat ranked list. Callers can group by type with
 * groupByType() if needed.
 */
export async function searchAll(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  await ensureIndex();
  if (!ms || !query.trim()) return [];
  const limit = opts.limit ?? 50;
  let raw = ms.search(query);
  // Recover hits when the AND-default returns too few (typos, partial
  // matches): rerun with OR and merge unique.
  if (raw.length < Math.min(limit, 12)) {
    const seen = new Set(raw.map((r) => r.id));
    const more = ms.search(query, { combineWith: "OR" });
    for (const r of more) {
      if (!seen.has(r.id)) {
        raw.push(r);
        seen.add(r.id);
      }
    }
  }
  const hits: SearchHit[] = [];
  for (const r of raw) {
    const doc = docById.get(r.id as string);
    if (!doc) continue;
    if (opts.types && !opts.types.includes(doc.type)) continue;
    hits.push({
      ...doc,
      score: r.score,
      matched: (r.terms ?? []) as string[],
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

/**
 * Group hits by content type, preserving rank within each group.
 * Types follow TYPE_ORDER so the rendered page is consistent.
 */
export function groupByType(
  hits: SearchHit[],
): { type: SearchType; hits: SearchHit[] }[] {
  const buckets = new Map<SearchType, SearchHit[]>();
  for (const h of hits) {
    if (!buckets.has(h.type)) buckets.set(h.type, []);
    buckets.get(h.type)!.push(h);
  }
  return [...buckets.entries()]
    .map(([type, hits]) => ({ type, hits }))
    .sort((a, b) => compareTypes(a.type, b.type));
}

/**
 * Build a short snippet around the first matched term. Falls back to
 * the doc's summary if nothing useful surfaces.
 */
export function snippetFor(hit: SearchHit, max = 160): string {
  const body = hit.body ?? "";
  const term = (hit.matched ?? [])[0];
  if (!term || !body) return hit.summary || body.slice(0, max);
  const lower = body.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx < 0) return hit.summary || body.slice(0, max);
  const start = Math.max(0, idx - Math.floor(max / 3));
  const end = Math.min(body.length, start + max);
  const out = body.slice(start, end);
  return (start > 0 ? "…" : "") + out + (end < body.length ? "…" : "");
}
