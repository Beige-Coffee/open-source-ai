#!/usr/bin/env node
/**
 * Convert all data/*.yaml files into public/data/*.json so the
 * client-side chat agent can fetch them at runtime.
 *
 * Also reads the latest news MDX issue and writes a structured
 * public/data/today-news.json for the today_news() tool.
 *
 * Runs as a prebuild / predev step (see package.json).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");
const OUT_DIR = resolve(ROOT, "public/data");
const NEWS_DIR = resolve(ROOT, "src/content/news");
const LAYERS_DIR = resolve(ROOT, "src/content/layers");
const GLOSSARY_DIR = resolve(ROOT, "src/content/glossary");

mkdirSync(OUT_DIR, { recursive: true });

// Files to copy verbatim from YAML to JSON.
const YAML_FILES = [
  "layers.yaml",
  "projects.yaml",
  "funders.yaml",
  "grants.yaml",
  "underfunded.yaml",
  "reading-lists.yaml",
  "predictions.yaml",
];

let total = 0;
for (const file of YAML_FILES) {
  const src = resolve(DATA_DIR, file);
  let text;
  try {
    text = readFileSync(src, "utf8");
  } catch (e) {
    console.warn(`[build-data] skip ${file}: ${e.message}`);
    continue;
  }
  const parsed = yaml.load(text);
  const outName = basename(file, ".yaml") + ".json";
  const outPath = resolve(OUT_DIR, outName);
  writeFileSync(outPath, JSON.stringify(parsed, null, 0));
  console.log(`[build-data] ${file} -> public/data/${outName}`);
  total++;
}

// Parse layer MDX files to capture their intro prose for the agent.
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: text };
  return { frontmatter: yaml.load(m[1]) ?? {}, body: m[2].trim() };
}

const layerEntries = [];
try {
  for (const f of readdirSync(LAYERS_DIR)) {
    if (extname(f) !== ".mdx") continue;
    const text = readFileSync(resolve(LAYERS_DIR, f), "utf8");
    const { frontmatter, body } = parseFrontmatter(text);
    layerEntries.push({ ...frontmatter, body });
  }
  writeFileSync(
    resolve(OUT_DIR, "layer-content.json"),
    JSON.stringify(layerEntries, null, 0),
  );
  console.log(`[build-data] layers/*.mdx -> public/data/layer-content.json (${layerEntries.length})`);
  total++;
} catch (e) {
  console.warn(`[build-data] layer content skipped: ${e.message}`);
}

// Parse glossary MDX entries into structured JSON for the chat agent.
const glossaryEntries = [];
try {
  for (const f of readdirSync(GLOSSARY_DIR)) {
    if (extname(f) !== ".mdx") continue;
    const text = readFileSync(resolve(GLOSSARY_DIR, f), "utf8");
    const { frontmatter, body } = parseFrontmatter(text);
    const slug = basename(f, ".mdx");
    glossaryEntries.push({ slug, ...frontmatter, body });
  }
  writeFileSync(
    resolve(OUT_DIR, "glossary.json"),
    JSON.stringify(glossaryEntries, null, 0),
  );
  console.log(`[build-data] glossary/*.mdx -> public/data/glossary.json (${glossaryEntries.length})`);
  total++;
} catch (e) {
  console.warn(`[build-data] glossary skipped: ${e.message}`);
}

// Parse the latest news MDX into structured form for today_news().
try {
  const newsFiles = readdirSync(NEWS_DIR)
    .filter((f) => extname(f) === ".mdx")
    .sort()
    .reverse();
  if (newsFiles.length === 0) {
    writeFileSync(resolve(OUT_DIR, "today-news.json"), "null");
  } else {
    const latest = newsFiles[0];
    const text = readFileSync(resolve(NEWS_DIR, latest), "utf8");
    const { frontmatter, body } = parseFrontmatter(text);
    const dateStr = basename(latest, ".mdx");
    writeFileSync(
      resolve(OUT_DIR, "today-news.json"),
      JSON.stringify(
        {
          date: dateStr,
          editorial_letter: frontmatter.editorial_letter ?? "",
          item_count: frontmatter.item_count ?? 0,
          layer_buckets: frontmatter.layer_buckets ?? {},
          body,
        },
        null,
        0,
      ),
    );
    console.log(`[build-data] news/${latest} -> public/data/today-news.json`);
    total++;
  }
} catch (e) {
  console.warn(`[build-data] news content skipped: ${e.message}`);
}

console.log(`[build-data] done, ${total} files written`);
