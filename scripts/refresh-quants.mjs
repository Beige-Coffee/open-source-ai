#!/usr/bin/env node
/**
 * Quant-availability drift check. For every model that carries a
 * `quantizations_source` (its Hugging Face base repo), re-query the HF Hub
 * model tree, re-derive the available format families, and diff against the
 * `quantizations_available` currently in data/models.yaml.
 *
 * Community quantizations grow over time (new GGUF/AWQ/EXL2 repos appear),
 * so this catches both additions and removals. Like every other routine,
 * it does NOT edit the canonical YAML: drift is appended to
 * data/inbox/quants-needs-review.jsonl for human review, and promotion to
 * models.yaml (which then re-routes through extract + verify) is manual.
 *
 * Usage: node scripts/refresh-quants.mjs   (add --quiet to suppress the
 * per-model table). Network-bound; not part of prebuild.
 */
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "oss-ai-stack-audit/1.0";
const QUIET = process.argv.includes("--quiet");
const ORDER = ["gguf", "awq", "gptq", "exl2", "mlx", "fp8", "bnb"];

async function api(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.status === 429) { await new Promise((x) => setTimeout(x, 1500)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await new Promise((x) => setTimeout(x, 800)); }
  }
  return null;
}

function classify(derivs) {
  const fams = new Set();
  for (const d of derivs) {
    const t = (d.tags || []).join(" ").toLowerCase() + " " + d.id.toLowerCase();
    if (t.includes("gguf")) fams.add("gguf");
    if (t.includes("awq")) fams.add("awq");
    if (t.includes("gptq")) fams.add("gptq");
    if (t.includes("exl2") || t.includes("exllama")) fams.add("exl2");
    if (t.includes("mlx")) fams.add("mlx");
    if (t.includes("fp8")) fams.add("fp8");
    if (t.includes("bitsandbytes") || t.includes("nf4") || /\bbnb\b/.test(t)) fams.add("bnb");
  }
  return ORDER.filter((f) => fams.has(f));
}

const repoFromSource = (url) => {
  const m = String(url).match(/huggingface\.co\/([^/]+\/[^/?#]+)/);
  return m ? m[1] : null;
};

const models = yaml.load(readFileSync(resolve(ROOT, "data/models.yaml"), "utf8")).models ?? [];
const targets = models.filter((m) => m.quantizations_source && repoFromSource(m.quantizations_source));

console.log(`[refresh-quants] checking ${targets.length} models with a quantizations_source`);

const drift = [];
let n = 0;
const queue = [...targets];
async function worker() {
  while (queue.length) {
    const m = queue.shift();
    const repo = repoFromSource(m.quantizations_source);
    const tree = await api(`https://huggingface.co/api/models?filter=base_model:quantized:${repo}&limit=300`);
    n++;
    if (tree == null) {
      if (!QUIET) console.log(`  ? ${m.slug.padEnd(32)} ${repo} (source unreachable)`);
      drift.push({ slug: m.slug, repo, issue: "source_unreachable", checked_at: new Date().toISOString() });
      continue;
    }
    const discovered = classify(tree);
    const current = ORDER.filter((f) => (m.quantizations_available || []).includes(f));
    const added = discovered.filter((f) => !current.includes(f));
    const removed = current.filter((f) => !discovered.includes(f));
    if (added.length || removed.length) {
      drift.push({ slug: m.slug, repo, current, discovered, added, removed, checked_at: new Date().toISOString() });
      if (!QUIET) console.log(`  ~ ${m.slug.padEnd(32)} +[${added.join(",")}] -[${removed.join(",")}]`);
    }
  }
}
await Promise.all(Array.from({ length: 5 }, worker));

if (drift.length === 0) {
  console.log(`[refresh-quants] no drift across ${n} models; data/models.yaml is current`);
} else {
  const inbox = resolve(ROOT, "data/inbox");
  mkdirSync(inbox, { recursive: true });
  const out = resolve(inbox, "quants-needs-review.jsonl");
  for (const d of drift) appendFileSync(out, JSON.stringify(d) + "\n");
  console.log(`[refresh-quants] ${drift.length} model(s) drifted; appended to data/inbox/quants-needs-review.jsonl for review`);
  console.log(`[refresh-quants] to apply: update quantizations_available in data/models.yaml, then run npm run audit:extract:models and re-verify the new quant rows`);
}
