import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

export type ReadingType =
  | "paper"
  | "post"
  | "talk"
  | "podcast"
  | "book"
  | "thread"
  | "docs";

export interface Reading {
  title: string;
  source: string;
  url: string;
  type: ReadingType;
  year: number;
  layers: string[];
  description: string;
}

/**
 * Load curated reading lists from `data/reading-lists.yaml`.
 * Runs at build time only.
 */
export function loadReadings(): Reading[] {
  const path = resolve(process.cwd(), "data/reading-lists.yaml");
  const text = readFileSync(path, "utf-8");
  const parsed = yaml.load(text) as { readings: Reading[] };
  return parsed.readings;
}

/**
 * Readings for a given layer slug. Multi-layer entries appear in each
 * layer they are tagged for.
 */
export function loadReadingsForLayer(layerSlug: string): Reading[] {
  return loadReadings().filter((r) => r.layers.includes(layerSlug));
}

/**
 * Human-readable type label.
 */
export function typeLabel(t: ReadingType): string {
  switch (t) {
    case "paper":
      return "Paper";
    case "post":
      return "Post";
    case "talk":
      return "Talk";
    case "podcast":
      return "Podcast";
    case "book":
      return "Book";
    case "thread":
      return "Thread";
    case "docs":
      return "Docs";
  }
}
