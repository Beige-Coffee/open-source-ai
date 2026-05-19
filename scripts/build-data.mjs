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

// Unified search index for the /search page and the global Cmd+K
// popover. One JSON shaped as a flat array of typed docs; the client
// loads it once, builds a MiniSearch index, and groups hits by type.
// Kept separate from the chat agent's retrieve.ts so the user-facing
// search UI can evolve independently. The slim shape (no full MDX
// bodies for layers / news / glossary; only the first ~600 chars per
// doc) keeps the wire size bounded; the agent's deeper retrieval
// already has the full text.
function clip(s, n) {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t;
}
function stripMdx(body) {
  return (body ?? "")
    // remove import lines
    .replace(/^import .+ from .+;$/gm, "")
    // remove G-tags but keep the inner text
    .replace(/<G [^>]*>([^<]*)<\/G>/g, "$1")
    // remove any other JSX tags
    .replace(/<[^>]+>/g, "")
    // collapse markdown links to their text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // collapse multiple whitespace
    .replace(/\s+/g, " ")
    .trim();
}

try {
  const search = [];
  const layersRaw = yaml.load(readFileSync(resolve(DATA_DIR, "layers.yaml"), "utf8"));
  const projectsRaw = yaml.load(readFileSync(resolve(DATA_DIR, "projects.yaml"), "utf8"));
  const fundersRaw = yaml.load(readFileSync(resolve(DATA_DIR, "funders.yaml"), "utf8"));
  const grantsRaw = yaml.load(readFileSync(resolve(DATA_DIR, "grants.yaml"), "utf8"));
  const readingsRaw = yaml.load(readFileSync(resolve(DATA_DIR, "reading-lists.yaml"), "utf8"));
  const predictionsRaw = yaml.load(readFileSync(resolve(DATA_DIR, "predictions.yaml"), "utf8"));

  // Build a slug -> body map from the parsed layer MDXs.
  const layerBodyBySlug = Object.fromEntries(
    layerEntries.map((l) => [l.slug, l.body ?? ""]),
  );
  // Projects that have an explainer get their own /projects/<slug>
  // page; others 404 there, so route them to their primary layer page.
  const explainerSlugs = new Set(
    (projectsRaw.projects ?? [])
      .filter((p) => p.explainer && String(p.explainer).trim().length > 0)
      .map((p) => p.slug),
  );

  // Layers (core + meta)
  for (const tier of ["core", "meta"]) {
    for (const l of layersRaw[tier] ?? []) {
      const body = layerBodyBySlug[l.slug] ?? "";
      search.push({
        id: `layer:${l.slug}`,
        type: "layer",
        title: l.title,
        summary: l.short_description ?? "",
        body: clip(stripMdx(body), 600),
        url: `/stack/${l.slug}`,
        layers: [l.slug],
      });
    }
  }

  // Projects
  for (const p of projectsRaw.projects ?? []) {
    const primary = (p.layers ?? [])[0];
    const url = explainerSlugs.has(p.slug)
      ? `/projects/${p.slug}`
      : primary
        ? `/stack/${primary}#projects`
        : "/stack";
    search.push({
      id: `project:${p.slug}`,
      type: "project",
      title: p.name,
      summary: p.description ?? "",
      body: clip(`${p.description ?? ""} ${stripMdx(p.explainer ?? "")}`, 600),
      url,
      layers: p.layers ?? [],
      meta: { focus: p.focus, maturity: p.maturity, license: p.license },
    });
  }

  // Funders
  for (const f of fundersRaw.funders ?? []) {
    search.push({
      id: `funder:${f.slug}`,
      type: "funder",
      title: f.name,
      summary: f.mission ?? "",
      body: clip(`${f.mission ?? ""} ${f.notable_recent ?? ""}`, 600),
      url: `/grants/funder/${f.slug}`,
      layers: f.focus_layers ?? [],
      meta: { region: f.region, type: f.type },
    });
  }

  // Grants: route to their announcement url (external); the result
  // card still shows funder + recipient as context.
  for (const g of grantsRaw.grants ?? []) {
    search.push({
      id: `grant:${g.title}`,
      type: "grant",
      title: g.title,
      summary: g.description ?? "",
      body: clip(`${g.recipient ?? ""} ${g.description ?? ""} ${stripMdx(g.explainer ?? "")}`, 600),
      url: g.url,
      layers: g.layers ?? [],
      meta: {
        funder: g.funder,
        recipient: g.recipient,
        amount_label: g.amount_label,
        date: g.date,
        region: g.region,
      },
    });
  }

  // Glossary. The aliases field is indexed (and title-boosted) so a
  // search for "moe" surfaces the mixture-of-experts entry directly,
  // even though "moe" isn't in the canonical title.
  for (const e of glossaryEntries) {
    const slug = e.slug;
    const aliases = e.aliases ?? [];
    search.push({
      id: `glossary:${slug}`,
      type: "glossary",
      title: e.term,
      aliases: aliases.join(" "),
      summary: e.summary ?? "",
      body: clip(`${e.summary ?? ""} ${stripMdx(e.body ?? "")}`, 600),
      url: `/glossary/${slug}`,
      layers: [e.primary_layer, ...(e.secondary_layers ?? [])].filter(Boolean),
      meta: { aliases },
    });
  }

  // News: one doc per daily issue (not per item inside).
  try {
    const newsFiles = readdirSync(NEWS_DIR)
      .filter((f) => extname(f) === ".mdx")
      .sort()
      .reverse();
    for (const file of newsFiles) {
      const text = readFileSync(resolve(NEWS_DIR, file), "utf8");
      const { frontmatter, body } = parseFrontmatter(text);
      const dateStr = basename(file, ".mdx");
      search.push({
        id: `news:${dateStr}`,
        type: "news",
        title: `News issue ${dateStr}`,
        summary: frontmatter.editorial_letter ?? "",
        body: clip(stripMdx(body), 600),
        url: `/news/${dateStr}`,
        layers: Object.keys(frontmatter.layer_buckets ?? {}),
        meta: { date: dateStr, item_count: frontmatter.item_count ?? 0 },
      });
    }
  } catch (_e) { /* news dir may be empty */ }

  // Predictions: each claim is one doc.
  let predIdx = 0;
  for (const p of predictionsRaw.predictions ?? []) {
    predIdx++;
    search.push({
      id: `prediction:${predIdx}`,
      type: "prediction",
      title: clip(p.claim ?? "", 80),
      summary: p.claim ?? "",
      body: clip(`${p.claim ?? ""} ${p.resolves_when ?? ""}`, 600),
      url: `/predictions#${p.layer}`,
      layers: p.layer ? [p.layer] : [],
      meta: { horizon: p.horizon, confidence: p.confidence, filed: p.filed },
    });
  }

  // Readings: each item is one doc; url is the reading itself.
  let readIdx = 0;
  for (const r of readingsRaw.readings ?? []) {
    readIdx++;
    search.push({
      id: `reading:${readIdx}`,
      type: "reading",
      title: r.title,
      summary: r.description ?? "",
      body: clip(`${r.source ?? ""} ${r.description ?? ""}`, 600),
      url: r.url,
      layers: r.layers ?? [],
      meta: { source: r.source, type: r.type, year: r.year },
    });
  }

  writeFileSync(
    resolve(OUT_DIR, "search-index.json"),
    JSON.stringify({
      version: 1,
      generated_at: new Date().toISOString(),
      docs: search,
    }),
  );
  console.log(`[build-data] search-index.json (${search.length} docs)`);
  total++;
} catch (e) {
  console.warn(`[build-data] search index skipped: ${e.message}`);
}

console.log(`[build-data] done, ${total} files written`);
