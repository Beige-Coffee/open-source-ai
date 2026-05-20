#!/usr/bin/env node
/**
 * Extract checkable claims from data/models.yaml into CLAIMS_LEDGER.md
 * rows. Idempotent: an ID already present in the ledger is skipped, so
 * re-running after adding a new model only appends the new model's
 * rows.
 *
 * One row per checkable claim. Claim ID convention:
 *
 *   models.<slug>.released_date
 *   models.<slug>.params_total
 *   models.<slug>.params_active
 *   models.<slug>.context_window
 *   models.<slug>.experts
 *   models.<slug>.pretraining_tokens
 *   models.<slug>.bench.<benchmark_slug>
 *   models.<slug>.innovation.<idx>
 *
 * All rows start at `needs_verification`; the existing verify pipeline
 * (audit/verify/verify_entailment.mjs) picks them up batch-by-batch
 * against the snapshot store.
 *
 * Usage:
 *   node audit/extract-models.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MODELS_PATH = resolve(ROOT, "data/models.yaml");
const LEDGER_PATH = resolve(ROOT, "audit/CLAIMS_LEDGER.md");

const TODAY = new Date().toISOString().slice(0, 10);

function todayISO() {
  return TODAY;
}

function primarySource(m) {
  if (m.sources && m.sources.length > 0) return m.sources[0].url;
  return "";
}

function toISODate(v) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function row(id, surface, location, claim, lane, type, source, notes = "") {
  // Pipe-escape any | characters in claim/notes that would break the
  // markdown table.
  const safe = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return `| ${id} | ${surface} | ${location} | ${safe(claim)} | ${lane} | ${type} | ${source} | needs_verification |  | ${safe(notes)} |`;
}

function rowsForModel(m) {
  const slug = m.slug;
  const surface = "yaml-model";
  const location = `data/models.yaml (record=${slug})`;
  const primary = primarySource(m);
  const rows = [];

  // Released date — factual / date.
  if (m.released_date) {
    rows.push(row(
      `models.${slug}.released_date`,
      surface, location,
      `${m.display_name} was released on ${toISODate(m.released_date)}`,
      "factual", "date", primary,
      "released_date schema field",
    ));
  }

  // Total params — factual / amount. Skip when zero (proprietary
  // models with undisclosed params).
  if (m.params_total > 0) {
    rows.push(row(
      `models.${slug}.params_total`,
      surface, location,
      `${m.display_name} has ${m.params_total.toLocaleString()} total parameters`,
      "factual", "amount", primary,
      "params_total schema field",
    ));
  }
  if (m.params_active > 0 && m.params_active !== m.params_total) {
    rows.push(row(
      `models.${slug}.params_active`,
      surface, location,
      `${m.display_name} activates ${m.params_active.toLocaleString()} parameters per forward pass`,
      "factual", "amount", primary,
      "params_active schema field (MoE)",
    ));
  }

  // Context window.
  if (m.context_window) {
    rows.push(row(
      `models.${slug}.context_window`,
      surface, location,
      `${m.display_name} has a ${m.context_window.toLocaleString()}-token native context window`,
      "factual", "amount", primary,
      "context_window schema field",
    ));
  }

  // Experts (MoE).
  if (m.experts) {
    rows.push(row(
      `models.${slug}.experts`,
      surface, location,
      `${m.display_name} uses ${m.experts} routed experts with ${m.experts_active ?? "?"} active per token`,
      "factual", "attribution", primary,
      "experts + experts_active schema fields",
    ));
  }

  // Pretraining tokens.
  if (m.pretraining_tokens) {
    rows.push(row(
      `models.${slug}.pretraining_tokens`,
      surface, location,
      `${m.display_name} was pretrained on approximately ${m.pretraining_tokens.toLocaleString()} tokens`,
      "factual", "amount", primary,
      "pretraining_tokens schema field",
    ));
  }

  // Benchmark scores. Each carries its own source URL.
  if (m.benchmarks) {
    for (const [bSlug, b] of Object.entries(m.benchmarks)) {
      if (!b || typeof b.score !== "number") continue;
      const benchSource = b.source ?? primary;
      const asOf = toISODate(b.as_of);
      rows.push(row(
        `models.${slug}.bench.${bSlug}`,
        surface, location,
        `${m.display_name} scored ${b.score} on ${bSlug} (as of ${asOf})`,
        "factual", "benchmark", benchSource,
        "benchmark schema field with per-score source",
      ));
    }
  }

  // Notable innovations — framing lane.
  if (Array.isArray(m.notable_innovations)) {
    m.notable_innovations.forEach((inv, i) => {
      rows.push(row(
        `models.${slug}.innovation.${i}`,
        surface, location,
        `${m.display_name}'s notable innovation: ${inv}`,
        "framing", "attribution", primary,
        "notable_innovations schema field",
      ));
    });
  }

  // Reception quotes — factual / attribution (who said what, where).
  if (Array.isArray(m.reception)) {
    m.reception.forEach((r, i) => {
      rows.push(row(
        `models.${slug}.reception.${i}`,
        surface, location,
        `${r.author} said about ${m.display_name}: "${r.quote.slice(0, 100)}${r.quote.length > 100 ? "..." : ""}"`,
        "factual", "attribution", r.url,
        `reception schema field; date=${toISODate(r.date)}`,
      ));
    });
  }

  // Cost — factual / amount. Source is whatever the schema field
  // points to (Artificial Analysis URL or lab pricing page).
  if (m.cost && m.cost.input_per_mtok_usd !== undefined) {
    rows.push(row(
      `models.${slug}.cost.input`,
      surface, location,
      `${m.display_name} input price: $${m.cost.input_per_mtok_usd} per million tokens (vendor=${m.cost.vendor ?? "?"}, as of ${toISODate(m.cost.as_of)})`,
      "factual", "amount", m.cost.source,
      "cost.input_per_mtok_usd schema field",
    ));
  }
  if (m.cost && m.cost.output_per_mtok_usd !== undefined) {
    rows.push(row(
      `models.${slug}.cost.output`,
      surface, location,
      `${m.display_name} output price: $${m.cost.output_per_mtok_usd} per million tokens (vendor=${m.cost.vendor ?? "?"}, as of ${toISODate(m.cost.as_of)})`,
      "factual", "amount", m.cost.source,
      "cost.output_per_mtok_usd schema field",
    ));
  }

  // Speed — factual / amount.
  if (m.speed && m.speed.tokens_per_sec_output !== undefined) {
    rows.push(row(
      `models.${slug}.speed.output_tps`,
      surface, location,
      `${m.display_name} output throughput: ${m.speed.tokens_per_sec_output} tokens/sec (vendor=${m.speed.vendor ?? "?"}, as of ${toISODate(m.speed.as_of)})`,
      "factual", "amount", m.speed.source,
      "speed.tokens_per_sec_output schema field",
    ));
  }
  if (m.speed && m.speed.ttft_ms !== undefined) {
    rows.push(row(
      `models.${slug}.speed.ttft`,
      surface, location,
      `${m.display_name} time-to-first-token: ${m.speed.ttft_ms} ms (vendor=${m.speed.vendor ?? "?"}, as of ${toISODate(m.speed.as_of)})`,
      "factual", "amount", m.speed.source,
      "speed.ttft_ms schema field",
    ));
  }

  // Lineage parent / children — factual / attribution.
  if (m.lineage?.parent) {
    rows.push(row(
      `models.${slug}.lineage.parent`,
      surface, location,
      `${m.display_name} is derived from ${m.lineage.parent}`,
      "factual", "attribution", primary,
      "lineage.parent schema field",
    ));
  }
  if (Array.isArray(m.lineage?.children)) {
    m.lineage.children.forEach((c, i) => {
      rows.push(row(
        `models.${slug}.lineage.child.${i}`,
        surface, location,
        `${m.display_name} has derivative: ${c}`,
        "factual", "attribution", primary,
        "lineage.children schema field",
      ));
    });
  }

  // Recommended use cases — framing lane (subjective).
  if (Array.isArray(m.recommended_use_cases)) {
    m.recommended_use_cases.forEach((uc, i) => {
      rows.push(row(
        `models.${slug}.use_case.${i}`,
        surface, location,
        `${m.display_name} is recommended for: ${uc}`,
        "framing", "attribution", primary,
        "recommended_use_cases schema field",
      ));
    });
  }

  // Known limitations — factual / attribution, each carries own source.
  if (Array.isArray(m.known_limitations)) {
    m.known_limitations.forEach((lim, i) => {
      rows.push(row(
        `models.${slug}.limitation.${i}`,
        surface, location,
        `${m.display_name} limitation: ${lim.text.slice(0, 140)}${lim.text.length > 140 ? "..." : ""}`,
        "factual", "attribution", lim.source,
        "known_limitations schema field",
      ));
    });
  }

  // Long-form essay — framing lane, paragraph-level consistency check.
  if (typeof m.long_form === "string" && m.long_form.length > 0) {
    const paras = m.long_form.split(/\n\n/).filter(Boolean);
    paras.forEach((p, i) => {
      rows.push(row(
        `models.${slug}.long_form.${i}`,
        surface, location,
        `${m.display_name} long-form paragraph ${i + 1}: "${p.slice(0, 100)}..."`,
        "framing", "attribution", primary,
        `long_form paragraph; paragraph-level consistency check`,
      ));
    });
  }

  return rows;
}

function main() {
  const text = readFileSync(MODELS_PATH, "utf-8");
  const parsed = yaml.load(text);
  const models = parsed?.models ?? [];

  const ledger = readFileSync(LEDGER_PATH, "utf-8");

  const newRows = [];
  for (const m of models) {
    for (const r of rowsForModel(m)) {
      // Extract the ID (column 2 in the markdown row) and check it's
      // not already in the ledger.
      const id = r.split("|")[1].trim();
      if (ledger.includes(`| ${id} |`)) continue;
      newRows.push(r);
    }
  }

  if (newRows.length === 0) {
    console.log("[extract-models] no new rows to add");
    return;
  }

  // Append at the bottom of the file (preserves existing rows; the
  // ledger format is order-tolerant).
  const out = ledger.replace(/\n+$/, "") + "\n" + newRows.join("\n") + "\n";
  writeFileSync(LEDGER_PATH, out);
  console.log(`[extract-models] appended ${newRows.length} rows to audit/CLAIMS_LEDGER.md`);
}

main();
