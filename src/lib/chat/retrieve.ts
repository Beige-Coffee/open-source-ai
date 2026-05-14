/**
 * Full-text search across the wiki. Used by the search() tool as a
 * fallback when no structured filter matches what the user is asking
 * for. Builds one MiniSearch index over heterogeneous documents,
 * tagged by kind so the agent can disambiguate hits.
 */
import MiniSearch from "minisearch";
import {
  getGrants,
  getFunders,
  getProjects,
  getReadings,
  getLayerContent,
  getSynthesis,
} from "./data";

interface SearchDoc {
  id: string;
  kind: "grant" | "funder" | "project" | "reading" | "layer" | "essay";
  title: string;
  body: string;
  // Optional cargo for the agent to know what to do next with a hit.
  slug?: string;
  url?: string;
  layers?: string[];
}

let index: MiniSearch<SearchDoc> | null = null;
let docs: SearchDoc[] = [];
let buildPromise: Promise<{
  index: MiniSearch<SearchDoc>;
  docs: SearchDoc[];
}> | null = null;

async function buildIndex() {
  if (index) return { index, docs };
  if (buildPromise) return buildPromise;
  buildPromise = (async () => {
    const [grants, funders, projects, readings, layers, essays] = await Promise.all(
      [
        getGrants(),
        getFunders(),
        getProjects(),
        getReadings(),
        getLayerContent(),
        getSynthesis(),
      ],
    );

    const all: SearchDoc[] = [];
    for (const g of grants) {
      all.push({
        id: `grant:${g.title}`,
        kind: "grant",
        title: g.title,
        body: `${g.recipient}. ${g.description}`,
        url: g.url,
        layers: g.layers,
      });
    }
    for (const f of funders) {
      all.push({
        id: `funder:${f.slug}`,
        kind: "funder",
        title: f.name,
        body: `${f.mission} ${f.notable_recent}`,
        slug: f.slug,
        url: f.url,
        layers: f.focus_layers,
      });
    }
    for (const p of projects) {
      all.push({
        id: `project:${p.slug}`,
        kind: "project",
        title: p.name,
        body: p.description,
        slug: p.slug,
        url: p.url,
        layers: p.layers,
      });
    }
    for (const r of readings) {
      all.push({
        id: `reading:${r.title}`,
        kind: "reading",
        title: r.title,
        body: `${r.source}. ${r.description}`,
        url: r.url,
        layers: r.layers,
      });
    }
    for (const l of layers) {
      all.push({
        id: `layer:${l.slug}`,
        kind: "layer",
        title: l.title,
        body: `${l.short_description ?? ""}. ${l.body ?? ""}`,
        slug: l.slug,
        url: `/stack/${l.slug}`,
        layers: [l.slug],
      });
    }
    for (const e of essays) {
      all.push({
        id: `essay:${e.slug}`,
        kind: "essay",
        title: e.title,
        body: `${e.summary}. ${e.body}`,
        slug: e.slug,
        url: `/essays/${e.slug}`,
        layers: e.related_layers ?? [],
      });
    }

    const ms = new MiniSearch<SearchDoc>({
      fields: ["title", "body"],
      storeFields: ["id", "kind", "title", "slug", "url", "layers"],
      idField: "id",
      searchOptions: {
        boost: { title: 3 },
        fuzzy: 0.2,
        prefix: true,
        combineWith: "AND",
      },
    });
    ms.addAll(all);
    index = ms;
    docs = all;
    return { index: ms, docs: all };
  })();
  return buildPromise;
}

export interface SearchHit {
  id: string;
  kind: SearchDoc["kind"];
  title: string;
  slug?: string;
  url?: string;
  layers?: string[];
  score: number;
}

export async function searchAll(query: string, k = 10): Promise<SearchHit[]> {
  const { index: idx } = await buildIndex();
  let results = idx.search(query);
  if (results.length < k) {
    results = idx.search(query, { combineWith: "OR" });
  }
  return results.slice(0, k).map((r) => ({
    id: r.id as string,
    kind: r.kind as SearchDoc["kind"],
    title: r.title as string,
    slug: r.slug as string | undefined,
    url: r.url as string | undefined,
    layers: r.layers as string[] | undefined,
    score: Math.round(r.score * 100) / 100,
  }));
}
