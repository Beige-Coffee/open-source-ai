#!/usr/bin/env node
/**
 * Layer 1: link-liveness check for every primary `url` field on
 * every YAML entry. HEAD request only; does not download body.
 *
 * Why not Lychee (the recommended tool):
 * - Lychee is a separate Rust binary, friction to install.
 * - Our URL set is bounded (~250 URLs across all data files) and
 *   HEAD is fast.
 * - The trade-off becomes worth Lychee when we have ~5K+ URLs.
 *
 * Cadence: skip by default during prebuild (network calls are too
 * slow for every commit); run via `npm run audit:links` or in the
 * weekly Layer 2 scheduled routine.
 *
 * Exit 0 on clean (every URL returned a 2xx or 3xx),
 * exit 1 on any 4xx / 5xx / network failure.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const SNAPSHOT_DIR = resolve(ROOT, "sources");
mkdirSync(SNAPSHOT_DIR, { recursive: true });

function loadYaml(rel) {
  return yaml.load(readFileSync(resolve(ROOT, rel), "utf8"));
}

const targets = [];

// Funders
for (const f of loadYaml("data/funders.yaml").funders) {
  targets.push({ url: f.url, where: `funders:${f.slug}.url` });
  for (const s of f.sources || []) {
    targets.push({ url: s.url, where: `funders:${f.slug}.sources` });
  }
}
// Grants
for (const g of loadYaml("data/grants.yaml").grants) {
  targets.push({ url: g.url, where: `grants:"${g.title.slice(0, 40)}".url` });
  for (const s of g.sources || []) {
    targets.push({ url: s.url, where: `grants:"${g.title.slice(0, 40)}".sources` });
  }
}
// Projects
for (const p of loadYaml("data/projects.yaml").projects) {
  targets.push({ url: p.url, where: `projects:${p.slug}.url` });
  if (p.github) {
    targets.push({ url: p.github, where: `projects:${p.slug}.github` });
  }
  for (const s of p.sources || []) {
    targets.push({ url: s.url, where: `projects:${p.slug}.sources` });
  }
}
// Readings
for (const r of loadYaml("data/reading-lists.yaml").readings) {
  if (r.url.startsWith("http")) {
    targets.push({ url: r.url, where: `readings:"${r.title.slice(0, 40)}".url` });
  }
}

// Dedup by URL.
const byUrl = new Map();
for (const t of targets) {
  if (!byUrl.has(t.url)) byUrl.set(t.url, []);
  byUrl.get(t.url).push(t.where);
}

console.log(`[verify_links] checking ${byUrl.size} unique URLs (${targets.length} total references)`);

// Limit concurrency. ~10 parallel HEADs is fine.
const CONCURRENCY = 10;
const HEAD_TIMEOUT_MS = 8000;

const failures = [];
let checked = 0;
const urls = Array.from(byUrl.keys());

async function checkOne(url) {
  const wheres = byUrl.get(url);
  const ctrl = new AbortController();
  const timeoutHandle = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
  try {
    let res;
    try {
      res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": "open-source-ai-stack-audit/1.0" },
      });
    } catch (e) {
      // Some servers reject HEAD; fall back to a GET with a short
      // range request to avoid downloading the whole body.
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          "User-Agent": "open-source-ai-stack-audit/1.0",
          Range: "bytes=0-1023",
        },
      });
    }
    clearTimeout(timeoutHandle);
    if (res.status >= 400) {
      failures.push({ url, status: res.status, wheres });
    }
  } catch (e) {
    clearTimeout(timeoutHandle);
    failures.push({ url, status: "fetch-error", wheres, error: String(e.message ?? e) });
  }
  checked++;
  if (checked % 25 === 0) {
    console.log(`[verify_links] ${checked}/${urls.length} done, ${failures.length} failure(s) so far`);
  }
}

async function runPool() {
  const queue = [...urls];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const url = queue.shift();
      if (url) await checkOne(url);
    }
  });
  await Promise.all(workers);
}

await runPool();

if (failures.length === 0) {
  console.log(`[verify_links] clean: ${urls.length} URLs ok`);
  process.exit(0);
}

console.error(`\n[verify_links] ${failures.length} failure(s):\n`);
for (const f of failures) {
  console.error(`  ${f.url}  status=${f.status}${f.error ? "  " + f.error : ""}`);
  for (const w of f.wheres) console.error(`    referenced by ${w}`);
}
process.exit(1);
