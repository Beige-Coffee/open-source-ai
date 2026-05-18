#!/usr/bin/env node
/**
 * Claim extractor.
 *
 * Reads a source file (YAML data file, MDX layer overview, or Astro
 * page) and writes one row per atomic decontextualized claim to
 * audit/CLAIMS_LEDGER.md.
 *
 * Uses Claude as the extractor (per the RUNBOOK; the verifier will
 * use a different model family to avoid self-preference bias).
 *
 * Reads env: ANTHROPIC_API_KEY (required).
 *
 * Usage:
 *   node audit/extract/extract.mjs <source-file-rel-path>
 *   node audit/extract/extract.mjs data/funders.yaml
 *   node audit/extract/extract.mjs data/funders.yaml --slug hrf
 *   node audit/extract/extract.mjs data/projects.yaml --slug vllm
 *   node audit/extract/extract.mjs src/content/layers/silicon.mdx
 *   node audit/extract/extract.mjs --all-priority  (extract all priority sources)
 *
 * Output is appended to audit/CLAIMS_LEDGER.md with verdict
 * `needs_verification`. Run `npm run audit:verify` afterward to
 * verify the new rows.
 *
 * The extractor is idempotent at the source level: if you re-run on
 * the same source whose content hash hasn't changed since the last
 * extraction, no new rows are added. Source content hashes are
 * tracked in audit/extract/.last_extracted.json.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const LEDGER_PATH = resolve(ROOT, "audit/CLAIMS_LEDGER.md");
const STATE_PATH = resolve(__dirname, ".last_extracted.json");
const EXTRACTION_PROMPT_PATH = resolve(ROOT, "audit/EXTRACTION_PROMPT.md");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("[extract] ANTHROPIC_API_KEY required");
  process.exit(2);
}

const client = new Anthropic({ apiKey });
const EXTRACTOR_MODEL = process.env.AUDIT_EXTRACTOR_MODEL || "claude-sonnet-4-6";
const EXTRACTION_PROMPT = readFileSync(EXTRACTION_PROMPT_PATH, "utf8");
const PROMPT_VERSION = "v1.0-2026-05-14";

function sourceHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { sources: {} };
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ----------------------------------------------------------------------
// Source loaders -- one per file type. Each returns an array of
// { recordKey, recordText, surface, location, citedSources }.
// ----------------------------------------------------------------------

function loadYamlRecords(relPath) {
  const text = readFileSync(resolve(ROOT, relPath), "utf8");
  const parsed = yaml.load(text);
  const base = basename(relPath, ".yaml");

  // Map each top-level array to records.
  const arrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
  if (!arrayKey) return [];

  const records = [];
  for (const r of parsed[arrayKey]) {
    const key = r.slug || r.title || r.id || JSON.stringify(r).slice(0, 40);
    // Build the "record text" — the prose-bearing fields per file kind.
    let recordText;
    let cited = [];
    if (base === "funders") {
      recordText = `Funder: ${r.name} (${r.slug})
Mission: ${r.mission}
Funding range: ${r.funding_range}
Cadence: ${r.cadence}
Process: ${r.process}
Notable recent: ${r.notable_recent}
URL: ${r.url}`;
      cited.push(r.url);
      for (const s of r.sources || []) cited.push(s.url);
    } else if (base === "grants") {
      recordText = `Grant: ${r.title} (kind=${r.kind})
Funder: ${r.funder}
Recipient: ${r.recipient}
Date: ${r.date}
Amount: ${r.amount_label}${r.amount_usd ? ` (${r.amount_usd} USD)` : ""}
Layers: ${(r.layers || []).join(", ")}
Region: ${r.region}
Description: ${r.description}
URL: ${r.url}`;
      cited.push(r.url);
      for (const s of r.sources || []) cited.push(s.url);
    } else if (base === "projects") {
      recordText = `Project: ${r.name} (${r.slug})
Layers: ${(r.layers || []).join(", ")}
License: ${r.license}
Focus: ${r.focus}
Maturity: ${r.maturity}
Description: ${r.description}${r.explainer ? `

Explainer:
${r.explainer}` : ""}
URL: ${r.url}${r.github ? ` / GitHub: ${r.github}` : ""}`;
      cited.push(r.url);
      if (r.github) cited.push(r.github);
      for (const s of r.sources || []) cited.push(s.url);
    } else if (base === "reading-lists") {
      recordText = `Reading: ${r.title}
Source: ${r.source}
Type: ${r.type} (${r.year})
Layers: ${(r.layers || []).join(", ")}
Description: ${r.description}
URL: ${r.url}`;
      if (String(r.url).startsWith("http")) cited.push(r.url);
    } else if (base === "predictions") {
      recordText = `Prediction (layer=${r.layer}, confidence=${r.confidence}/5):
Claim: ${r.claim}
Horizon: ${r.horizon}
Resolves when: ${r.resolves_when}
Filed: ${r.filed}`;
    } else {
      recordText = JSON.stringify(r, null, 2);
    }

    records.push({
      recordKey: key,
      recordText,
      surface: `yaml-${base.replace(/s$/, "")}`,
      location: `${relPath} (record=${key})`,
      citedSources: cited.filter(Boolean).join(", "),
    });
  }
  return records;
}

function loadMdxBody(relPath) {
  const text = readFileSync(resolve(ROOT, relPath), "utf8");
  // Strip frontmatter.
  const m = text.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = m ? m[1] : text;
  return [
    {
      recordKey: basename(relPath, extname(relPath)),
      recordText: body.trim(),
      surface: relPath.includes("layers/") ? "mdx-layer" : "mdx",
      location: relPath,
      citedSources: "",
    },
  ];
}

function loadAstroProse(relPath) {
  const text = readFileSync(resolve(ROOT, relPath), "utf8");
  // Pull <p>...</p> blocks; tolerant of newlines.
  const blocks = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (inner.length > 60) blocks.push(inner);
  }
  if (blocks.length === 0) return [];
  return [
    {
      recordKey: basename(relPath, extname(relPath)),
      recordText: blocks.join("\n\n"),
      surface: "astro-page",
      location: relPath,
      citedSources: "",
    },
  ];
}

function loadRecords(relPath, slugFilter) {
  let records;
  if (relPath.endsWith(".yaml")) records = loadYamlRecords(relPath);
  else if (relPath.endsWith(".mdx")) records = loadMdxBody(relPath);
  else if (relPath.endsWith(".astro")) records = loadAstroProse(relPath);
  else return [];
  if (slugFilter) records = records.filter((r) => r.recordKey === slugFilter);
  return records;
}

// ----------------------------------------------------------------------
// Extractor call
// ----------------------------------------------------------------------

async function extractFromRecord(record) {
  const userMessage = `Source file: ${record.location}
Surface: ${record.surface}
Record key: ${record.recordKey}
Already-cited sources (use as candidates for the Cited sources column when claims trace there): ${record.citedSources || "(none)"}

Record text:
"""
${record.recordText}
"""

Extract every checkable atomic claim in this record per the rules above. Output ONLY a JSON array (no prose around it) of objects with this shape:

[
  {
    "id_suffix": "001",
    "claim": "Decontextualized atomic claim, ≤200 chars",
    "lane": "factual" | "framing" | "prediction",
    "type": "amount" | "count" | "date" | "attribution" | "license" | "deployer" | "spec" | "cross-reference" | "tag-value" | "framing-prose" | "prediction-prose",
    "cited_sources": "comma-separated URLs from the record",
    "note": "≤120 chars decomposition context"
  },
  ...
]

If the record contains no checkable claims (pure framing prose with no embedded facts), return [].`;

  const res = await client.messages.create({
    model: EXTRACTOR_MODEL,
    max_tokens: 4000,
    system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) {
    console.warn(`  [extract] ${record.recordKey}: no JSON array in response`);
    return [];
  }
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    console.warn(`  [extract] ${record.recordKey}: JSON parse failed: ${e.message}`);
    return [];
  }
}

// ----------------------------------------------------------------------
// Ledger append
// ----------------------------------------------------------------------

function loadLedgerText() {
  return readFileSync(LEDGER_PATH, "utf8");
}
function appendRows(rows) {
  let text = loadLedgerText();
  // Ensure trailing newline.
  if (!text.endsWith("\n")) text += "\n";
  for (const r of rows) {
    text += `| ${r.id} | ${r.surface} | ${r.location} | ${esc(r.claim)} | ${r.lane} | ${r.type} | ${esc(r.cited_sources)} | needs_verification |  | ${esc(r.note)} |\n`;
  }
  writeFileSync(LEDGER_PATH, text);
}

function esc(s) {
  if (!s) return "";
  return String(s).replace(/\|/g, "/").replace(/\n/g, " ").trim().slice(0, 400);
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

const args = process.argv.slice(2);

function flagValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const allPriority = args.includes("--all-priority");
const positional = args.find((a) => !a.startsWith("--") && a !== flagValue("--slug"));

const slugFilter = flagValue("--slug");

const filesToProcess = [];
if (allPriority) {
  filesToProcess.push(
    "data/funders.yaml",
    "data/grants.yaml",
    "data/projects.yaml",
    "data/reading-lists.yaml",
    "data/predictions.yaml",
  );
  // Layer MDX files.
  const layersDir = resolve(ROOT, "src/content/layers");
  for (const f of readdirSync(layersDir)) {
    if (extname(f) === ".mdx") {
      filesToProcess.push(`src/content/layers/${f}`);
    }
  }
} else if (positional) {
  filesToProcess.push(positional);
} else {
  console.error("Usage: node audit/extract/extract.mjs <source-file> [--slug X] | --all-priority");
  process.exit(1);
}

const state = loadState();

for (const relPath of filesToProcess) {
  console.log(`[extract] processing ${relPath}${slugFilter ? ` (slug=${slugFilter})` : ""}`);
  const records = loadRecords(relPath, slugFilter);
  if (records.length === 0) {
    console.log(`  no records`);
    continue;
  }
  console.log(`  ${records.length} record(s)`);

  let i = 0;
  for (const record of records) {
    i++;
    const recHash = sourceHash(record.recordText);
    const stateKey = `${relPath}::${record.recordKey}`;
    if (state.sources[stateKey] === recHash && !slugFilter) {
      console.log(`  [${i}/${records.length}] ${record.recordKey}: unchanged, skipping`);
      continue;
    }

    let extracted;
    try {
      extracted = await extractFromRecord(record);
    } catch (e) {
      console.error(`  [${i}/${records.length}] ${record.recordKey}: extractor error: ${e.message ?? e}`);
      continue;
    }

    const recordIdBase = `${basename(relPath, extname(relPath))}.${record.recordKey}`;
    const rows = extracted.map((claim) => ({
      id: `${recordIdBase}.${claim.id_suffix || String(Math.random()).slice(2, 6)}`,
      surface: record.surface,
      location: record.location,
      claim: claim.claim,
      lane: claim.lane,
      type: claim.type,
      cited_sources: claim.cited_sources || record.citedSources,
      note: `${claim.note ?? ""} [extractor=${EXTRACTOR_MODEL} prompt=${PROMPT_VERSION}]`,
    }));
    appendRows(rows);
    state.sources[stateKey] = recHash;
    saveState(state);
    console.log(`  [${i}/${records.length}] ${record.recordKey}: ${rows.length} claim(s) extracted`);
  }
}

console.log("[extract] done");
