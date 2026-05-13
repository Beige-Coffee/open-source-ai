import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

export interface LayerData {
  slug: string;
  order: number;
  title: string;
  short_description: string;
  lock_in_vector: string;
}

export interface LayerTaxonomy {
  core: LayerData[];
  meta: LayerData[];
}

/**
 * Load the canonical layer taxonomy from `data/layers.yaml`.
 * Runs at build time only; not shipped to the client.
 */
export function loadLayers(): LayerTaxonomy {
  const path = resolve(process.cwd(), "data/layers.yaml");
  const text = readFileSync(path, "utf-8");
  const parsed = yaml.load(text) as LayerTaxonomy;
  parsed.core.sort((a, b) => a.order - b.order);
  parsed.meta.sort((a, b) => a.order - b.order);
  return parsed;
}

export function loadCoreLayers(): LayerData[] {
  return loadLayers().core;
}

export function loadMetaLayers(): LayerData[] {
  return loadLayers().meta;
}
