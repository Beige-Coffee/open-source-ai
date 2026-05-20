#!/usr/bin/env node
/**
 * Assemble the 9 per-cluster JSON files in scripts/seed/*-batch.json
 * into a single set of new entries and append them to data/models.yaml.
 *
 * Idempotent: skips any slug already present in the YAML, so re-running
 * after editing a JSON only adds new entries (existing ones must be
 * updated via apply-model-extras.mjs or direct YAML edit).
 *
 * Validation: every entry must carry the required fields per the
 * src/lib/models.ts schema. Entries that fail are reported and not
 * appended.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SEED_DIR = resolve(ROOT, "scripts/seed");
const MODELS_PATH = resolve(ROOT, "data/models.yaml");

const REQUIRED = [
  "slug", "display_name", "family", "developer", "developer_country",
  "type", "released_date", "weights_released_date", "openness",
  "license", "osi_approved", "data_released", "training_code_released",
  "training_logs_released", "architecture", "params_total",
  "params_active", "context_window", "attention_variant",
  "position_encoding", "post_training", "sources",
];

const ALLOWED_OPENNESS = new Set(["open", "open-weights", "source-available", "proprietary"]);
const ALLOWED_TYPE = new Set(["base", "instruct", "chat", "reasoning", "code", "vision-language"]);
const ALLOWED_ARCH = new Set(["dense", "moe", "hybrid", "ssm", "unknown"]);
const ALLOWED_ATTN = new Set([
  "mha", "mqa", "gqa", "mla", "sliding-window", "hybrid-gqa-sliding", "linear", "unknown",
]);
const ALLOWED_POS = new Set([
  "rope", "rope-yarn", "rope-llama3", "alibi", "nope", "absolute", "unknown",
]);
const ALLOWED_POST = new Set([
  "sft", "dpo", "rlhf", "rlaif", "constitutional", "grpo", "ppo",
  "kto", "orpo", "rejection-sampling", "rlvr", "online-rl",
  "knowledge-distillation",
]);

function validate(m) {
  const errs = [];
  for (const f of REQUIRED) {
    if (m[f] === undefined || m[f] === null) errs.push(`missing required field: ${f}`);
  }
  if (m.openness && !ALLOWED_OPENNESS.has(m.openness)) errs.push(`bad openness: ${m.openness}`);
  if (m.type && !ALLOWED_TYPE.has(m.type)) errs.push(`bad type: ${m.type}`);
  if (m.architecture && !ALLOWED_ARCH.has(m.architecture)) errs.push(`bad architecture: ${m.architecture}`);
  if (m.attention_variant && !ALLOWED_ATTN.has(m.attention_variant)) errs.push(`bad attention_variant: ${m.attention_variant}`);
  if (m.position_encoding && !ALLOWED_POS.has(m.position_encoding)) errs.push(`bad position_encoding: ${m.position_encoding}`);
  if (Array.isArray(m.post_training)) {
    for (const p of m.post_training) {
      if (!ALLOWED_POST.has(p)) errs.push(`bad post_training value: ${p}`);
    }
  }
  if (!Array.isArray(m.sources) || m.sources.length === 0) errs.push(`sources must be non-empty array`);
  return errs;
}

function dateToISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(dateToISO);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = dateToISO(val);
    return out;
  }
  return v;
}

function main() {
  const yamlText = readFileSync(MODELS_PATH, "utf-8");
  const parsed = yaml.load(yamlText);
  const existingModels = parsed?.models ?? [];
  const existingSlugs = new Set(existingModels.map((m) => m.slug));

  const files = readdirSync(SEED_DIR).filter((f) => f.endsWith("-batch.json")).sort();
  console.log(`[seed-batch-2] found ${files.length} batch files`);

  let totalAdded = 0;
  let totalSkipped = 0;
  let totalRejected = 0;
  const allNew = [];

  for (const file of files) {
    const path = resolve(SEED_DIR, file);
    const text = readFileSync(path, "utf-8");
    let entries;
    try {
      entries = JSON.parse(text);
    } catch (e) {
      console.error(`[seed-batch-2] ${file}: JSON parse error: ${e.message}`);
      continue;
    }
    if (!Array.isArray(entries)) {
      console.error(`[seed-batch-2] ${file}: expected JSON array`);
      continue;
    }

    let added = 0;
    let skipped = 0;
    let rejected = 0;
    for (const m of entries) {
      if (existingSlugs.has(m.slug)) {
        skipped++;
        continue;
      }
      const errs = validate(m);
      if (errs.length > 0) {
        console.error(`[seed-batch-2] ${file}: REJECTED ${m.slug ?? "<no-slug>"}: ${errs.join("; ")}`);
        rejected++;
        continue;
      }
      allNew.push(m);
      existingSlugs.add(m.slug);
      added++;
    }
    console.log(`  ${file}: +${added} new, ${skipped} already present, ${rejected} rejected`);
    totalAdded += added;
    totalSkipped += skipped;
    totalRejected += rejected;
  }

  if (allNew.length === 0) {
    console.log(`[seed-batch-2] nothing to add (total: +0 new, ${totalSkipped} present, ${totalRejected} rejected)`);
    return;
  }

  const merged = [...existingModels, ...allNew].map(dateToISO);
  const yamlOut = yaml.dump({ models: merged }, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });

  // Preserve the header comment block.
  const leadComment = yamlText.match(/^([\s\S]*?)^models:\s*$/m);
  const header = leadComment ? leadComment[1] : "# Models catalog.\n";
  writeFileSync(MODELS_PATH, header + "models:\n" + yamlOut.replace(/^models:\n/, ""));

  console.log(`[seed-batch-2] appended ${totalAdded} new entries (${totalSkipped} already present, ${totalRejected} rejected)`);
}

main();
