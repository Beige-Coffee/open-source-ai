#!/usr/bin/env node
/**
 * Build public/data/models-verification.json from audit/CLAIMS_LEDGER.md.
 *
 * Maps each model slug to a record of field → verdict, where field is
 * one of the canonical row keys minted by audit/extract-models.mjs:
 *   released_date, params_total, params_active, context_window,
 *   experts, pretraining_tokens, bench.<slug>, cost.input,
 *   cost.output, speed.output_tps, speed.ttft, lineage.parent,
 *   lineage.child.<i>, innovation.<i>, reception.<i>, use_case.<i>,
 *   limitation.<i>, long_form.<i>.
 *
 * Output shape:
 *   {
 *     "<slug>": {
 *       "released_date": "supported",
 *       "params_total": "unsupported",
 *       "bench.mmlu": "supported",
 *       ...
 *     },
 *     ...
 *   }
 *
 * The /models page consumes this and renders cells as "—" unless the
 * verdict is in the PASS set (supported / consistent / still_supported).
 *
 * Pre-push gate verdicts that count as verified for display purposes:
 *   - supported: directly entailed by snapshot
 *   - consistent: framing claim, consistency-checked (rare for models)
 *   - still_supported: re-verified in a later cycle
 *   - pending_horizon: prediction; not factual yet (rare for models)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LEDGER = resolve(ROOT, "audit/CLAIMS_LEDGER.md");
const OUT = resolve(ROOT, "public/data/models-verification.json");

const lines = readFileSync(LEDGER, "utf8").split("\n");

const out = {};
for (const line of lines) {
  if (!line.startsWith("|")) continue;
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 10) continue;
  const id = cells[0];
  const verdict = cells[7];
  if (!id.startsWith("models.")) continue;
  // models.<slug>.<rest...>
  const rest = id.slice("models.".length);
  const dotIdx = rest.indexOf(".");
  if (dotIdx < 0) continue;
  const slug = rest.slice(0, dotIdx);
  const field = rest.slice(dotIdx + 1);
  if (!out[slug]) out[slug] = {};
  out[slug][field] = verdict;
}

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  `[build-verification-map] wrote ${OUT} (${Object.keys(out).length} models)`,
);
