#!/usr/bin/env node
/**
 * Build the per-cell verification maps from audit/CLAIMS_LEDGER.md.
 *
 * Each ledger row id is namespaced by its first dotted segment:
 *   models.<slug>.<field>            -> public/data/models-verification.json
 *   hardware.<slug>.<field>          -> public/data/hardware-verification.json
 *   hwbench.<benchKey>.<field>       -> public/data/hardware-bench-verification.json
 *
 * Output shape (all three):
 *   { "<key>": { "<field>": "<verdict>", ... }, ... }
 *
 * Pages render a value only when its verdict is in the PASS set
 * (supported / consistent / still_supported / pending_horizon); anything
 * else renders the em-dash placeholder. The render-side gate lives in the
 * pages (see the `verified()` helper); this script only projects the
 * ledger into the lookup maps.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LEDGER = resolve(ROOT, "audit/CLAIMS_LEDGER.md");

const OUTPUTS = {
  "models.": resolve(ROOT, "public/data/models-verification.json"),
  "hardware.": resolve(ROOT, "public/data/hardware-verification.json"),
  "hwbench.": resolve(ROOT, "public/data/hardware-bench-verification.json"),
};

const maps = Object.fromEntries(Object.keys(OUTPUTS).map((p) => [p, {}]));

const lines = readFileSync(LEDGER, "utf8").split("\n");
for (const line of lines) {
  if (!line.startsWith("|")) continue;
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 10) continue;
  const id = cells[0];
  const verdict = cells[7];

  const prefix = Object.keys(OUTPUTS).find((p) => id.startsWith(p));
  if (!prefix) continue;

  const rest = id.slice(prefix.length);
  // hwbench keys embed the runtime (e.g. "llama.cpp"), which contains a
  // dot, so the field is the LAST dotted segment. For models./hardware.
  // the key is a single slug and the field may itself be dotted
  // (e.g. "bench.mmlu", "compute.fp16_dense_tflops"), so split on the first.
  const dotIdx = prefix === "hwbench." ? rest.lastIndexOf(".") : rest.indexOf(".");
  if (dotIdx < 0) continue;
  const key = rest.slice(0, dotIdx);
  const field = rest.slice(dotIdx + 1);
  const map = maps[prefix];
  if (!map[key]) map[key] = {};
  map[key][field] = verdict;
}

for (const [prefix, out] of Object.entries(OUTPUTS)) {
  writeFileSync(out, JSON.stringify(maps[prefix], null, 2));
  console.log(
    `[build-verification-map] wrote ${out} (${Object.keys(maps[prefix]).length} ${prefix.replace(".", "")} keys)`,
  );
}
