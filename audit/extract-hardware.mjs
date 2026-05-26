#!/usr/bin/env node
/**
 * Extract checkable claims from data/hardware.yaml and
 * data/hardware-benchmarks.yaml into CLAIMS_LEDGER.md rows. Idempotent:
 * an id already present is skipped, so re-running after adding hardware
 * only appends new rows.
 *
 * Claim id conventions:
 *   hardware.<slug>.memory_capacity_gb
 *   hardware.<slug>.memory_bandwidth_gbs
 *   hardware.<slug>.compute.fp16_dense_tflops
 *   hardware.<slug>.compute.fp8_dense_tflops
 *   hardware.<slug>.compute.fp4_dense_tflops
 *   hardware.<slug>.compute.int8_dense_tops
 *   hardware.<slug>.power_w
 *   hardware.<slug>.npu_int8_tops
 *   hardware.<slug>.release_date
 *   hwbench.<model>__<hardware>__<quant>__<runtime>.decode_tok_s
 *
 * All rows start needs_verification; the existing audit:verify pipeline
 * takes them through entailment against the snapshot store.
 *
 * Usage: node audit/extract-hardware.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HW_PATH = resolve(ROOT, "data/hardware.yaml");
const BENCH_PATH = resolve(ROOT, "data/hardware-benchmarks.yaml");
const LEDGER_PATH = resolve(ROOT, "audit/CLAIMS_LEDGER.md");

function toISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "");
}

function row(id, surface, location, claim, lane, type, source, notes = "") {
  const safe = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return `| ${id} | ${surface} | ${location} | ${safe(claim)} | ${lane} | ${type} | ${source} | needs_verification |  | ${safe(notes)} |`;
}

function rowsForHardware(h) {
  const slug = h.slug;
  const surface = "yaml-hardware";
  const loc = `data/hardware.yaml (record=${slug})`;
  const src = h.sources?.[0]?.url ?? h.url ?? "";
  const rows = [];

  rows.push(row(`hardware.${slug}.memory_capacity_gb`, surface, loc,
    `${h.name} has ${h.memory_capacity_gb} GB of ${h.memory_type} memory per unit`,
    "factual", "amount", src, "memory_capacity_gb schema field"));

  rows.push(row(`hardware.${slug}.memory_bandwidth_gbs`, surface, loc,
    `${h.name} has ${h.memory_bandwidth_gbs} GB/s of memory bandwidth per unit`,
    "factual", "amount", src, "memory_bandwidth_gbs schema field"));

  if (h.compute) {
    for (const [k, v] of Object.entries(h.compute)) {
      if (typeof v !== "number") continue;
      const unit = k.includes("tops") ? "TOPS" : "TFLOPS";
      rows.push(row(`hardware.${slug}.compute.${k}`, surface, loc,
        `${h.name} delivers ${v} dense ${unit} (${k.replace(/_dense.*/, "").toUpperCase()})`,
        "factual", "amount", src, `compute.${k} schema field (dense)`));
    }
  }

  if (typeof h.power_w === "number") {
    rows.push(row(`hardware.${slug}.power_w`, surface, loc,
      `${h.name} has a ${h.power_w} W power envelope per unit`,
      "factual", "amount", src, "power_w schema field"));
  }

  if (typeof h.npu_int8_tops === "number") {
    rows.push(row(`hardware.${slug}.npu_int8_tops`, surface, loc,
      `${h.name} has an NPU rated at ${h.npu_int8_tops} INT8 TOPS`,
      "factual", "amount", src, "npu_int8_tops schema field"));
  }

  if (h.release_date) {
    rows.push(row(`hardware.${slug}.release_date`, surface, loc,
      `${h.name} was released in ${toISO(h.release_date)}`,
      "factual", "date", src, "release_date schema field"));
  }

  return rows;
}

function benchId(b) {
  return `hwbench.${b.model_slug}__${b.hardware_slug}__${b.quant}__${b.runtime}`;
}

function rowsForBenchmark(b) {
  const surface = "yaml-hardware-bench";
  const loc = `data/hardware-benchmarks.yaml`;
  const src = b.source ?? "";
  const units = b.num_units > 1 ? `${b.num_units}x ` : "";
  const ctx = b.context_length ? ` at ${b.context_length} context` : "";
  return [row(
    `${benchId(b)}.decode_tok_s`,
    surface, loc,
    `${b.model_slug} on ${units}${b.hardware_slug} at ${b.quant} (${b.runtime}, batch ${b.batch}) decodes ${b.decode_tok_s} tokens/sec${ctx}`,
    "factual", "benchmark", src,
    `hardware-benchmarks measured anchor${b.via ? ` via ${b.via}` : ""}${b.notes ? `; ${b.notes}` : ""}`,
  )];
}

function main() {
  const hw = (yaml.load(readFileSync(HW_PATH, "utf-8"))?.hardware) ?? [];
  const bench = existsSync(BENCH_PATH)
    ? (yaml.load(readFileSync(BENCH_PATH, "utf-8"))?.benchmarks ?? [])
    : [];

  const ledger = readFileSync(LEDGER_PATH, "utf-8");
  const newRows = [];

  for (const h of hw) {
    for (const r of rowsForHardware(h)) {
      const id = r.split("|")[1].trim();
      if (ledger.includes(`| ${id} |`)) continue;
      newRows.push(r);
    }
  }
  for (const b of bench) {
    for (const r of rowsForBenchmark(b)) {
      const id = r.split("|")[1].trim();
      if (ledger.includes(`| ${id} |`)) continue;
      newRows.push(r);
    }
  }

  if (newRows.length === 0) {
    console.log("[extract-hardware] no new rows to add");
    return;
  }
  const out = ledger.replace(/\n+$/, "") + "\n" + newRows.join("\n") + "\n";
  writeFileSync(LEDGER_PATH, out);
  console.log(`[extract-hardware] appended ${newRows.length} rows to audit/CLAIMS_LEDGER.md`);
}

main();
