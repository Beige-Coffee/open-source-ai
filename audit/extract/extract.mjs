#!/usr/bin/env node
/**
 * Claim extractor (in-session mode).
 *
 * No API key. This script does NOT call an LLM. It loads source
 * records (YAML rows, MDX bodies, page prose), prints the extraction
 * prompt + record text for the in-session Claude agent to process,
 * then persists the resulting claims back to audit/CLAIMS_LEDGER.md.
 *
 * Subcommands:
 *
 *   pending [--all-priority]
 *     List records whose content has changed since last extraction.
 *     Prints JSON to stdout.
 *
 *   show <relPath> [--slug X]
 *     Print the extraction prompt + record text for the agent.
 *     One record only when --slug is set; otherwise iterates the
 *     file's records.
 *
 *   batch [--limit N] [--all-priority]
 *     Print prompts for up to N pending records as a single stream
 *     so the agent can process a batch in one turn.
 *
 *   append <relPath> <recordKey> < claims.json
 *     Read a JSON array of claims from stdin, append rows to the
 *     ledger, update the hash-state file so the record is not
 *     re-extracted on the next pending check.
 *
 *   mark-extracted <relPath> <recordKey>
 *     Update hash state without appending rows (use when the record
 *     legitimately has zero extractable claims).
 *
 * The agent's loop:
 *   1. node audit/extract/extract.mjs batch --limit 10 --all-priority
 *   2. For each printed prompt, generate the JSON array of claims
 *      in-session.
 *   3. echo '<json>' | node audit/extract/extract.mjs append <relPath> <recordKey>
 *
 * The extractor is idempotent at the source level: re-running on a
 * record whose content hash hasn't changed is a no-op. State lives in
 * audit/extract/.last_extracted.json.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const LEDGER_PATH = resolve(ROOT, "audit/CLAIMS_LEDGER.md");
const STATE_PATH = resolve(__dirname, ".last_extracted.json");
const EXTRACTION_PROMPT_PATH = resolve(ROOT, "audit/EXTRACTION_PROMPT.md");
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
  const arrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
  if (!arrayKey) return [];

  const records = [];
  for (const r of parsed[arrayKey]) {
    const key = r.slug || r.title || r.id || JSON.stringify(r).slice(0, 40);
    let recordText;
    const cited = [];
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

function priorityFiles() {
  const files = [
    "data/funders.yaml",
    "data/grants.yaml",
    "data/projects.yaml",
    "data/reading-lists.yaml",
    "data/predictions.yaml",
  ];
  const layersDir = resolve(ROOT, "src/content/layers");
  for (const f of readdirSync(layersDir)) {
    if (extname(f) === ".mdx") files.push(`src/content/layers/${f}`);
  }
  return files;
}

// ----------------------------------------------------------------------
// Ledger append
// ----------------------------------------------------------------------

function appendRows(rows) {
  let text = readFileSync(LEDGER_PATH, "utf8");
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
// Prompt rendering
// ----------------------------------------------------------------------

function renderPrompt(record, compact = false) {
  const header = compact
    ? ``
    : `=== EXTRACTION SYSTEM PROMPT ===

${EXTRACTION_PROMPT}

`;
  const task = compact
    ? `Append claims for this record via:
  echo '<json-array>' | node audit/extract/extract.mjs append ${asArg(record.location)} ${asArg(record.recordKey)}
`
    : `=== TASK ===

Extract every checkable atomic claim in this record per the rules above. Output ONLY a JSON array (no prose around it) of objects with this shape:

[
  {
    "id_suffix": "001",
    "claim": "Decontextualized atomic claim, <=200 chars",
    "lane": "factual" | "framing" | "prediction",
    "type": "amount" | "count" | "date" | "attribution" | "license" | "deployer" | "spec" | "cross-reference" | "tag-value" | "framing-prose" | "prediction-prose",
    "cited_sources": "comma-separated URLs from the record",
    "note": "<=120 chars decomposition context"
  }
]

If the record contains no checkable claims (pure framing prose with no embedded facts), return [].

When the agent has produced the JSON array, persist with:
  echo '<json-array>' | node audit/extract/extract.mjs append ${asArg(record.location)} ${asArg(record.recordKey)}
`;
  return `${header}=== RECORD ===

Source file: ${record.location}
Surface: ${record.surface}
Record key: ${record.recordKey}
Already-cited sources (use as candidates for the Cited sources column when claims trace there): ${record.citedSources || "(none)"}

Record text:
"""
${record.recordText}
"""

${task}`;
}
function asArg(s) {
  // Strip the " (record=...)" suffix from location to recover relPath.
  if (s.includes(" (record=")) return s.split(" (record=")[0];
  return s;
}

// ----------------------------------------------------------------------
// Subcommands
// ----------------------------------------------------------------------

function cmdPending(args) {
  const allPriority = args.includes("--all-priority");
  const files = allPriority ? priorityFiles() : args.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error("usage: extract.mjs pending <file> [<file>...] | --all-priority");
    process.exit(1);
  }
  const state = loadState();
  const pending = [];
  for (const relPath of files) {
    const records = loadRecords(relPath);
    for (const r of records) {
      const h = sourceHash(r.recordText);
      const k = `${relPath}::${r.recordKey}`;
      if (state.sources[k] !== h) {
        pending.push({ relPath, recordKey: r.recordKey, surface: r.surface });
      }
    }
  }
  console.log(JSON.stringify({ count: pending.length, pending }, null, 2));
}

function cmdShow(args) {
  const relPath = args.find((a) => !a.startsWith("--"));
  if (!relPath) {
    console.error("usage: extract.mjs show <relPath> [--slug X]");
    process.exit(1);
  }
  const slugIdx = args.indexOf("--slug");
  const slug = slugIdx >= 0 ? args[slugIdx + 1] : null;
  const records = loadRecords(relPath, slug);
  if (records.length === 0) {
    console.error(`no records for ${relPath}${slug ? ` slug=${slug}` : ""}`);
    process.exit(1);
  }
  for (const r of records) {
    console.log(renderPrompt(r));
    console.log("\n=== END RECORD ===\n");
  }
}

function cmdBatch(args) {
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 10;
  const allPriority = args.includes("--all-priority");
  const compact = args.includes("--compact");
  const files = allPriority
    ? priorityFiles()
    : args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--limit");
  if (files.length === 0) {
    console.error("usage: extract.mjs batch [--limit N] [--all-priority] [--compact] [<file>...]");
    process.exit(1);
  }
  const state = loadState();
  // In compact mode, print the system prompt once at the top.
  if (compact) {
    console.log("=== EXTRACTION SYSTEM PROMPT (applies to ALL records below) ===");
    console.log();
    console.log(EXTRACTION_PROMPT);
    console.log("\n=== END SYSTEM PROMPT ===\n");
    console.log("For each RECORD below, produce a JSON array of claims per the schema in the system prompt, then append via the command shown after the record.\n");
  }
  let emitted = 0;
  for (const relPath of files) {
    if (emitted >= limit) break;
    const records = loadRecords(relPath);
    for (const r of records) {
      if (emitted >= limit) break;
      const h = sourceHash(r.recordText);
      const k = `${relPath}::${r.recordKey}`;
      if (state.sources[k] === h) continue;
      console.log(renderPrompt(r, compact));
      console.log("\n=== END RECORD ===\n");
      emitted++;
    }
  }
  if (emitted === 0) {
    console.log("# No pending records. All sources already extracted.");
  } else {
    console.error(`[extract] emitted ${emitted} record prompt(s)`);
  }
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

async function cmdAppend(args) {
  const [relPath, recordKey] = args.filter((a) => !a.startsWith("--"));
  if (!relPath || !recordKey) {
    console.error("usage: echo '<json>' | extract.mjs append <relPath> <recordKey>");
    process.exit(1);
  }
  const stdin = await readStdin();
  const m = stdin.match(/\[[\s\S]*\]/);
  if (!m) {
    console.error("[extract] no JSON array on stdin");
    process.exit(1);
  }
  let claims;
  try {
    claims = JSON.parse(m[0]);
  } catch (e) {
    console.error(`[extract] JSON parse failed: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(claims)) {
    console.error("[extract] stdin is not a JSON array");
    process.exit(1);
  }

  // Find the record to compute its hash + grab citedSources fallback.
  const records = loadRecords(relPath, recordKey);
  if (records.length === 0) {
    console.error(`[extract] record not found: ${relPath} / ${recordKey}`);
    process.exit(1);
  }
  const record = records[0];
  const recHash = sourceHash(record.recordText);

  const recordIdBase = `${basename(relPath, extname(relPath))}.${recordKey}`;
  const rows = claims.map((claim, i) => ({
    id: `${recordIdBase}.${claim.id_suffix || String(i + 1).padStart(3, "0")}`,
    surface: record.surface,
    location: record.location,
    claim: claim.claim,
    lane: claim.lane,
    type: claim.type,
    cited_sources: claim.cited_sources || record.citedSources,
    note: `${claim.note ?? ""} [extractor=in-session prompt=${PROMPT_VERSION}]`,
  }));
  appendRows(rows);

  const state = loadState();
  state.sources[`${relPath}::${recordKey}`] = recHash;
  saveState(state);

  console.log(`[extract] ${recordKey}: appended ${rows.length} claim(s), state updated`);
}

// Mechanical extraction for record types where the atomic claim is
// pattern-derivable (no LLM needed). Currently handles:
//   data/predictions.yaml  - one prediction-lane row per record
//   data/reading-lists.yaml - one factual cross-reference row per record
function cmdMechanical(args) {
  const relPath = args.find((a) => !a.startsWith("--"));
  if (!relPath) {
    console.error("usage: extract.mjs mechanical <relPath>");
    process.exit(1);
  }
  if (!relPath.endsWith("predictions.yaml") && !relPath.endsWith("reading-lists.yaml")) {
    console.error(`[extract] mechanical only supports predictions.yaml / reading-lists.yaml`);
    process.exit(1);
  }
  const records = loadRecords(relPath);
  const state = loadState();
  let totalRows = 0;
  let totalRecs = 0;
  for (const r of records) {
    const h = sourceHash(r.recordText);
    const k = `${relPath}::${r.recordKey}`;
    if (state.sources[k] === h) continue;

    const recordIdBase = `${basename(relPath, extname(relPath))}.${r.recordKey}`;
    let rows = [];
    if (relPath.endsWith("predictions.yaml")) {
      // Parse the recordText to pull claim + horizon + filed.
      const claimMatch = r.recordText.match(/Claim:\s*(.+?)(?:\n|$)/);
      const horizonMatch = r.recordText.match(/Horizon:\s*(.+?)(?:\n|$)/);
      const filedMatch = r.recordText.match(/Filed:\s*(.+?)(?:\n|$)/);
      const claim = claimMatch ? claimMatch[1].trim() : r.recordText.slice(0, 200);
      const horizon = horizonMatch ? horizonMatch[1].trim() : "unknown";
      const filed = filedMatch ? filedMatch[1].trim() : "unknown";
      rows.push({
        id: `${recordIdBase}.001`,
        surface: r.surface,
        location: r.location,
        claim: `${claim} (horizon: ${horizon}, filed: ${filed})`,
        lane: "prediction",
        type: "prediction-prose",
        cited_sources: "",
        note: `[extractor=mechanical prompt=v1.0-2026-05-14]`,
      });
    } else if (relPath.endsWith("reading-lists.yaml")) {
      // The reading record asserts: the URL exists and matches its
      // claimed title/source/type/year. One existence row.
      const titleMatch = r.recordText.match(/Reading:\s*(.+?)(?:\n|$)/);
      const sourceMatch = r.recordText.match(/Source:\s*(.+?)(?:\n|$)/);
      const typeYearMatch = r.recordText.match(/Type:\s*(.+?)\s*\(([\d]+)\)/);
      const urlMatch = r.recordText.match(/URL:\s*(.+?)(?:\n|$)/);
      const title = titleMatch ? titleMatch[1].trim() : r.recordKey;
      const src = sourceMatch ? sourceMatch[1].trim() : "unknown source";
      const type = typeYearMatch ? typeYearMatch[1].trim() : "unknown";
      const year = typeYearMatch ? typeYearMatch[2].trim() : "unknown";
      const url = urlMatch ? urlMatch[1].trim() : "";
      const isHttp = String(url).startsWith("http");
      rows.push({
        id: `${recordIdBase}.001`,
        surface: r.surface,
        location: r.location,
        claim: `Reading "${title}" by ${src}, published ${year} as ${type}, is available at ${url}`,
        lane: "factual",
        type: "attribution",
        cited_sources: isHttp ? url : "",
        note: `[extractor=mechanical prompt=v1.0-2026-05-14] reading existence + metadata`,
      });
    }
    appendRows(rows);
    state.sources[k] = h;
    totalRows += rows.length;
    totalRecs += 1;
  }
  saveState(state);
  console.log(`[extract] mechanical ${relPath}: ${totalRecs} record(s), ${totalRows} row(s) appended`);
}

function cmdMarkExtracted(args) {
  const [relPath, recordKey] = args.filter((a) => !a.startsWith("--"));
  if (!relPath || !recordKey) {
    console.error("usage: extract.mjs mark-extracted <relPath> <recordKey>");
    process.exit(1);
  }
  const records = loadRecords(relPath, recordKey);
  if (records.length === 0) {
    console.error(`[extract] record not found: ${relPath} / ${recordKey}`);
    process.exit(1);
  }
  const state = loadState();
  state.sources[`${relPath}::${recordKey}`] = sourceHash(records[0].recordText);
  saveState(state);
  console.log(`[extract] ${recordKey}: marked extracted (0 claims)`);
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

const [sub, ...rest] = process.argv.slice(2);
switch (sub) {
  case "pending": cmdPending(rest); break;
  case "show": cmdShow(rest); break;
  case "batch": cmdBatch(rest); break;
  case "append": await cmdAppend(rest); break;
  case "mark-extracted": cmdMarkExtracted(rest); break;
  case "mechanical": cmdMechanical(rest); break;
  default:
    console.error(`Usage: extract.mjs <subcommand>

Subcommands:
  pending [--all-priority] [<file>...]    list records needing extraction
  show <relPath> [--slug X]               print extraction prompt + record text
  batch [--limit N] [--all-priority]      print prompts for N pending records
  append <relPath> <recordKey> < json     read claims JSON from stdin, append + mark
  mark-extracted <relPath> <recordKey>    mark a zero-claim record extracted

This script does NOT call any LLM. The agent reads the printed prompt,
generates the claims JSON in-session, then pipes it back via 'append'.`);
    process.exit(sub ? 1 : 0);
}
