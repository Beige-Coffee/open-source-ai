#!/usr/bin/env node
/**
 * Layer 1: cross-reference validation.
 *
 * Checks that every internal slug reference resolves to a real
 * entity. Pure mechanical, no LLM, no network.
 *
 * Specifically:
 * - Every grant.funder slug exists in funders.yaml
 * - Every grant.layers value exists in layers.yaml (also enum-
 *   checked by the JSON schema, but double-belt)
 * - Every funder.focus_layers value exists in layers.yaml
 * - Every project.layers value exists in layers.yaml
 * - Every reading.layers value exists in layers.yaml
 * - Every prediction.layer value exists in layers.yaml
 * - Every chat-agent citation marker in MDX / page copy resolves:
 *     (Layer: <slug>) -> layers.yaml
 *     (Funder: <slug>) -> funders.yaml
 *     (Project: <slug>) -> projects.yaml
 *     (Grant: <title>) -> grants.yaml (title match)
 *     (Reading: <title>) -> reading-lists.yaml (title match)
 *     (News: <date>) -> src/content/news/<date>.mdx exists
 *
 * Exit 0 on clean, 1 on any unresolved reference.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

function loadYaml(rel) {
  return yaml.load(readFileSync(resolve(ROOT, rel), "utf8"));
}

const layers = loadYaml("data/layers.yaml");
const layerSlugs = new Set([
  ...layers.core.map((l) => l.slug),
  ...layers.meta.map((l) => l.slug),
]);

const funders = loadYaml("data/funders.yaml").funders;
const funderSlugs = new Set(funders.map((f) => f.slug));

const grants = loadYaml("data/grants.yaml").grants;
const grantTitles = new Set(grants.map((g) => g.title));

const projects = loadYaml("data/projects.yaml").projects;
const projectSlugs = new Set(projects.map((p) => p.slug));

const readings = loadYaml("data/reading-lists.yaml").readings;
const readingTitles = new Set(readings.map((r) => r.title));

const predictions = loadYaml("data/predictions.yaml").predictions;

const newsDir = resolve(ROOT, "src/content/news");
const newsDates = new Set(
  readdirSync(newsDir)
    .filter((f) => extname(f) === ".mdx")
    .map((f) => f.replace(/\.mdx$/, "")),
);

const errors = [];

// Grant funder + layer refs.
for (const g of grants) {
  if (!funderSlugs.has(g.funder)) {
    errors.push(`grants.yaml grant "${g.title}": funder slug "${g.funder}" not in funders.yaml`);
  }
  for (const l of g.layers || []) {
    if (!layerSlugs.has(l)) {
      errors.push(`grants.yaml grant "${g.title}": layer "${l}" not in layers.yaml`);
    }
  }
}

// Funder focus_layers refs.
for (const f of funders) {
  for (const l of f.focus_layers || []) {
    if (!layerSlugs.has(l)) {
      errors.push(`funders.yaml funder "${f.slug}": focus_layer "${l}" not in layers.yaml`);
    }
  }
}

// Project layer refs.
for (const p of projects) {
  for (const l of p.layers || []) {
    if (!layerSlugs.has(l)) {
      errors.push(`projects.yaml project "${p.slug}": layer "${l}" not in layers.yaml`);
    }
  }
}

// Reading layer refs.
for (const r of readings) {
  for (const l of r.layers || []) {
    if (!layerSlugs.has(l)) {
      errors.push(`reading-lists.yaml reading "${r.title}": layer "${l}" not in layers.yaml`);
    }
  }
}

// Prediction layer refs.
for (const pr of predictions) {
  if (!layerSlugs.has(pr.layer)) {
    errors.push(`predictions.yaml prediction "${pr.claim.slice(0, 60)}...": layer "${pr.layer}" not in layers.yaml`);
  }
}

// Agent citation markers in MDX + Astro pages.
// Pattern: (Layer|Funder|Grant|Project|Reading|News: <ref>)
const CITATION_RE = /\((Layer|Funder|Grant|Project|Reading|News):\s*([^)]+)\)/g;

const scanTargets = [];
function collectMdx(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, name.name);
    if (name.isDirectory()) collectMdx(full);
    else if (
      [".mdx", ".astro"].includes(extname(name.name)) &&
      !full.includes("/news/")
    ) {
      scanTargets.push(full);
    }
  }
}
collectMdx(resolve(ROOT, "src/content"));
collectMdx(resolve(ROOT, "src/pages"));

for (const file of scanTargets) {
  const text = readFileSync(file, "utf8");
  let m;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(text)) !== null) {
    const kind = m[1].toLowerCase();
    const ref = m[2].trim();
    const rel = file.replace(ROOT + "/", "");
    let ok = false;
    switch (kind) {
      case "layer":
        ok = layerSlugs.has(ref);
        break;
      case "funder":
        ok = funderSlugs.has(ref);
        break;
      case "project":
        ok = projectSlugs.has(ref);
        break;
      case "grant":
        ok = grantTitles.has(ref);
        break;
      case "reading":
        ok = readingTitles.has(ref);
        break;
      case "news":
        ok = newsDates.has(ref);
        break;
    }
    if (!ok) {
      errors.push(`${rel}: (${m[1]}: ${ref}) does not resolve`);
    }
  }
}

if (errors.length === 0) {
  console.log("[verify_cross_refs] clean");
  process.exit(0);
} else {
  console.error(`\n[verify_cross_refs] ${errors.length} unresolved reference(s):\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
