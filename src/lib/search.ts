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
  /**
   * Optional space-joined alternative names for the entry. Only
   * glossary entries currently have this (so "moe" surfaces the
   * mixture-of-experts entry). Indexed and title-boosted.
   */
  aliases?: string;
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
      fields: ["title", "aliases", "summary", "body"],
      storeFields: ["id"],
      idField: "id",
      searchOptions: {
        // Heavy title boost so a doc whose name is the query (Prime
        // Intellect, vLLM, OpenSats) clears any layer or glossary
        // entry that merely mentions it in body. Aliases get the
        // same boost so "moe" → mixture-of-experts works. Summary
        // outweighs body by 3x so editorial framing dominates over
        // passing references buried deep in a layer's prose.
        boost: { title: 10, aliases: 10, summary: 3 },
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
  /**
   * Noise-tail threshold as a fraction of the second-best hit's
   * score. Higher = tighter (drops more weak results). The popover
   * passes 0.25 (only show clearly relevant matches); the /search
   * page passes 0.08 (browse-friendly, show everything plausible).
   * Default 0.20.
   */
  thresholdRatio?: number;
}

/**
 * Returns a flat ranked list. Callers can group by type with
 * groupByType() if needed.
 *
 * Three layers of relevance work happens here on top of MiniSearch's
 * BM25-ish base score:
 *   1. Phrase-match boost: a doc whose title is the query (or starts
 *      with it, or contains it as a substring) gets a multiplicative
 *      bump. MiniSearch's field boost weighs title TOKENS but doesn't
 *      reward the surface form, so "prime intellect" against a doc
 *      titled "Prime Intellect" needs this explicit layer.
 *   2. Body-only penalty: a hit that only matched in body (no token
 *      hit in title or summary) is usually a stray mention in a
 *      paragraph about something else. Halve its score.
 *   3. Threshold filter: drop hits whose adjusted score is below 15%
 *      of the top hit's score (with an absolute floor). Cuts the
 *      long noise tail that pollutes results for distinctive queries.
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

  // Phrase + body-only adjustments. Tuning notes:
  //   - exact title match x6 (not x10) so the gap between "Prime
  //     Intellect" the project and a layer page that discusses it
  //     in body stays a few-x, not 10x. The user often DOES want
  //     to see "here's where this is discussed", just not above
  //     the canonical entry.
  //   - body-only penalty x0.5: half-weight stray mentions.
  //   - Final threshold (below) is 10% of top, so a single perfect
  //     match doesn't bury everything else.
  const ql = query.trim().toLowerCase();
  for (const r of raw) {
    const doc = docById.get(r.id as string);
    if (!doc) continue;
    const tl = doc.title.toLowerCase();
    // Title phrase-match boost.
    if (tl === ql) r.score *= 6;
    else if (tl.startsWith(ql)) r.score *= 3;
    else if (tl.includes(ql)) r.score *= 2;
    // Alias exact-match boost (e.g. "moe" → mixture-of-experts).
    // Word-boundary check so "moe" doesn't match "moetropolis".
    if (doc.aliases) {
      const aliasList = doc.aliases.toLowerCase().split(/\s+/);
      if (aliasList.includes(ql)) r.score *= 6;
    }

    // Determine which fields actually matched. MiniSearch returns a
    // `match` map: { term -> [field, field, ...] }. If every matched
    // term landed only in body, the hit is probably a stray mention.
    const matchMap = (r as unknown as { match?: Record<string, string[]> })
      .match;
    if (matchMap) {
      let touchedSignal = false;
      for (const fields of Object.values(matchMap)) {
        for (const f of fields) {
          if (f === "title" || f === "summary" || f === "aliases") {
            touchedSignal = true;
            break;
          }
        }
        if (touchedSignal) break;
      }
      if (!touchedSignal) r.score *= 0.5;
    }
  }

  // Re-sort by adjusted score.
  raw.sort((a, b) => b.score - a.score);

  // Drop the noise tail. We anchor on the SECOND-best score (or the
  // top if there's only one hit) so one outlier perfect match (e.g.
  // "Prime Intellect" the project, scored ~6x its layer mentions)
  // doesn't bury all the secondary hits the user might still want
  // to see. Floor at 0.5 absolute so very low-quality results never
  // sneak through on otherwise-empty queries.
  const ratio = opts.thresholdRatio ?? 0.20;
  const anchor = raw[1]?.score ?? raw[0]?.score ?? 0;
  const minScore = Math.max(anchor * ratio, 0.5);

  const hits: SearchHit[] = [];
  for (const r of raw) {
    if (r.score < minScore) break;
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
 *
 * Group order is driven by the BEST hit in each group (highest
 * score), not by a fixed type order. A query like "prime intellect"
 * whose top match is a Project should show the Projects group
 * first, ahead of layer/glossary entries that merely mention it.
 * Ties break with TYPE_ORDER so equal-score groups render in a
 * stable, predictable sequence.
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
    .map(([type, hits]) => ({
      type,
      hits,
      top: hits[0]?.score ?? 0,
    }))
    .sort((a, b) => {
      if (b.top !== a.top) return b.top - a.top;
      return compareTypes(a.type, b.type);
    })
    .map(({ type, hits }) => ({ type, hits }));
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
