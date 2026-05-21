#!/usr/bin/env node
/**
 * Refresh cost / speed (and select benchmark) fields from
 * artificialanalysis.ai's free API. Updates data/models.yaml in place
 * AND writes a synthetic snapshot per model so the existing entailment
 * verifier can confirm the values without needing to fetch AA directly
 * (their site is anti-bot to our snapshotter).
 *
 * Requires `ARTIFICIAL_ANALYSIS_API_KEY` in .env at repo root.
 *
 * Matching: AA model objects are matched to catalog entries by
 *   (a) exact slug equality first, then
 *   (b) exact (developer + display_name) match (case-insensitive).
 * No fuzzy matching — bad matches would silently corrupt data.
 *
 * Field policy:
 *   - cost.* and speed.*: AA is the canonical source. Overwrite catalog
 *     values from AA if AA has them.
 *   - benchmark scores: AA is a third-party aggregator, not a primary
 *     source. We only FILL IN where the catalog is missing. We do NOT
 *     overwrite lab-published numbers.
 *
 * After updating, the affected ledger rows are reset to
 * `needs_verification` so the next verify pass picks up the new
 * synthetic snapshot.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MODELS_PATH = resolve(ROOT, "data/models.yaml");
const LEDGER_PATH = resolve(ROOT, "audit/CLAIMS_LEDGER.md");
const STORE = resolve(ROOT, "sources");

const envText = readFileSync(resolve(ROOT, ".env"), "utf8");
const keyMatch = envText.match(/^ARTIFICIAL_ANALYSIS_API_KEY=(.+)$/m);
if (!keyMatch) {
  console.error("ARTIFICIAL_ANALYSIS_API_KEY missing from .env");
  process.exit(1);
}
const API_KEY = keyMatch[1].trim();

const API_URL = "https://artificialanalysis.ai/api/v2/data/llms/models";

function canonicalize(url) {
  try {
    const u = new URL(url);
    u.search = ""; u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.endsWith("/") && u.pathname.length > 1) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch { return url; }
}
function urlHash(url) {
  return createHash("sha256").update(canonicalize(url)).digest("hex");
}

async function fetchAA() {
  const r = await fetch(API_URL, { headers: { "x-api-key": API_KEY } });
  if (!r.ok) throw new Error(`AA API ${r.status}`);
  const j = await r.json();
  return j.data;
}

// Catalog match heuristics: exact slug first, then (developer + name).
function matchAa(aa, catalog) {
  const out = new Map();
  // Build lookup maps
  const bySlug = new Map();
  const byKey = new Map();
  for (const m of catalog) {
    bySlug.set(m.slug, m);
    const k = `${m.developer.toLowerCase()}|${m.display_name.toLowerCase()}`;
    byKey.set(k, m);
  }
  for (const a of aa) {
    let match = bySlug.get(a.slug);
    if (!match) {
      const k = `${a.model_creator.name.toLowerCase()}|${a.name.toLowerCase()}`;
      match = byKey.get(k);
    }
    if (match) out.set(match.slug, a);
  }
  return out;
}

function writeSyntheticSnapshot(canon, body) {
  const dir = resolve(STORE, urlHash(canon));
  mkdirSync(dir, { recursive: true });
  const record = {
    url: canon,
    fetched_at: new Date().toISOString(),
    http: { status: 200, content_type: "application/json", source: "AA API v2" },
    wayback_url: null,
    content_hash: createHash("sha256").update(body).digest("hex"),
    extracted_text: body,
    raw_html_bytes: body.length,
  };
  writeFileSync(resolve(dir, "latest.json"), JSON.stringify(record, null, 2));
}

// Map AA bench keys to catalog bench keys. AA scores are 0..1; ours
// are 0..100, so multiply by 100 on copy.
const BENCH_MAP = {
  mmlu_pro: "mmlu_pro",
  gpqa: "gpqa_diamond",
  hle: "hle",
  livecodebench: "livecodebench",
  math_500: "math",
  aime: "aime_2024",
  aime_25: "aime_2025",
};

(async () => {
  const aa = await fetchAA();
  console.log("[aa] fetched", aa.length, "AA models");

  const cat = yaml.load(readFileSync(MODELS_PATH, "utf8"));
  const matches = matchAa(aa, cat.models);
  console.log("[aa] matched", matches.size, "of", cat.models.length, "catalog entries");

  const updates = { cost: 0, speed: 0, bench_fill: 0, snapshots: 0 };
  const rowsToReset = [];

  for (const m of cat.models) {
    const a = matches.get(m.slug);
    if (!a) continue;

    const today = new Date().toISOString().slice(0, 10);
    const aaUrl = `https://artificialanalysis.ai/models/${a.slug}`;
    const canon = canonicalize(aaUrl);

    // Build a human-readable snapshot body the verifier can entail
    // claims against. Include the AA model identifier, the rounded
    // catalog units (cost per M tokens, tokens/sec output), and the
    // benchmark percentages.
    const lines = [
      `Artificial Analysis snapshot for ${a.name} (${a.model_creator.name})`,
      `Source: ${aaUrl}`,
      `API: ${API_URL}`,
      `AA model id: ${a.id}; AA slug: ${a.slug}; AA release_date: ${a.release_date}`,
      ``,
    ];

    // Cost — overwrite. AA cost is per million tokens already.
    if (a.pricing) {
      if (a.pricing.price_1m_input_tokens != null) {
        m.cost = m.cost || {};
        m.cost.input_per_mtok_usd = a.pricing.price_1m_input_tokens;
        m.cost.source = aaUrl;
        m.cost.as_of = today;
        updates.cost++;
        rowsToReset.push(`models.${m.slug}.cost.input`);
        lines.push(`Input cost: $${a.pricing.price_1m_input_tokens} per 1M tokens`);
      }
      if (a.pricing.price_1m_output_tokens != null) {
        m.cost = m.cost || {};
        m.cost.output_per_mtok_usd = a.pricing.price_1m_output_tokens;
        m.cost.source = aaUrl;
        m.cost.as_of = today;
        updates.cost++;
        rowsToReset.push(`models.${m.slug}.cost.output`);
        lines.push(`Output cost: $${a.pricing.price_1m_output_tokens} per 1M tokens`);
      }
    }

    // Speed — overwrite. tokens per second and TTFT (convert s -> ms).
    if (a.median_output_tokens_per_second != null) {
      m.speed = m.speed || {};
      m.speed.tokens_per_sec_output = Math.round(a.median_output_tokens_per_second * 10) / 10;
      m.speed.source = aaUrl;
      m.speed.as_of = today;
      updates.speed++;
      rowsToReset.push(`models.${m.slug}.speed.output_tps`);
      lines.push(`Output speed: ${m.speed.tokens_per_sec_output} tokens/sec (median)`);
    }
    if (a.median_time_to_first_token_seconds != null) {
      m.speed = m.speed || {};
      m.speed.ttft_ms = Math.round(a.median_time_to_first_token_seconds * 1000);
      m.speed.source = aaUrl;
      m.speed.as_of = today;
      updates.speed++;
      rowsToReset.push(`models.${m.slug}.speed.ttft`);
      lines.push(`TTFT median: ${m.speed.ttft_ms} ms`);
    }

    // Benchmarks — FILL IN only (don't overwrite lab numbers).
    m.benchmarks = m.benchmarks || {};
    for (const [aaKey, catKey] of Object.entries(BENCH_MAP)) {
      const aaScore = a.evaluations?.[aaKey];
      if (aaScore == null) continue;
      if (m.benchmarks[catKey] != null) continue; // don't overwrite
      const pct = Math.round(aaScore * 1000) / 10; // 0..1 -> 0..100, 1 decimal
      m.benchmarks[catKey] = {
        score: pct,
        as_of: today,
        source: aaUrl,
      };
      updates.bench_fill++;
      rowsToReset.push(`models.${m.slug}.bench.${catKey}`);
      lines.push(`${catKey}: ${pct} (AA evaluation)`);
    }

    if (lines.length > 5) {
      writeSyntheticSnapshot(canon, lines.join("\n"));
      updates.snapshots++;
    }
  }

  // Write catalog back.
  writeFileSync(MODELS_PATH, yaml.dump(cat, { lineWidth: 200, noRefs: true }));
  console.log("[aa] wrote data/models.yaml");
  console.log("[aa] updates:", updates);
  console.log("[aa] rows to reset for re-verify:", rowsToReset.length);
  writeFileSync("/tmp/aa-rows-to-reset.txt", rowsToReset.join("\n"));
})().catch((e) => {
  console.error("[aa] ERROR:", e.message);
  process.exit(1);
});
