import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

export interface Prediction {
  layer: string;
  claim: string;
  horizon: string;
  confidence: number; // 1-5
  resolves_when: string;
  filed: string;
}

/**
 * Load the predictions baseline from `data/predictions.yaml`.
 * Runs at build time only.
 */
export function loadPredictions(): Prediction[] {
  const path = resolve(process.cwd(), "data/predictions.yaml");
  const text = readFileSync(path, "utf-8");
  const parsed = yaml.load(text) as { predictions: Prediction[] };
  return parsed.predictions;
}

export function loadPredictionsForLayer(layerSlug: string): Prediction[] {
  return loadPredictions().filter((p) => p.layer === layerSlug);
}

/**
 * Human-readable confidence label for the 1-5 scale.
 */
export function confidenceLabel(c: number): string {
  if (c >= 5) return "very high";
  if (c >= 4) return "high";
  if (c >= 3) return "medium";
  if (c >= 2) return "low";
  return "speculative";
}
